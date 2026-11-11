import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// The bank reconciliation screen under tenure's CSP (RENT-SPEC-013,
// tenure-api Q-123 to Q-125, Q-W37): an account added, a CSV statement whose
// columns are read and mapped, checked then imported; the sure credits
// matched automatically after a preview; a credit matched from its
// suggestion, another split by hand; a debit matched to a syndic statement;
// a line ignored then reopened.

const owner = '00000000-0000-7000-8000-000000000001'
const csv = 'Date opération;Libellé;Débit;Crédit\n05/10/2026;VIR LEA MARTIN;;800,00\n'
async function mock(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: {
    assets: [{ id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', version: 1, shares: [{ owner_id: owner, bp: 10000 }] }],
    tenants: [{ id: 't1', names: ['Léa Martin'], version: 1 }, { id: 't2', names: ['Paul Roux'], version: 1 }],
    leases: [
      { id: 'l1', kind: 'unfurnished', state: 'active', asset_ids: ['a1'], tenants: [{ tenant_id: 't1' }], start_on: '2025-01-01', term_months: 36, rent_cents: 75000, provision_cents: 5000, due_day: 5, version: 3 },
      { id: 'l2', kind: 'unfurnished', state: 'active', asset_ids: ['a1'], tenants: [{ tenant_id: 't2' }], start_on: '2025-01-01', term_months: 36, rent_cents: 60000, provision_cents: 5000, due_day: 5, version: 3 },
    ],
    ...extra,
  } })
}
const line = (id: string, amount: number, label: string, extra: Record<string, unknown> = {}) => ({ id, account_id: 'acc1', booked_on: '2026-10-05', amount_cents: amount, label, status: 'unmatched', version: 1, key: `k-${id}`, document_id: 'd1', ...extra })

test('an account, a CSV statement mapped, checked and imported', async ({ page }) => {
  await mock(page, { bankStatements: { 'releve.csv': [line('n1', 80000, 'VIR LEA MARTIN'), line('n2', -35000, 'PRLV SYNDIC')] } })
  const violations = await watchCSP(page)
  await page.goto('/bank')
  await expect(page.getByTestId('bank-no-account')).toBeVisible()
  await page.getByTestId('bank-add-account').click()
  await page.locator('#acc_label').fill('Compte loyers')
  await page.locator('#acc_last4').fill('0185')
  await page.getByTestId('account-save').click()
  await expect(page.getByTestId('bank-account')).toContainText('Compte loyers ··0185')
  await expect(page.getByTestId('bank-empty')).toBeVisible()

  await page.getByTestId('bank-import').click()
  const d = page.getByTestId('statement-dialog')
  await d.locator('input[type=file]').setInputFiles({ name: 'releve.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(d.getByTestId('statement-mapping')).toBeVisible()
  await expect(d.getByTestId('map-date')).toContainText('Date opération')
  await d.getByTestId('statement-check').click()
  await expect(d.getByTestId('statement-preview')).toHaveText('2 ligne(s) nouvelle(s), 0 déjà importée(s).')
  await d.getByTestId('statement-import').click()
  await expect(d).toBeHidden()
  await expect(page.getByTestId('bank-line')).toHaveCount(2)
  expect(violations).toEqual([])
})

test('auto matching, a suggestion taken, a split, a syndic debit, a line ignored and reopened', async ({ page }) => {
  await mock(page, {
    bankAccounts: [{ id: 'acc1', label: 'Compte loyers', version: 1 }],
    bankLines: [line('b1', 80000, 'VIR LEA MARTIN', { stale: true }), line('b2', 65000, 'VIR SEPA LOYER'), line('b3', 120000, 'VIR M ET MME ROUX'), line('b4', -35000, 'PRLV SYNDIC'), line('b5', -250, 'FRAIS BANCAIRES')],
    bankSure: { b1: 'l1' },
    rentSuggestions: { b2: [{ lease_id: 'l2', billing_document_id: 'c2', number: 'AL-00000001-2026-0011', period: '2026-10', amount_cents: 65000, method: 'transfer', rule: 'amount_period' }] },
    chargeSuggestions: { b4: [{ rule: 'statement', charges: [{ id: 'ch1', label: 'Charges courantes', amount_cents: 30000 }, { id: 'ch2', label: 'Fonds travaux', amount_cents: 5000 }] }] },
  })
  await page.goto('/bank')
  await expect(page.getByTestId('bank-line')).toHaveCount(5)
  await expect(page.getByTestId('bank-stale')).toHaveCount(1)

  await page.getByTestId('bank-auto').click()
  await expect(page.getByTestId('auto-preview')).toContainText('1 crédit(s) reconnu(s)')
  await page.getByTestId('auto-run').click()
  await expect(page.getByTestId('bank-line')).toHaveCount(4)

  const b2 = page.getByTestId('bank-line').filter({ hasText: 'VIR SEPA LOYER' })
  await b2.getByTestId('bank-open').click()
  await expect(b2.getByTestId('rent-suggestion')).toContainText('montant et date')
  await b2.getByTestId('rent-take').click()
  await expect(page.getByTestId('bank-line')).toHaveCount(3)

  const b3 = page.getByTestId('bank-line').filter({ hasText: 'ROUX' })
  await b3.getByTestId('bank-open').click()
  await b3.getByTestId('bank-split').click()
  const sd = page.getByTestId('split-dialog')
  await sd.getByTestId('split-lease').click()
  await page.getByRole('option', { name: /Paul Roux/ }).click()
  await sd.getByTestId('split-amount').first().locator('input').fill('600')
  await sd.getByTestId('split-save').click()
  await expect(sd.getByTestId('form-error')).toBeVisible()
  await sd.getByTestId('split-add').click()
  await sd.getByTestId('split-lease').nth(1).click()
  await page.getByRole('option', { name: /Léa Martin/ }).click()
  await sd.getByTestId('split-amount').nth(1).locator('input').fill('600')
  await sd.getByTestId('split-save').click()
  await expect(sd).toBeHidden()
  await expect(page.getByTestId('bank-line')).toHaveCount(2)

  const b4 = page.getByTestId('bank-line').filter({ hasText: 'SYNDIC' })
  await b4.getByTestId('bank-open').click()
  await expect(b4.getByTestId('charge-suggestion')).toContainText('Charges courantes (300,00')
  await b4.getByTestId('charge-take').click()
  await expect(page.getByTestId('bank-line')).toHaveCount(1)

  await page.getByTestId('bank-line').first().getByTestId('bank-ignore').click()
  await page.locator('#ign_note').fill('frais de tenue de compte')
  await page.getByTestId('ignore-save').click()
  await expect(page.getByTestId('bank-empty')).toBeVisible()
  await page.getByTestId('bank-status').click()
  await page.getByRole('option', { name: 'Ignorées' }).click()
  await expect(page.getByTestId('bank-line')).toContainText('« frais de tenue de compte »')
  await page.getByTestId('bank-reopen').click()
  await expect(page.getByTestId('bank-empty')).toBeVisible()
})
