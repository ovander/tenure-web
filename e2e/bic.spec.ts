import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// Furnished letting under the réel under tenure's CSP (RENT-SPEC-019,
// tenure-api Q-132, Q-W41): the API's proposed component grid recorded as
// version 1, a share total that is not 100 % refused first; furniture under
// the threshold expensed by the rule, a forced treatment refused without its
// reason; the year's depreciation; the BIC result beside the micro-BIC, issued
// behind the step-up, after which the grid is frozen.

const owner = '00000000-0000-7000-8000-000000000001'
const year = new Date().getFullYear()
// Made up on purpose: the screen shows what the API decides.
const line = (component: string, share_bp: number, months: number) => ({ component, share_bp, months })
async function mock(page: Page): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: {
    assets: [{ id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', version: 1, shares: [{ owner_id: owner, bp: 10000 }] }],
    bicProposal: { asset_id: 'a1', price_cents: 0, acquisition_costs_cents: 0, costs_expensed: false, basis_cents: 0, bases: [0, 0, 0],
      lines: [line('land', 2000, 0), line('structure', 5000, 600), line('fittings', 3000, 180)] },
    bicThreshold: 70000,
    bicFurnitureMonths: 84,
    bicDepreciation: { a1: { [year]: { year, asset_id: 'a1', grid_version: 1, total_cents: 512345, expensed_cents: 45000, rows: [
      { ref: 'structure', base_cents: 10750000, prior_cents: 0, year_cents: 358333, net_cents: 10391667 },
      { ref: 'fittings', base_cents: 6450000, prior_cents: 0, year_cents: 154012, net_cents: 6295988 }] } } },
    bicResultAssets: [{ asset_id: 'a1', share_bp: 10000 }],
    bicResults: { 2025: { year: 2025, regime: 'reel', receipts_cents: 1800000, charges_cents: 400000, depreciation_cents: 1500000, carried_in_cents: 0,
      room_cents: 1400000, deducted_cents: 1800000, carried_out_cents: 100000, result_cents: 0, deficit_used_cents: 0, taxable_cents: 0, deficits: [],
      micro: { eligible: true, abatement_cents: 900000, taxable_cents: 900000 }, lower: 'reel' } },
  } })
}

test('a furnished asset: its grid recorded, furniture added, the depreciation of the year', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/assets/a1/furnished')
  const g = page.getByTestId('grid')
  await expect(g.getByTestId('grid-proposed')).toBeVisible()
  await expect(g.getByTestId('grid-row')).toHaveCount(3)
  await expect(g.getByTestId('grid-row').nth(1)).toContainText('50 %')
  await expect(g.getByTestId('grid-row').nth(1)).toContainText('50 ans')

  await g.getByTestId('grid-edit').click()
  const d = page.getByTestId('grid-dialog')
  await expect(d.getByTestId('grid-reason')).toHaveCount(0)
  await d.locator('#g_in').fill('01/03/2025')
  await d.locator('#g_in').press('Tab')
  await d.locator('#g_price').fill('200 000')
  await d.locator('#g_price').press('Tab')
  await d.locator('#g_costs').fill('15 000')
  await d.locator('#g_costs').press('Tab')
  await expect(d.getByTestId('grid-basis')).toContainText(/215\s000,00\s€/)
  await d.getByTestId('grid-costs-expensed').click()
  await expect(d.getByTestId('grid-basis')).toContainText(/200\s000,00\s€/)
  await d.getByTestId('grid-costs-expensed').click()
  // A total that is not 100 % is refused before it is sent.
  await d.getByTestId('grid-share-land').fill('25')
  await expect(d.getByTestId('grid-total')).toContainText('105 %')
  await d.getByTestId('grid-save').click()
  await expect(d.getByTestId('error-g_lines')).toContainText('actuellement 105 %')
  await d.getByTestId('grid-share-land').fill('15')
  await d.getByTestId('grid-share-structure').fill('55')
  await expect(d.getByTestId('grid-total')).toContainText('100 %')
  await d.getByTestId('grid-save').click()
  await expect(d).toBeHidden()
  await expect(g.getByTestId('grid-version')).toHaveText('Version 1')
  await expect(g.getByTestId('grid-proposed')).toHaveCount(0)
  await expect(g.getByTestId('grid-summary')).toContainText(/215\s000,00\s€/)
  await expect(g.getByTestId('grid-row').nth(1)).toContainText(/118\s250,00\s€/)

  // A second version needs its reason.
  await g.getByTestId('grid-edit').click()
  await expect(d.getByTestId('grid-reason')).toBeVisible()
  await d.getByTestId('grid-save').click()
  await expect(d.getByTestId('error-g_reason')).toBeVisible()
  await d.getByTestId('grid-reason').fill('Rapport de l’expert-comptable')
  await d.getByTestId('grid-save').click()
  await expect(d).toBeHidden()
  await expect(g.getByTestId('grid-version')).toHaveText('Version 2')

  // Furniture under the threshold goes to charges by the rule; forcing it
  // into assets needs a reason.
  const items = page.getByTestId('items')
  await expect(items.getByTestId('items-empty')).toBeVisible()
  await items.getByTestId('item-add').click()
  const it = page.getByTestId('item-dialog')
  await it.getByTestId('item-label').fill('Canapé convertible')
  await it.locator('#it_cost').fill('450')
  await it.locator('#it_cost').press('Tab')
  await it.locator('#it_in').fill('01/03/2025')
  await it.locator('#it_in').press('Tab')
  await it.getByTestId('item-save').click()
  await expect(it).toBeHidden()
  const row = items.getByTestId('item')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('En charge')
  await expect(row).toContainText('7 ans')
  await expect(row.getByTestId('item-overridden')).toHaveCount(0)

  await row.getByTestId('item-edit').click()
  await it.getByTestId('item-treatment').click()
  await page.getByRole('option', { name: 'Immobilisé' }).click()
  await it.getByTestId('item-save').click()
  await expect(it.getByTestId('error-it_reason')).toContainText('Dites pourquoi')
  await it.getByTestId('item-reason').fill('Lot acheté avec le lit, un seul ensemble')
  await it.getByTestId('item-save').click()
  await expect(it).toBeHidden()
  await expect(row).toContainText('Immobilisé')
  await expect(row.getByTestId('item-overridden')).toBeVisible()

  // Works: a repair is a charge, not depreciated.
  await items.getByTestId('item-add').click()
  await it.getByTestId('item-kind').getByText('Travaux').click()
  await it.getByTestId('item-works').click()
  await page.getByRole('option', { name: 'Réparation, entretien' }).click()
  await it.getByTestId('item-label').fill('Remplacement du ballon')
  await it.locator('#it_cost').fill('1 200')
  await it.locator('#it_cost').press('Tab')
  await it.locator('#it_in').fill('15/06/2025')
  await it.locator('#it_in').press('Tab')
  await it.locator('#it_months').fill('120')
  await it.getByTestId('item-save').click()
  await expect(it).toBeHidden()
  await expect(items.getByTestId('item')).toHaveCount(2)
  await expect(items.getByTestId('item').nth(1)).toContainText('En charge')

  const dep = page.getByTestId('depreciation')
  await expect(dep.getByTestId('dep-row')).toHaveCount(2)
  await expect(dep.getByTestId('dep-total')).toHaveText(/5\s123,45\s€/)
  await expect(dep.getByTestId('dep-expensed')).toContainText(/450,00\s€/)
  expect(violations).toEqual([])
})

test('the BIC result beside the micro-BIC, issued behind the step-up; the grid frozen', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.request.post('/__mock/state', { data: { bicGrids: { a1: [{ asset_id: 'a1', version: 1, proposed: false, frozen: false, in_service_on: '2025-03-01',
    price_cents: 20000000, acquisition_costs_cents: 0, basis_cents: 20000000, bases: [4000000, 10000000, 6000000],
    lines: [line('land', 2000, 0), line('structure', 5000, 600), line('fittings', 3000, 180)] }] } } })
  await page.goto('/bic/2025')
  await expect(page.getByTestId('bic-title')).toContainText('2025')
  await expect(page.getByTestId('bic-empty')).toHaveCount(0)
  const reel = page.getByTestId('bic-reel')
  await expect(reel.getByTestId('bic-receipts')).toHaveText(/18\s000,00\s€/)
  await expect(reel.getByTestId('bic-deducted')).toContainText(/18\s000,00\s€/)
  await expect(reel.getByTestId('bic-carried')).toHaveText(/1\s000,00\s€/)
  await expect(reel.getByTestId('bic-taxable')).toHaveText(/0,00\s€/)
  const micro = page.getByTestId('bic-micro')
  await expect(micro.getByTestId('bic-micro-taxable')).toHaveText(/9\s000,00\s€/)
  await expect(micro.getByTestId('bic-lower')).toContainText('Régime réel')

  // Without a fresh strong sign-in, issuing asks for one.
  await page.getByTestId('issue-reel').click()
  await page.getByTestId('confirm-dialog').getByTestId('confirm').click()
  await expect(page.getByTestId('step-up')).toBeVisible()
  await page.request.post('/__mock/state', { data: { stepUpFresh: true } })
  await page.goto('/bic/2025')
  await page.getByTestId('issue-reel').click()
  await page.getByTestId('confirm-dialog').getByTestId('confirm').click()
  await expect(page.getByTestId('bic-declared')).toHaveText('Déclarée au Régime réel')
  await expect(page.getByTestId('bic-issue')).toHaveCount(0)

  // The grid the declaration used no longer changes.
  await page.goto('/assets/a1/furnished')
  await expect(page.getByTestId('grid-frozen')).toBeVisible()
  await expect(page.getByTestId('grid-edit')).toHaveCount(0)
  await page.goto('/bic/2025')

  // A year with no furnished letting says so; the micro closed.
  await page.request.post('/__mock/state', { data: { bicResultAssets: [], bicResults: { 2024: { year: 2024, micro: { eligible: false }, lower: 'reel' } } } })
  await page.getByTestId('year-prev').click()
  await expect(page.getByTestId('bic-title')).toContainText('2024')
  await expect(page.getByTestId('bic-empty')).toBeVisible()
  await expect(page.getByTestId('bic-micro-closed')).toBeVisible()
  await expect(page.getByTestId('issue-micro')).toBeDisabled()
  expect(violations).toEqual([])
})
