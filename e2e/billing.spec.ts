import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// Web slice 3, RENT-FE-001 flow 2 « monthly billing review » under tenure's
// CSP: November reviewed in the « Simulation » panel (one full month, one
// lease in notice ending mid-month), issued through the dialog that restates
// count and total, a rent call cancelled and reissued, payments recorded and
// applied (automatically, then by hand), receipts issued. Plus the
// accountant's read-only view.

interface Req { method: string; path: string; csrf?: string; body?: Record<string, unknown> }
const requests = async (page: Page): Promise<Req[]> => (await page.request.get('/__mock/requests')).json()
const owner = '00000000-0000-7000-8000-000000000001'
const shares = [{ owner_id: owner, bp: 10000 }]

async function mock(page: Page, state: Record<string, unknown> = {}): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', {
    data: {
      assets: [
        { id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', version: 1, shares },
        { id: 'a2', kind: 'house', address: '3 rue du Fort, Baillargues', version: 1, shares },
      ],
      tenants: [{ id: 't1', names: ['Jeanne Martin'], version: 1 }, { id: 't2', names: ['Paul Roux'], version: 1 }],
      leases: [
        { id: 'l1', kind: 'unfurnished', state: 'active', asset_ids: ['a1'], tenants: [{ tenant_id: 't1' }], start_on: '2026-01-01', term_months: 36, rent_cents: 80000, provision_cents: 5000, due_day: 5, version: 2 },
        { id: 'l2', kind: 'unfurnished', state: 'notice', asset_ids: ['a2'], tenants: [{ tenant_id: 't2' }], start_on: '2025-05-01', end_on: '2026-11-15', term_months: 36, rent_cents: 60000, provision_cents: 4000, due_day: 5, version: 3 },
      ],
      ...state,
    },
  })
}

test('flow 2: a month reviewed, issued, corrected, paid and receipted', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/billing/2026-11')
  await expect(page.getByTestId('billing-title')).toContainText('novembre 2026')
  await expect(page.getByTestId('docs-empty')).toBeVisible()
  // Review before issue: nothing can be issued before the dry run.
  await expect(page.getByTestId('issue')).toBeDisabled()

  await page.getByTestId('simulate').click()
  const sim = page.getByTestId('simulation')
  await expect(sim).toContainText('Simulation')
  await expect(sim.getByTestId('fee')).toHaveCount(2)
  const notice = sim.getByTestId('fee').filter({ hasText: 'Baillargues' })
  await expect(notice.getByTestId('fee-exception')).toHaveText('Mois partiel : 15 jours sur 30')
  await expect(notice).toContainText(/300,00\s€/)
  await expect(sim.getByTestId('fees-total')).toHaveText(/1\s170,00\s€/)
  expect((await requests(page)).filter((r) => r.path === '/billing/runs').map((r) => r.body?.dry_run)).toEqual([true])

  // Issue: the dialog restates count and total.
  await page.getByTestId('issue').click()
  await expect(page.getByTestId('confirm-dialog')).toContainText('2 appel(s) de loyer')
  await expect(page.getByTestId('confirm-dialog')).toContainText(/1\s170,00\s€/)
  await page.getByTestId('confirm').click()
  await expect(page.getByTestId('confirm-dialog')).toBeHidden()
  await expect(page.getByTestId('simulation')).toHaveCount(0)
  await expect(page.getByTestId('doc-number')).toHaveText(['AL-00000001-2026-0001', 'AL-00000001-2026-0002'])
  const issue = (await requests(page)).filter((r) => r.path === '/billing/runs').at(-1)
  expect(issue?.body).toEqual({ period: '2026-11', dry_run: false })
  expect(issue?.csrf).toBe('csrf-test-token')

  // A second dry run has nothing left to issue.
  await page.getByTestId('simulate').click()
  await expect(page.getByTestId('simulation-empty')).toBeVisible()

  // Cancel and reissue needs a reason, and says what it will write.
  await page.getByTestId('documents').locator('tr', { hasText: 'Lilas' }).getByTestId('cancel-reissue').click()
  await expect(page.getByTestId('confirm-dialog')).toContainText('document d’annulation')
  await expect(page.getByTestId('confirm')).toBeDisabled()
  await page.locator('#cancel_reason').fill('Erreur sur la provision de charges')
  await page.getByTestId('confirm').click()
  await expect(page.getByTestId('confirm-dialog')).toBeHidden()
  await expect(page.getByText('réémis sous le numéro AL-00000001-2026-0003')).toBeVisible()
  await expect(page.getByTestId('doc-kind')).toContainText(['Appel de loyer', 'Appel de loyer', 'Annulation', 'Appel de loyer'])
  await expect(page.getByTestId('documents').locator('tr', { hasText: 'AL-00000001-2026-0001' }).getByTestId('cancel-reissue')).toHaveCount(0)
  await expect(page.getByTestId('documents')).toContainText('émission 2')

  // A payment, proposed at what the lease owes and applied automatically.
  await page.getByTestId('to-payments').click()
  await expect(page.getByTestId('payments-empty')).toBeVisible()
  await page.getByTestId('add-payment').click()
  await page.locator('#pay_lease').click()
  await page.getByRole('option', { name: /Lilas/ }).click()
  await expect(page.locator('#pay_amount')).toHaveValue('850,00')
  await expect(page.getByTestId('payment-dialog')).toContainText('Le bail doit 850,00')
  await expect(page.locator('#pay_method')).toContainText('Virement')
  await page.getByTestId('help-pay_amount').focus()
  await expect(page.getByTestId('help-text-pay_amount')).toBeVisible()
  await page.getByTestId('save-payment').click()
  await expect(page.getByTestId('payment-dialog')).toBeHidden()
  await expect(page.getByTestId('payments')).toContainText(/850,00\s€/)
  const pay = (await requests(page)).filter((r) => r.method === 'POST' && r.path === '/payments').at(-1)
  expect(pay?.body).toMatchObject({ lease_id: 'l1', amount_cents: 85000, method: 'transfer', auto_match: true })
  expect(pay?.body?.paid_on).toMatch(/^\d{4}-\d{2}-\d{2}$/)

  // A part payment kept aside, then applied by hand.
  await page.getByTestId('add-payment').click()
  await page.locator('#pay_lease').click()
  await page.getByRole('option', { name: /Baillargues/ }).click()
  await expect(page.locator('#pay_amount')).toHaveValue('320,00')
  await page.locator('#pay_amount').fill('100')
  await page.locator('#pay_amount').blur()
  await page.locator('#pay_auto').uncheck()
  await page.getByTestId('save-payment').click()
  await expect(page.getByTestId('payment-dialog')).toBeHidden()
  await page.locator('#only_unmatched').check()
  await expect(page).toHaveURL(/unmatched=1/)
  await expect(page.getByTestId('unmatched-cell')).toHaveText([/100,00\s€/])
  await page.getByTestId('match').click()
  await expect(page.getByTestId('open-call')).toHaveCount(1)
  await expect(page.locator('#apply_AL-00000001-2026-0002')).toHaveValue('100,00')
  await page.getByTestId('save-match').click()
  await expect(page.getByTestId('match-dialog')).toBeHidden()
  await expect(page.getByTestId('payments-empty')).toContainText('Tous les paiements sont affectés')

  // Receipts now rather than at the next hourly run.
  await page.getByTestId('issue-receipts').click()
  await expect(page.getByText('Quittances émises')).toBeVisible()
  await page.goto('/billing/2026-11')
  await expect(page.getByTestId('documents')).toContainText('Quittance')
  await expect(page.getByTestId('doc-number')).toContainText(['QL-00000001-2026-0001'])

  // The lease hub shows what is left: the part-paid notice month.
  await page.goto('/leases/l2/billing')
  await expect(page.getByTestId('arrears')).toContainText(/Reste dû : 220,00\s€/)
  await page.goto('/leases/l1/billing')
  await expect(page.getByTestId('arrears-none')).toBeVisible()
  expect(violations).toEqual([])
})

test('an accountant reads the billing month and payments with no write control', async ({ page }) => {
  await mock(page, {
    role: 'accountant',
    billingDocs: [{ id: 'd1', kind: 'rent_call', lease_id: 'l1', period: '2026-11', number: 'AL-00000001-2026-0001', generation: 1, total_cents: 85000, document_id: 'f1', issued_at: '2026-11-01T05:00:00Z' }],
    payments: [{ id: 'p1', lease_id: 'l1', amount_cents: 50000, paid_on: '2026-11-04', method: 'cheque', version: 1, matches: [] }],
  })
  const violations = await watchCSP(page)
  await page.goto('/billing/2026-11')
  await expect(page.getByTestId('doc-number')).toHaveText(['AL-00000001-2026-0001'])
  for (const id of ['simulate', 'issue', 'cancel-reissue']) await expect(page.getByTestId(id)).toHaveCount(0)
  await expect(page.getByTestId('doc-download')).toHaveCount(1)
  await page.getByTestId('to-payments').click()
  await expect(page.getByTestId('payments')).toContainText('Chèque')
  for (const id of ['add-payment', 'issue-receipts', 'match']) await expect(page.getByTestId(id)).toHaveCount(0)
  expect(violations).toEqual([])
})
