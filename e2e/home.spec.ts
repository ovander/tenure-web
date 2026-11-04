import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// Web slice 7a under tenure's CSP: S01 Home lists what needs attention, each
// item linking to its screen (overdue arrears, a blocked draft, a warning on
// a running lease, a payment to match, the month's rent calls to issue), the
// leases' next dates, and the lease hub's activity tab.

const owner = '00000000-0000-7000-8000-000000000001'
const period = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'Europe/Paris' }).format(new Date()).slice(0, 7)

async function mock(page: Page, state: Record<string, unknown> = {}): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: state })
}

const portfolio = {
  assets: [
    { id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', version: 1, shares: [{ owner_id: owner, bp: 10000 }] },
    { id: 'a2', kind: 'house', address: '3 chemin Vert, Nîmes', version: 1, shares: [{ owner_id: owner, bp: 10000 }] },
  ],
  tenants: [{ id: 't1', names: ['Jeanne Martin'], version: 1 }, { id: 't2', names: ['Paul Durand'], version: 1 }],
  leases: [
    { id: 'l1', kind: 'unfurnished', state: 'active', asset_ids: ['a1'], tenants: [{ tenant_id: 't1' }], start_on: '2026-01-01', term_months: 36, rent_cents: 80000, provision_cents: 5000, due_day: 5, irl_ref_quarter: '2025-Q4', revision_month: 1, version: 2 },
    { id: 'l2', kind: 'unfurnished', state: 'draft', asset_ids: ['a2'], tenants: [{ tenant_id: 't2' }], start_on: '2099-01-01', term_months: 36, rent_cents: 90000, provision_cents: 0, due_day: 5, version: 1 },
  ],
  // An unpaid rent call of an earlier month, overdue once today is past its due day.
  billingDocs: [{ id: 'b0', kind: 'rent_call', lease_id: 'l1', period: '2026-01', number: 'AL-00000001-2026-0001', generation: 1, total_cents: 85000, document_id: 'f0', issued_at: '2026-01-01T05:00:00Z' }],
  today: '2099-12-31',
  leaseWarnings: { l1: [{ type: 'lease/diagnostic-expiring', title: 'Le DPE expire bientôt.' }] },
  payments: [{ id: 'p1', lease_id: 'l1', amount_cents: 30000, paid_on: '2026-11-04', method: 'transfer', version: 1, matches: [] }],
}

test('S01 lists what needs attention, most urgent first, each with its link', async ({ page }) => {
  await mock(page, portfolio)
  const violations = await watchCSP(page)
  await page.goto('/')
  const todo = page.getByTestId('todo')
  await expect(todo).toHaveCount(5)
  expect(await todo.evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')))).toEqual(['arrears', 'blocked', 'warning', 'unmatched', 'billing'])
  await expect(todo.nth(0)).toContainText('Jeanne Martin — 12 rue des Lilas, Lyon : 850,00 € en retard')
  await expect(todo.nth(1)).toContainText('Paul Durand — 3 chemin Vert, Nîmes : 3 point(s) à régler')
  await expect(todo.nth(1)).toContainText('DPE')
  await expect(todo.nth(2)).toContainText('Le DPE expire bientôt.')
  await expect(todo.nth(3)).toContainText('1 paiement(s) à rapprocher, 300,00 € non affecté(s)')
  await expect(todo.nth(4)).toContainText('1 appel(s) de loyer à émettre')

  // The next dates come from the leases themselves.
  await expect(page.getByTestId('next-date')).toContainText(['Révision IRL possible en janvier', 'Fin de la période du bail'])
  await expect(page.getByTestId('next')).toContainText('31/12/2028')

  // Each item opens its screen.
  await todo.nth(0).getByTestId('todo-link').click()
  await expect(page).toHaveURL(/\/leases\/l1\/billing$/)
  await page.goBack()
  await todo.nth(1).getByTestId('todo-link').click()
  await expect(page).toHaveURL(/\/leases\/l2\/contract$/)
  await page.goBack()
  await page.getByTestId('todo').nth(3).getByTestId('todo-link').click()
  await expect(page).toHaveURL(/\/billing\/payments\?unmatched=1$/)
  await page.goBack()
  await page.getByTestId('todo').nth(4).getByTestId('todo-link').click()
  await expect(page).toHaveURL(new RegExp(`/billing/${period}$`))
  await page.goBack()
  await page.getByTestId('open-billing').click()
  await expect(page).toHaveURL(new RegExp(`/billing/${period}$`))
  expect(violations).toEqual([])
})

test('S01 says so when nothing needs attention', async ({ page }) => {
  await mock(page, {})
  await page.goto('/')
  await expect(page.getByTestId('todos-none')).toBeVisible()
  await expect(page.getByTestId('next-none')).toBeVisible()
  await expect(page.getByTestId('runs')).toContainText('billing.monthly')
})

test('S01 for a read role shows the same items, and the lease hub has its activity', async ({ page }) => {
  await mock(page, {
    ...portfolio,
    role: 'accountant',
    events: [{ id: 1, action: 'lease.activate', entity_type: 'lease', entity_id: 'l1', actor_sub: 'sub-test', occurred_at: '2026-01-02T09:00:00Z', before: { state: 'draft', version: 1 }, after: { state: 'active', version: 2 } }],
  })
  const violations = await watchCSP(page)
  await page.goto('/')
  await expect(page.getByTestId('todo')).toHaveCount(5)
  await page.goto('/leases/l1/overview')
  await page.getByTestId('tab-activity').click()
  await expect(page).toHaveURL(/\/leases\/l1\/activity$/)
  await expect(page.getByTestId('activity')).toContainText('Bail activé')
  await expect(page.getByTestId('activity')).toContainText('state')
  await expect(page.getByTestId('activity')).not.toContainText('version')
  expect(violations).toEqual([])
})
