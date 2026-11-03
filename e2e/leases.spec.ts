import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// Web slice 2, RENT-FE-001 flow 1 « lease to activation » under tenure's CSP:
// draft with a new tenant → blockers → DPE → contract → guarantees → signed
// copy and entry inventory → activate → notice → end → close refused until
// the deposit is settled. Plus the accountant's read-only view.

interface Req { method: string; path: string; csrf?: string; ifMatch?: string; body?: Record<string, unknown> }
const requests = async (page: Page): Promise<Req[]> => (await page.request.get('/__mock/requests')).json()
const owner = '00000000-0000-7000-8000-000000000001'
const pdf = { name: 'contrat-signé.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n%%EOF\n') }

async function mock(page: Page, state: Record<string, unknown> = {}): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', {
    data: {
      assets: [{ id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', surface_hundredths_m2: 4550, version: 1, shares: [{ owner_id: owner, bp: 10000 }] }],
      ...state,
    },
  })
}
async function confirm(page: Page): Promise<void> {
  await page.getByTestId('confirm').click()
  await expect(page.getByTestId('confirm-dialog')).toBeHidden()
}

test('flow 1: from a draft to an active lease, then to its close', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)

  // The asset's Leases tab opens a new draft for it.
  await page.goto('/assets/a1/leases')
  await expect(page.getByTestId('asset-leases')).toContainText('Aucun bail')
  await page.getByTestId('new-lease').click()
  await expect(page).toHaveURL(/\/leases\/new\?asset_id=a1$/)

  // A tenant created from the form is selected.
  await page.getByTestId('add-tenant').click()
  await page.locator('#tenant_names').fill('Nina Faure')
  await page.locator('#tenant_email').fill('nina@example.test')
  await page.getByTestId('save-tenant').click()
  await expect(page.getByTestId('tenant-dialog')).toBeHidden()

  await page.locator('#start_on').fill('01/12/2026')
  await page.locator('#start_on').press('Tab')
  await page.locator('#rent').fill('800')
  await page.locator('#provision').fill('100')
  await page.locator('#deposit').fill('800')
  await page.locator('#irl_quarter').fill('2026-Q2')
  await page.locator('#irl_value').fill('146,32')
  await page.getByLabel('Entretien annuel de la chaudière').check()
  await page.getByTestId('save').click()

  await expect(page.getByTestId('lease-title')).toContainText('Location nue')
  await expect(page.getByTestId('lease-state')).toHaveText('brouillon')
  await expect(page.getByTestId('lease-tenants')).toHaveText('Nina Faure')
  await expect(page.getByTestId('lease-terms')).toContainText('900,00 €')
  const create = (await requests(page)).filter((r) => r.method === 'POST' && r.path === '/leases').at(-1)
  expect(create?.csrf).toBe('csrf-test-token')
  expect(create?.body).toMatchObject({
    kind: 'unfurnished', asset_ids: ['a1'], start_on: '2026-12-01', rent_cents: 80000, provision_cents: 10000, deposit_cents: 80000,
    irl_ref_quarter: '2026-Q2', irl_ref_value: 14632, clauses: [{ code: 'boiler_servicing' }],
  })
  expect((create?.body?.tenants as { solidary: boolean }[])[0]?.solidary).toBe(true)
  const leaseUrl = page.url()

  // Blocked, not surprised: the missing DPE is listed and generation disabled.
  await expect(page.getByTestId('blockers-generation')).toContainText('DPE')
  await expect(page.getByTestId('generate')).toBeDisabled()
  await expect(page.getByTestId('action-activate')).toBeDisabled()
  // A blocked action names its blocker on hover, through the title attribute:
  // hovering must not write a style attribute the CSP refuses (Q-W1).
  await expect(page.getByTestId('generate-reason')).toHaveAttribute('title', /DPE/)
  await page.getByTestId('generate-reason').hover()
  await page.getByTestId('reason-activate').hover()
  await page.waitForTimeout(500)
  await page.request.post('/__mock/state', { data: { diagnostics: [{ id: 'd1', asset_id: 'a1', kind: 'dpe', result: 'C', version: 1 }] } })
  await page.reload()
  await expect(page.getByTestId('blockers-generation')).toHaveCount(0)
  await page.getByTestId('generate').click()
  await confirm(page)

  // The contract is listed; the signed copy is uploaded against it.
  await page.getByTestId('tab-contract').click()
  await expect(page.getByTestId('document-card').first()).toContainText('CT-00000001-2026-0001')
  await page.getByTestId('file-signed').setInputFiles(pdf)
  await page.getByTestId('send-signed').click()
  await expect(page.getByText('contrat-signé.pdf')).toBeVisible()
  const upload = (await requests(page)).filter((r) => r.method === 'POST' && r.path === '/documents').at(-1)
  expect(upload?.csrf).toBe('csrf-test-token')
  expect(upload?.body).toMatchObject({ class: 'contract', lease_id: leaseUrl.split('/').at(-1), file: 'contrat-signé.pdf' })
  expect(upload?.body?.signs_document_id).toBeTruthy()

  // Guarantees: the deposit, and a surety refused without its guarantor.
  await page.getByTestId('tab-guarantees').click()
  await page.getByTestId('add-guarantee').click()
  await expect(page.locator('#g_amount')).toHaveValue('800,00')
  await page.getByTestId('save-guarantee').click()
  await expect(page.getByTestId('guarantees')).toContainText('Dépôt de garantie')
  await expect(page.getByTestId('guarantees')).toContainText('800,00 €')
  await page.getByTestId('add-guarantee').click()
  await page.locator('#g_kind').click()
  await page.getByRole('option', { name: 'Caution' }).click()
  await page.getByTestId('save-guarantee').click()
  await expect(page.getByTestId('guarantee-error')).toBeVisible()
  await page.locator('#g_name').fill('Paul Faure')
  await page.locator('#g_address').fill('3 rue Neuve, Annecy')
  await page.getByTestId('save-guarantee').click()
  await expect(page.getByTestId('guarantees')).toContainText('Paul Faure, 3 rue Neuve, Annecy')
  await page.getByTestId('guarantee-document').last().click()
  await expect(page.getByTestId('guarantee-download').first()).toBeVisible()

  // Still blocked by the entry inventory, which the next tab records.
  await expect(page.getByTestId('blockers-activation')).toContainText('état des lieux d’entrée')
  await page.getByTestId('tab-inventories').click()
  await page.getByTestId('add-inventory').click()
  await page.locator('#inv_done').fill('01/12/2026')
  await page.locator('#inv_done').press('Tab')
  await page.getByTestId('file-inventory').setInputFiles({ ...pdf, name: 'edl-entree.pdf' })
  await page.getByTestId('save-inventory').click()
  await expect(page.getByTestId('inventories')).toContainText('01/12/2026')

  // Activate, then notice (needs its end date), end, and close refused while
  // the deposit is held; settling it lets the lease close.
  await expect(page.getByTestId('blockers')).not.toContainText('Avant d’activer')
  await page.getByTestId('action-activate').click()
  await confirm(page)
  await expect(page.getByTestId('lease-state')).toHaveText('en cours')
  await expect(page.getByTestId('edit-lease')).toHaveCount(0)
  await page.getByTestId('action-notice').click()
  await expect(page.getByTestId('confirm')).toBeDisabled()
  await page.locator('#notice_end').fill('30/11/2029')
  await page.locator('#notice_end').press('Tab')
  await confirm(page)
  await expect(page.getByTestId('lease-state')).toHaveText('congé donné')
  await page.getByTestId('action-end').click()
  await confirm(page)
  await page.getByTestId('action-close').click()
  await page.getByTestId('confirm').click()
  await expect(page.getByTestId('confirm-error')).toContainText('dépôt de garantie doit être soldé')
  await page.getByRole('button', { name: 'Annuler' }).click()
  await page.getByTestId('tab-guarantees').click()
  await page.getByTestId('settle').click()
  await expect(page.getByTestId('guarantees')).toContainText('soldé')
  await page.getByTestId('action-close').click()
  await confirm(page)
  await expect(page.getByTestId('lease-state')).toHaveText('clos')
  await expect(page.getByTestId('add-guarantee')).toHaveCount(0)

  const transitions = (await requests(page)).filter((r) => r.path.endsWith('/transitions')).map((r) => r.body?.action)
  expect(transitions).toEqual(['activate', 'notice', 'end', 'close', 'close'])
  const settle = (await requests(page)).filter((r) => r.method === 'PUT' && r.path.startsWith('/guarantees/')).at(-1)
  expect(settle?.ifMatch).toBe('W/"1"')
  expect(settle?.body).toMatchObject({ kind: 'deposit', status: 'settled', amount_cents: 80000 })

  // Back on the asset, the lease is listed with its state.
  await page.getByTestId('crumb-asset').click()
  await expect(page.getByTestId('asset-leases')).toContainText('Nina Faure')
  await expect(page.getByTestId('asset-leases')).toContainText('clos')
  expect(violations).toEqual([])
})

test('a draft is edited with If-Match, and two assets need a rent per asset', async ({ page }) => {
  await mock(page, {
    assets: [
      { id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', version: 1, shares: [] },
      { id: 'a2', kind: 'box', address: '12 rue des Lilas, Lyon', lot: 'Box 3', parent_asset_id: 'a1', version: 1, shares: [] },
    ],
    tenants: [{ id: 't1', names: ['Nina Faure'], language: 'fr', version: 1 }],
    leases: [{ id: 'l1', kind: 'unfurnished', state: 'draft', asset_ids: ['a1'], tenants: [{ tenant_id: 't1', solidary: true }], start_on: '2026-12-01', term_months: 36, rent_cents: 80000, provision_cents: 0, deposit_cents: 0, due_day: 5, revision_month: 1, clauses: [], version: 4 }],
  })
  await page.goto('/leases/l1')
  await page.getByTestId('edit-lease').click()
  await page.locator('.p-multiselect').first().click()
  await page.getByRole('option', { name: /Box 3/ }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('breakdown')).toBeVisible()
  await page.locator('#part_a1').fill('720')
  await page.locator('#part_a2').fill('80')
  await page.locator('#part_a2').press('Tab')
  await page.getByTestId('save').click()
  await expect(page.getByTestId('lease-assets')).toContainText('Box 3')
  const put = (await requests(page)).filter((r) => r.method === 'PUT' && r.path === '/leases/l1').at(-1)
  expect(put?.ifMatch).toBe('W/"4"')
  expect(put?.body?.rent_breakdown).toEqual([{ asset_id: 'a1', rent_cents: 72000 }, { asset_id: 'a2', rent_cents: 8000 }])
})

test('an accountant reads a lease with no write control and no guarantor', async ({ page }) => {
  await mock(page, {
    role: 'accountant',
    tenants: [{ id: 't1', names: ['Nina Faure'], version: 1 }],
    leases: [{ id: 'l1', kind: 'furnished', state: 'active', asset_ids: ['a1'], tenants: [{ tenant_id: 't1' }], start_on: '2026-01-01', term_months: 12, rent_cents: 90000, version: 2 }],
    guarantees: [{ id: 'g1', lease_id: 'l1', kind: 'surety', status: 'valid', guarantor: {}, version: 1 }],
  })
  await page.goto('/leases/l1/guarantees')
  await expect(page.getByTestId('lease-state')).toHaveText('en cours')
  await expect(page.getByTestId('guarantees')).toContainText('Caution')
  await expect(page.getByText('Données du garant non visibles')).toBeVisible()
  for (const id of ['edit-lease', 'action-notice', 'add-guarantee', 'edit-guarantee', 'blockers']) await expect(page.getByTestId(id)).toHaveCount(0)
  await page.goto('/leases/new?asset_id=a1')
  await expect(page).toHaveURL(/\/$/)
})

test('a new lease proposes its defaults from the parameters, and help shows on focus', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/leases/new?asset_id=a1')
  const first = await page.evaluate(() => {
    const p = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'Europe/Paris' }).formatToParts(new Date())
    const y = Number(p.find((x) => x.type === 'year')!.value)
    const m = Number(p.find((x) => x.type === 'month')!.value)
    return m === 12 ? { day: `01/01/${y + 1}`, month: 'janvier' } : { day: `01/${String(m + 1).padStart(2, '0')}/${y}`, month: '' }
  })
  await expect(page.locator('#start_on')).toHaveValue(first.day)
  await expect(page.locator('#due_day')).toHaveValue('1')
  // The latest IRL quarter and its value, from /params/irl.
  await expect(page.locator('#irl_quarter')).toHaveValue('2026-Q2')
  await expect(page.locator('#irl_value')).toHaveValue('146,32')
  // The term and the deposit follow the kind's parameters (made-up values).
  await expect(page.locator('#term_months')).toHaveValue('30')
  await page.locator('#rent').fill('800')
  await page.locator('#rent').press('Tab')
  await expect(page.locator('#deposit')).toHaveValue('800,00')
  await page.locator('#lease_kind').click()
  await page.getByRole('option', { name: 'Location meublée' }).click()
  await expect(page.locator('#term_months')).toHaveValue('10')
  await expect(page.locator('#deposit')).toHaveValue(/^2[\s\u202f]400,00$/)
  // A value the user typed is kept when the kind changes again.
  await page.locator('#deposit').fill('1000')
  await page.locator('#deposit').press('Tab')
  await page.locator('#lease_kind').click()
  await page.getByRole('option', { name: 'Location nue' }).click()
  await expect(page.locator('#term_months')).toHaveValue('30')
  await expect(page.locator('#deposit')).toHaveValue(/^1[\s\u202f]000,00$/)
  // A box has no statutory term: none is proposed, and the help says so.
  await page.locator('#lease_kind').click()
  await page.getByRole('option', { name: 'Box ou parking' }).click()
  await expect(page.locator('#term_months')).toHaveValue('')
  // Help: hidden, then shown on keyboard focus, linked to its button.
  const tip = page.getByTestId('help-text-term_months')
  await expect(tip).toBeHidden()
  await page.getByTestId('help-term_months').focus()
  await expect(tip).toBeVisible()
  await expect(tip).toContainText('Aucune durée légale')
  await expect(page.getByTestId('help-term_months')).toHaveAttribute('aria-describedby', 'term_months-help')
  await page.getByTestId('help-deposit').hover()
  await expect(page.getByTestId('help-text-deposit')).toBeVisible()
  expect(violations).toEqual([])
})
