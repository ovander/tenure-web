import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// The obligations calendar (Q-W32): the home's next 90 days from the API,
// overdue items flagged, each linking to where it is dealt with; an asset's
// coming year on its « Échéances » tab; the accountant falls back to the
// leases' own dates.

const owner = '00000000-0000-7000-8000-000000000001'
async function mock(page: Page): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: {
    assets: [{ id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', version: 1, shares: [{ owner_id: owner, bp: 10000 }] },
      { id: 'a2', kind: 'house', address: '3 chemin Vert, Annecy', version: 1, shares: [{ owner_id: owner, bp: 10000 }] }],
    tenants: [{ id: 't1', names: ['Léa Martin'], version: 1 }],
    leases: [{ id: 'l1', kind: 'unfurnished', state: 'notice', asset_ids: ['a1'], tenants: [{ tenant_id: 't1' }], start_on: '2025-01-15', end_on: '2026-12-31', term_months: 36, rent_cents: 80000, provision_cents: 5000, due_day: 5, irl_ref_quarter: '2024-Q3', revision_month: 1, version: 3 }],
    calendar: [
      { on: '2026-10-01', kind: 'diagnostic_expiry', status: 'overdue', asset_id: 'a2', ref: 'dpe' },
      { on: '2026-11-12', kind: 'completion_window', status: 'upcoming', asset_id: 'a1', lease_id: 'l1', ref: 'ten_day' },
      { on: '2026-12-31', kind: 'notice_end', status: 'upcoming', asset_id: 'a1', lease_id: 'l1' },
      { on: '2027-01-31', kind: 'deposit_deadline', status: 'upcoming', asset_id: 'a1', lease_id: 'l1' },
    ],
  } })
}

test('the home lists the next 90 days and an asset its coming year', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/')
  const items = page.getByTestId('calendar-item')
  await expect(items).toHaveCount(4)
  await expect(items.nth(0)).toContainText('01/10/2026')
  await expect(items.nth(0)).toContainText('Fin de validité du diagnostic DPE')
  await expect(items.nth(0).getByTestId('calendar-overdue')).toHaveText('En retard')
  await expect(items.nth(0)).toContainText('3 chemin Vert')
  await expect(items.nth(1)).toContainText('Fin du délai de complément de l’état des lieux d’entrée')
  await expect(items.nth(3)).toContainText('Restitution du dépôt de garantie au plus tard')
  await items.nth(3).getByTestId('calendar-link').click()
  await expect(page).toHaveURL(/\/leases\/l1\/deposit$/)

  await page.goto('/assets/a2/deadlines')
  await expect(page.getByTestId('asset-calendar').getByTestId('calendar-item')).toHaveCount(1)
  await expect(page.getByTestId('asset-calendar')).toContainText('DPE')
  const req = ((await (await page.request.get('/__mock/requests')).json()) as { path: string; method: string }[]).filter((r) => r.path === '/calendar')
  expect(req.length).toBeGreaterThan(1)
  expect(violations).toEqual([])
})

test('an accountant sees the leases’ own dates instead', async ({ page }) => {
  await mock(page)
  await page.request.post('/__mock/state', { data: { role: 'accountant' } })
  await page.goto('/')
  await expect(page.getByTestId('calendar-item')).toHaveCount(0)
  await expect(page.getByTestId('next-date').first()).toBeVisible()
})
