import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// Web slice 4, RENT-FE-001 flow 3 « charge reconciliation » under tenure's
// CSP: a syndic statement imported as draft lines (the syndic's split kept,
// one overridden), confirmed, the exercise allocated to the lease, balances,
// a new provision applied and the settlement chosen line by line (If-Match),
// the RG statement issued, then the reconciliation cancelled with a reason.
// Plus the accountant's read-only ledger.

interface Req { method: string; path: string; csrf?: string; ifMatch?: string; body?: Record<string, unknown> }
const requests = async (page: Page): Promise<Req[]> => (await page.request.get('/__mock/requests')).json()
const owner = '00000000-0000-7000-8000-000000000001'
const csv = { name: 'decompte-2025.csv', mimeType: 'text/csv', buffer: Buffer.from('Libellé;Montant;Récupérable\nEau froide;412,30;412,30\n') }

async function mock(page: Page, state: Record<string, unknown> = {}): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', {
    data: {
      assets: [{ id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', version: 1, shares: [{ owner_id: owner, bp: 10000 }] }],
      tenants: [{ id: 't1', names: ['Jeanne Martin'], version: 1 }],
      leases: [{ id: 'l1', kind: 'unfurnished', state: 'active', asset_ids: ['a1'], tenants: [{ tenant_id: 't1' }], start_on: '2025-01-01', term_months: 36, rent_cents: 80000, provision_cents: 5000, due_day: 5, version: 2 }],
      // What the CSV holds, the mock being unable to read an upload.
      syndicRows: [
        { label: 'Eau froide', amount: 41230, recoverable: 41230 },
        { label: 'Honoraires syndic', amount: 105000, recoverable: 0 },
        { label: 'Ascenseur', amount: 30000, recoverable: 24000 },
      ],
      ...state,
    },
  })
}

test('flow 3: a syndic statement imported, reconciled, issued, then corrected', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/charges?asset=a1&year=2025')
  await expect(page.getByTestId('charges-empty')).toContainText('2025')

  // Import: the usual French columns are proposed; a wrong one imports nothing.
  await page.getByTestId('import').click()
  await expect(page.locator('#im_label')).toHaveValue('Libellé')
  await expect(page.locator('#im_on')).toHaveValue('31/12/2025')
  await page.getByTestId('file-im_csv').setInputFiles(csv)
  await page.locator('#im_label').fill('Intitulé')
  await page.getByTestId('run-import').click()
  await expect(page.getByTestId('import-error')).toContainText('ne peut pas être lu')
  await page.locator('#im_label').fill('Libellé')
  await page.getByTestId('run-import').click()
  await expect(page.getByTestId('import-dialog')).toBeHidden()
  await expect(page).toHaveURL(/status=draft/)
  await expect(page.getByTestId('charge-status')).toHaveText(['Brouillon', 'Brouillon', 'Brouillon'])
  await expect(page.getByTestId('drafts-warning')).toContainText('3 charge(s)')
  const imp = (await requests(page)).filter((r) => r.path === '/charges/import/syndic').at(-1)
  expect(imp?.body).toMatchObject({ asset_id: 'a1', exercise_year: 2025, charged_on: '2025-12-31', mapping: { label: 'Libellé', amount: 'Montant', recoverable: 'Récupérable', delimiter: ';' } })
  const up = (await requests(page)).find((r) => r.method === 'POST' && r.path === '/documents')
  expect(up?.body).toMatchObject({ class: 'supporting', asset_id: 'a1', file: 'decompte-2025.csv' })

  // A reconciliation cannot start while lines are drafts.
  await expect(page.getByTestId('start-recon')).toBeDisabled()

  // Override the lift's recoverable part; the syndic's split stays in view.
  await page.getByTestId('charge-label').filter({ hasText: 'Ascenseur' }).click()
  await expect(page.getByTestId('charge-dialog')).toContainText(/Syndic : 240,00\s€/)
  await page.locator('#ch_recoverable').fill('300')
  await page.locator('#ch_recoverable').blur()
  await page.getByTestId('confirm-charge').click()
  await expect(page.getByTestId('charge-dialog')).toBeHidden()
  const put = (await requests(page)).filter((r) => r.method === 'PUT' && r.path.startsWith('/charges/')).at(-1)
  expect(put?.body).toMatchObject({ recoverable_cents: 30000, status: 'confirmed' })
  expect(put?.ifMatch).toBe('W/"1"')
  for (const label of ['Eau froide', 'Honoraires syndic']) {
    await page.getByTestId('charge-label').filter({ hasText: label }).click()
    await page.getByTestId('confirm-charge').click()
    await expect(page.getByTestId('charge-dialog')).toBeHidden()
  }
  await page.locator('#f_status').click()
  await page.getByRole('option', { name: 'Tous' }).click()
  await expect(page.getByTestId('charge-status')).toHaveText(['Validée', 'Validée', 'Validée'])
  await expect(page.getByTestId('charges-totals')).toContainText(/Récupérable 712,30\s€/)

  // Start the exercise's reconciliation: the calendar year is proposed.
  await page.getByTestId('start-recon').click()
  await expect(page.locator('#ex_start')).toHaveValue('01/01/2025')
  await expect(page.locator('#ex_end')).toHaveValue('31/12/2025')
  await page.getByTestId('confirm').click()
  await expect(page).toHaveURL(/\/reconciliations\/[^/?]+$/)
  await expect(page.getByTestId('recon-state')).toHaveText('brouillon')
  await expect(page.getByTestId('recon-recoverable')).toHaveText(/712,30\s€/)
  await expect(page.getByTestId('step-allocation')).toBeDisabled()

  // Allocate: the lease covers the whole exercise.
  await page.getByTestId('allocate').click()
  await expect(page).toHaveURL(/step=allocation/)
  await expect(page.getByTestId('recon-state')).toHaveText('répartie')
  await expect(page.getByTestId('allocation-line')).toContainText('365 / 365')
  await expect(page.getByTestId('allocation-line')).toContainText(/712,30\s€/)
  await expect(page.getByTestId('summary-rail')).toContainText('01/01/2025 – 31/12/2025')

  // Balances: 12 × 50 € collected against 712,30 €.
  await page.getByTestId('next').click()
  await expect(page.getByTestId('balance-line')).toContainText(/600,00\s€/)
  await expect(page.getByTestId('balance')).toHaveText(/Le locataire doit 112,30\s€/)

  // Provisions: proposed rounded up to the euro, applied, saved with If-Match.
  await page.getByTestId('next').click()
  const line = page.getByTestId('provision-line')
  await expect(line).toContainText(/Proposée : 60,00\s€/)
  await line.locator('input[type=checkbox]').check()
  await expect.poll(async () => (await requests(page)).filter((r) => r.method === 'PUT' && r.path.includes('/lines/')).length).toBe(1)
  await line.locator('.p-select').click()
  await page.getByRole('option', { name: 'Sur le dépôt de garantie' }).click()
  await expect(page.getByTestId('recon-error')).toContainText('n’est pas possible pour ce bail')
  const lines = (await requests(page)).filter((r) => r.method === 'PUT' && r.path.includes('/lines/'))
  expect(lines.map((r) => r.ifMatch)).toEqual(['W/"1"', 'W/"2"'])
  expect(lines[0]?.body).toMatchObject({ apply_provision: true, new_provision_cents: 6000, settlement: 'fee' })

  // Back never loses a choice.
  await page.getByTestId('back').click()
  await page.getByTestId('next').click()
  await expect(line.locator('input[type=checkbox]')).toBeChecked()

  // Issue: exactly what will be written, then the statement.
  await page.getByTestId('next').click()
  await expect(page.getByTestId('to-write')).toContainText(/Provision portée à 60,00\s€/)
  await expect(page.getByTestId('to-write')).toContainText('Sur le prochain appel de loyer')
  await page.getByTestId('issue-recon').click()
  await expect(page.getByTestId('confirm-dialog')).toContainText('1 décompte(s)')
  await page.getByTestId('confirm').click()
  await expect(page.getByTestId('recon-state')).toHaveText('émise')
  await expect(page.getByTestId('statements')).toContainText('RG-00000001-2026-0001')
  await expect(page.getByTestId('download')).toHaveCount(1)

  // An issued line is read only.
  await page.getByTestId('step-provisions').click()
  await expect(line.locator('input[type=checkbox]')).toBeDisabled()

  // Correct: cancel with a reason.
  await page.getByTestId('step-issue').click()
  await page.getByTestId('cancel-recon').click()
  await expect(page.getByTestId('confirm')).toBeDisabled()
  await page.locator('#recon_reason').fill('Décompte du syndic rectifié')
  await page.getByTestId('confirm').click()
  await expect(page.getByTestId('recon-state')).toHaveText('annulée')
  await expect(page.getByTestId('recon-cancelled')).toContainText('AN-00000001-2026-0001')
  const cancel = (await requests(page)).filter((r) => r.path.endsWith('/transitions')).at(-1)
  expect(cancel?.body).toEqual({ action: 'cancel', reason: 'Décompte du syndic rectifié' })
  expect(cancel?.csrf).toBe('csrf-test-token')

  // The asset hub shows the same ledger.
  await page.goto('/assets/a1/charges?year=2025')
  await expect(page.getByTestId('charge-label')).toHaveCount(3)
  expect(violations).toEqual([])
})

test('an accountant reads the charges ledger with no write control', async ({ page }) => {
  await mock(page, {
    role: 'accountant',
    charges: [{ id: 'c1', asset_id: 'a1', category: 'property_tax', label: 'Taxe foncière 2025', amount_cents: 98000, recoverable_cents: 0, charged_on: '2025-10-15', exercise_year: 2025, status: 'confirmed', source: 'manual', version: 1 }],
  })
  const violations = await watchCSP(page)
  await page.goto('/charges?asset=a1&year=2025')
  await expect(page.getByTestId('charge-label')).toHaveText(['Taxe foncière 2025'])
  for (const id of ['import', 'add-charge', 'start-recon']) await expect(page.getByTestId(id)).toHaveCount(0)
  await page.getByTestId('charge-label').click()
  await expect(page.getByTestId('charge-dialog')).toHaveCount(0)
  expect(violations).toEqual([])
})
