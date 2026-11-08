import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// A lease's terms and an asset's vacancy under tenure's CSP (RENT-SPEC-010,
// tenure-api Q-119, Q-W34): the terms and their renewal on the lease
// overview, a lease past its term flagged, the vacancy on the asset overview.

const owner = '00000000-0000-7000-8000-000000000001'
async function mock(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: {
    assets: [{ id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', acquired_on: '2019-01-10', version: 1, shares: [{ owner_id: owner, bp: 10000 }] }],
    tenants: [{ id: 't1', names: ['Léa Martin'], version: 1 }],
    leases: [{ id: 'l1', kind: 'furnished', state: 'active', asset_ids: ['a1'], tenants: [{ tenant_id: 't1' }], start_on: '2024-09-01', term_months: 12, rent_cents: 80000, provision_cents: 5000, due_day: 5, version: 3 }],
    ...extra,
  } })
}

test('the lease overview lists its terms and the next tacit renewal; the asset shows its vacancy', async ({ page }) => {
  await mock(page, {
    terms: { l1: { renews: true, next_renewal_on: '2027-09-01', terms: [
      { n: 1, start_on: '2024-09-01', end_on: '2025-08-31', renewal: 'initial', status: 'past' },
      { n: 2, start_on: '2025-09-01', end_on: '2026-08-31', renewal: 'tacit', status: 'past' },
      { n: 3, start_on: '2026-09-01', end_on: '2027-08-31', renewal: 'tacit', status: 'current' }] } },
    vacancies: { a1: { asset_id: 'a1', since: '2019-01-10', days_by_year: { 2019: 50, 2023: 78, 2024: 92 }, periods: [
      { from_on: '2019-01-10', to_on: '2019-02-28', days: 50 }, { from_on: '2023-06-15', to_on: '2023-08-31', days: 78 },
      { from_on: '2024-06-01', to_on: '2024-08-31', days: 92 }] } },
  })
  const violations = await watchCSP(page)
  await page.goto('/leases/l1')
  await expect(page.getByTestId('term')).toHaveCount(3)
  await expect(page.getByTestId('term-renewal')).toHaveText(['première période', 'tacite reconduction', 'tacite reconduction'])
  await expect(page.getByTestId('term-status')).toHaveText(['passée', 'passée', 'en cours'])
  await expect(page.getByTestId('term').nth(2)).toContainText('du 01/09/2026 au 31/08/2027')
  await expect(page.getByTestId('next-renewal')).toHaveText('Prochaine tacite reconduction le 01/09/2027, sauf congé.')

  await page.goto('/assets/a1')
  await expect(page.getByTestId('vacancy-period')).toHaveText(['Du 10/01/2019 au 28/02/2019 · 50 jours', 'Du 15/06/2023 au 31/08/2023 · 78 jours', 'Du 01/06/2024 au 31/08/2024 · 92 jours'])
  await expect(page.getByTestId('vacancy-years').locator('tr')).toHaveText([/2024\s*92 jours vacants/, /2023\s*78 jours vacants/, /2019\s*50 jours vacants/])
  expect(violations).toEqual([])
})

test('a term cut short by the notice, a lease past its term, an open vacancy, and none', async ({ page }) => {
  await mock(page, {
    terms: { l1: { renews: true, terms: [{ n: 1, start_on: '2024-09-01', end_on: '2025-03-14', renewal: 'initial', status: 'past', ended_early: true }] } },
    vacancies: { a1: { asset_id: 'a1', since: '2019-01-10', days_by_year: { 2026: 8 }, periods: [{ from_on: '2026-11-01', to_on: '2026-11-08', days: 8, open: true }] } },
  })
  await page.goto('/leases/l1')
  await expect(page.getByTestId('term-ended')).toHaveText('terminée par le congé')
  await expect(page.getByTestId('next-renewal')).toHaveCount(0)
  await page.goto('/assets/a1')
  await expect(page.getByTestId('vacancy-period')).toHaveText('Depuis le 01/11/2026 · 8 jours, en cours')

  await mock(page, {
    terms: { l1: { renews: false, beyond_term: true, terms: [{ n: 1, start_on: '2026-01-01', end_on: '2026-06-30', renewal: 'initial', status: 'past' }] } },
    vacancies: { a1: { asset_id: 'a1', since: '2019-01-10', days_by_year: {}, periods: [] } },
  })
  await page.goto('/leases/l1')
  await expect(page.getByTestId('beyond-term')).toContainText('a dépassé son terme sans date de fin')
  await page.goto('/assets/a1')
  await expect(page.getByTestId('vacancy-none')).toHaveText('Aucune vacance depuis le 10/01/2019.')
})
