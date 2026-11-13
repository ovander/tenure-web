import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// The dashboard under tenure's CSP (RENT-SPEC-016, tenure-api Q-129, Q-W39):
// the portfolio's tiles, the year to date against last year, the tax
// estimate and the lower regime, one row per asset with its yields,
// occupancy and aged arrears, the months; the CSV behind the step-up; a year
// without its 2044 lines has no estimate.

const owner = '00000000-0000-7000-8000-000000000001'
const bucket = (from: number, to: number | null, cents: number) => ({ from_days: from, to_days: to, cents })
const dash2026 = {
  year: 2026, as_of: '2026-03-31', partial: true,
  assets: [
    { asset_id: 'a1', label: '12 rue des Lilas, Lyon', acquisition_cents: 18000000, rent_cents: 240000, other_income_cents: 0, expenses_cents: 73900, interest_cents: 59900,
      net_cents: 166100, gross_yield_bp: 540, net_yield_bp: 374, days: 90, vacant_days: 0, occupied_days: 90, provisions_received_cents: 30000, recoverable_paid_cents: 20000,
      arrears_cents: 125000, arrears: [bucket(1, 30, 90000), bucket(31, 60, 30000), bucket(61, 90, 0), bucket(91, null, 5000)] },
    { asset_id: 'a2', label: 'Box 4', acquisition_cents: 1500000, rent_cents: 50000, expenses_cents: 12000, net_cents: 38000, gross_yield_bp: 2062, net_yield_bp: 1567,
      days: 59, vacant_days: 10, occupied_days: 49, arrears_cents: 0, arrears: [bucket(1, 30, 0), bucket(31, 60, 0), bucket(61, 90, 0), bucket(91, null, 0)] },
  ],
  portfolio: { rent_cents: 290000, expenses_cents: 85900, interest_cents: 59900, net_cents: 204100, arrears_cents: 125000 },
  months: [{ month: '2026-01', in_cents: 90000, out_cents: 72000, net_cents: 18000 }, { month: '2026-02', in_cents: 140000, out_cents: 102000, net_cents: 38000 }, { month: '2026-03', in_cents: 96000, out_cents: 12000, net_cents: 84000 }],
  year_to_date: { from: '2026-01-01', to: '2026-03-31', income_cents: 290000, expenses_cents: 85900, net_cents: 204100 },
  previous_year: { from: '2025-01-01', to: '2025-03-31', income_cents: 234000, expenses_cents: 50000, net_cents: 184000 },
  tax: { available: true, micro: { eligible: true, gross_cents: 290000, taxable_cents: 203000 }, reel: { taxable_cents: 204100 }, lower: 'micro', flags: 0 },
}
async function mock(page: Page): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: {
    assets: [{ id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', version: 1, shares: [{ owner_id: owner, bp: 10000 }] }],
    dashboards: { 2026: dash2026 },
  } })
}

test('the dashboard of a running year: tiles, comparison, tax estimate, assets, months, export', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/dashboard/2026')
  await expect(page.getByTestId('dashboard-title')).toHaveText('Tableau de bord 2026')
  await expect(page.getByTestId('as-of')).toHaveText('au 31/03/2026')
  await expect(page.getByTestId('tile-rent')).toHaveText(/2\s900,00\s€/)
  await expect(page.getByTestId('tile-net')).toHaveText(/2\s041,00\s€/)
  await expect(page.getByTestId('tile-arrears')).toHaveText(/1\s250,00\s€/)
  await expect(page.getByTestId('income-change')).toHaveText('+23,93 %')
  await expect(page.getByTestId('tax-micro')).toHaveText(/2\s030,00\s€/)
  await expect(page.getByTestId('tax-lower')).toContainText('micro-foncier')
  const rows = page.getByTestId('asset-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.first().getByTestId('gross-yield')).toHaveText('5,40 %')
  await expect(rows.nth(1).getByTestId('occupancy')).toContainText('83,05 %')
  await expect(rows.first().getByTestId('bucket')).toHaveText(['1-30 j : 900,00 €', '31-60 j : 300,00 €', '91+ j : 50,00 €'])
  await expect(page.getByTestId('month')).toHaveCount(3)

  // The export asks for a fresh strong sign-in, then downloads.
  await page.getByTestId('export-csv').click()
  await expect(page.getByTestId('step-up')).toBeVisible()
  await page.request.post('/__mock/state', { data: { stepUpFresh: true } })
  await page.goto('/dashboard/2026')
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()])
  expect(csv.suggestedFilename()).toBe('tableau-de-bord-2026.csv')
  expect(violations).toEqual([])
})

test('a year without its 2044 lines has no tax estimate; the previous year is one click away', async ({ page }) => {
  await mock(page)
  await page.goto('/dashboard/2027')
  await expect(page.getByTestId('tax-none')).toContainText('Pas d’estimation pour 2027')
  await expect(page.getByTestId('no-assets')).toBeVisible()
  await page.getByTestId('year-prev').click()
  await expect(page.getByTestId('dashboard-title')).toHaveText('Tableau de bord 2026')
})
