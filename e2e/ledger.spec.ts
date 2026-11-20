import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// Loans and the owner's journal under tenure's CSP (RENT-SPEC-014, tenure-api
// Q-126 to Q-128, Q-W38): a loan computed and previewed, its table opened;
// changed into the bank's pasted table, a bad line reported first; refused
// once its year is closed. The journal of a closed year, balanced, its
// exports behind the step-up, the FEC kept for closed years.

const owner = '00000000-0000-7000-8000-000000000001'
const inst = (seq: number, due: string, principal: number, interest: number, remaining: number) =>
  ({ seq, due_on: due, principal_cents: principal, interest_cents: interest, insurance_cents: 2500, remaining_cents: remaining })
async function mock(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: {
    assets: [{ id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', version: 1, shares: [{ owner_id: owner, bp: 10000 }] }],
    loanPreview: { principal_cents: 15000000, annual_rate_ppm: 34500, instalments: [inst(1, '2026-01-31', 43484, 43125, 14956516), inst(2, '2026-02-28', 43609, 43000, 14912907), inst(3, '2027-01-31', 14912907, 42875, 0)] },
    ...extra,
  } })
}

test('a loan computed, previewed and saved; changed into the bank table; refused in a closed year', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/assets/a1/loans')
  await expect(page.getByTestId('loans-empty')).toBeVisible()
  await page.getByTestId('loan-add').click()
  const d = page.getByTestId('loan-dialog')
  await d.getByTestId('loan-label').fill('Prêt acquisition')
  await d.getByTestId('loan-lender').fill('Banque Exemple')
  await d.locator('#loan_principal').fill('150 000')
  await d.locator('#loan_principal').press('Tab')
  await d.getByTestId('loan-rate').fill('3,45')
  await d.locator('#loan_first').fill('31/01/2026')
  await d.locator('#loan_first').press('Tab')
  await d.getByTestId('loan-preview-btn').click()
  await expect(d.getByTestId('loan-preview')).toContainText(/866,09\s€/)
  // A field that commits its value again on blur keeps the preview; a real
  // change hides it until it is computed again.
  await d.locator('#loan_insurance').click()
  await d.getByTestId('loan-label').click()
  await expect(d.getByTestId('loan-preview')).toBeVisible()
  await d.getByTestId('loan-rate').fill('3,40')
  await expect(d.getByTestId('loan-preview')).toHaveCount(0)
  await d.getByTestId('loan-rate').fill('3,45')
  await d.getByTestId('loan-preview-btn').click()
  await expect(d.getByTestId('loan-preview')).toContainText(/866,09\s€/)
  await d.getByTestId('loan-save').click()
  await expect(d).toBeHidden()

  const card = page.getByTestId('loan')
  await expect(card.getByTestId('loan-title')).toContainText('Prêt acquisition')
  await expect(card).toContainText('3,45 %')
  await expect(card.getByTestId('loan-year')).toHaveCount(2)
  // Saved, its table opens; the button folds it and opens it again.
  await expect(card.getByTestId('instalment')).toHaveCount(3)
  await card.getByTestId('loan-open').click()
  await expect(card.getByTestId('instalment')).toHaveCount(0)
  await card.getByTestId('loan-open').click()
  await expect(card.getByTestId('instalment')).toHaveCount(3)

  // The bank's table, pasted: a line that does not read is reported.
  await card.getByTestId('loan-edit').click()
  await d.getByTestId('loan-mode').getByText('Coller le tableau de la banque').click()
  await d.getByTestId('loan-table').fill('Échéance;Capital;Intérêts;Assurance\n31/01/2026;75 000;431,25;25\n28/02/2026;abc;1\n')
  await d.getByTestId('loan-save').click()
  await expect(d.getByTestId('error-loan_table')).toContainText('Lignes illisibles : 3.')
  await d.getByTestId('loan-table').fill('31/01/2026;75 000;431,25;25\n28/02/2026;75 000;215,63;25\n')
  await expect(d.getByTestId('table-summary')).toContainText(/2 échéance\(s\) lue\(s\), 150\s000,00\s€/)
  await d.getByTestId('loan-save').click()
  await expect(d).toBeHidden()
  await expect(card).toContainText('Tableau de la banque')
  await expect(card.getByTestId('instalment')).toHaveCount(2)

  // Once 2026 is closed, the table can no longer change.
  await page.request.post('/__mock/state', { data: { closedYears: [2026] } })
  await card.getByTestId('loan-edit').click()
  await d.getByTestId('loan-save').click()
  await expect(d.getByTestId('form-error')).toContainText('Cette année est close')
  expect(violations).toEqual([])
})

const journal2025 = {
  year: 2025, closed: true,
  entries: [
    { date: '2025-01-05', journal: 'BQ', kind: 'payment', source: 'p1', label: 'Encaissement du locataire', lines: [
      { account: '512000', label: 'Banque', debit_cents: 90000, credit_cents: 0 },
      { account: '706000', label: 'Loyers', debit_cents: 0, credit_cents: 80000 },
      { account: '419800', label: 'Locataires, provisions sur charges', debit_cents: 0, credit_cents: 10000 }] },
    { date: '2025-10-15', journal: 'BQ', kind: 'charge', source: 'c1', label: 'Taxes foncières', lines: [
      { account: '635120', label: 'Taxes foncières', debit_cents: 120000, credit_cents: 0 },
      { account: '512000', label: 'Banque', debit_cents: 0, credit_cents: 120000 }] },
  ],
  balances: [
    { account: '419800', label: 'Locataires, provisions sur charges', debit_cents: 0, credit_cents: 10000, balance_cents: -10000 },
    { account: '512000', label: 'Banque', debit_cents: 90000, credit_cents: 120000, balance_cents: -30000 },
    { account: '635120', label: 'Taxes foncières', debit_cents: 120000, credit_cents: 0, balance_cents: 120000 },
    { account: '706000', label: 'Loyers', debit_cents: 0, credit_cents: 80000, balance_cents: -80000 },
  ],
}

test('the journal of a closed year, balanced; its exports behind the step-up', async ({ page }) => {
  await mock(page, { journals: { 2025: journal2025 } })
  const violations = await watchCSP(page)
  await page.goto('/ledger/2025')
  await expect(page.getByTestId('ledger-title')).toHaveText('Journal 2025')
  await expect(page.getByTestId('ledger-state')).toHaveText('Année close')
  await expect(page.getByTestId('entry')).toHaveCount(2)
  await expect(page.getByTestId('entry-line')).toHaveCount(5)
  await expect(page.getByTestId('no-document')).toHaveCount(1)
  await expect(page.getByTestId('balances-total')).toHaveText(/0,00\s€/)

  // Without a fresh strong sign-in, an export asks for one.
  await page.getByTestId('export-journal').click()
  await expect(page.getByTestId('step-up')).toBeVisible()
  await page.request.post('/__mock/state', { data: { stepUpFresh: true } })
  await page.goto('/ledger/2025')
  const [fec] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-fec').click()])
  expect(fec.suggestedFilename()).toBe('FEC20251231.txt')
  const [pack] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-pack').click()])
  expect(pack.suggestedFilename()).toBe('cloture-2025.zip')

  // An open year has no FEC.
  await page.getByTestId('year-next').click()
  await expect(page.getByTestId('ledger-title')).toHaveText('Journal 2026')
  await expect(page.getByTestId('ledger-state')).toHaveText('Année ouverte')
  await expect(page.getByTestId('ledger-empty')).toBeVisible()
  await expect(page.getByTestId('export-fec')).toBeDisabled()
  expect(violations).toEqual([])
})
