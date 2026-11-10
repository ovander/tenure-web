import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// The recovery of unpaid rent under tenure's CSP (RENT-SPEC-011, tenure-api
// Q-121 and Q-122, Q-W36): the next steps on the lease's billing tab, the MD
// letter prepared then its sending recorded, the commandement and the
// clause résolutoire's day; a payment plan spread over the debt suspends
// the escalation, then is cancelled; a lease with nothing overdue shows no
// recovery.

const owner = '00000000-0000-7000-8000-000000000001'
const item = { billing_document_id: 'b1', number: 'AL-00000001-2026-0009', period: '2026-09', due_on: '2026-09-05', total_cents: 75000, paid_cents: 0, outstanding_cents: 75000, overdue: true, days_late: 60 }
async function mock(page: Page, recovery?: Record<string, unknown>): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: {
    assets: [{ id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', version: 1, shares: [{ owner_id: owner, bp: 10000 }] }],
    tenants: [{ id: 't1', names: ['Léa Martin'], version: 1 }],
    leases: [{ id: 'l1', kind: 'unfurnished', state: 'active', asset_ids: ['a1'], tenants: [{ tenant_id: 't1' }], start_on: '2025-01-01', term_months: 36, rent_cents: 70000, provision_cents: 5000, due_day: 5, version: 3 }],
    ...(recovery ? { recovery: { l1: recovery } } : {}),
  } })
}
const episode = () => ({
  arrears: { lease_id: 'l1', items: [item], outstanding_cents: 75000, overdue_cents: 75000 }, since: '2026-09-05', steps: [],
  next: [{ kind: 'formal_notice', due_on: '2026-09-20', overdue: true }, { kind: 'surety_notice', due_on: '2026-10-05', overdue: true, guarantee_id: 'g1' }],
  sureties: [{ guarantee_id: 'g1', name: 'Gilles Exemple', address: '5 rue Fictive, Lyon' }], insured: false,
})

test('the next steps, the MD letter and its sending, then the commandement and the clause résolutoire', async ({ page }) => {
  await mock(page, episode())
  const violations = await watchCSP(page)
  await page.goto('/leases/l1/billing')
  const card = page.getByTestId('recovery-card')
  await expect(card.getByTestId('recovery-since')).toContainText('05/09/2026')
  await expect(card.getByTestId('recovery-next')).toHaveCount(2)
  await expect(card.getByTestId('recovery-next').nth(1)).toContainText('Information de la caution — Gilles Exemple')

  const notice = card.getByTestId('recovery-next').first()
  await notice.getByTestId('recovery-record').click()
  await page.getByTestId('recovery-step-save').click()
  await expect(page.getByTestId('form-error')).toBeVisible()
  await page.getByRole('button', { name: 'Annuler' }).click()

  await notice.getByTestId('recovery-letter').click()
  await expect(notice.getByTestId('recovery-letter-download')).toHaveText(/MD-00000001-2026-0001/)
  await notice.getByTestId('recovery-record').click()
  await expect(page.getByTestId('recovery-step-letter')).toContainText('MD-00000001-2026-0001')
  await page.locator('#recovery_tracking').fill('1A 000 000 0000 1')
  await page.getByTestId('recovery-step-save').click()
  await expect(card.getByTestId('recovery-step')).toHaveCount(1)
  await expect(card.getByTestId('recovery-step').first()).toContainText('Mise en demeure')

  const cmd = card.getByTestId('recovery-next').filter({ hasText: 'Commandement de payer' })
  await cmd.getByTestId('recovery-record').click()
  await page.getByTestId('recovery-step-save').click()
  await expect(card.getByTestId('recovery-resolution')).toContainText('La clause résolutoire peut produire effet')
  await expect(card.getByTestId('recovery-next').filter({ hasText: 'Saisine du juge' })).toHaveCount(1)
  expect(violations).toEqual([])
})

test('a payment plan spread over the debt suspends the escalation, then is cancelled', async ({ page }) => {
  await mock(page, episode())
  await page.goto('/leases/l1/billing')
  const card = page.getByTestId('recovery-card')
  await card.getByTestId('plan-propose').click()
  const d = page.getByTestId('plan-dialog')
  await expect(d.getByTestId('plan-row')).toHaveCount(3)
  await expect(d.getByTestId('plan-total')).toContainText('750,00')
  await d.getByTestId('plan-amount').nth(2).locator('input').fill('100')
  await d.getByTestId('plan-check').click()
  await expect(d.getByTestId('plan-rows-error')).toContainText('la dette est de 750,00')
  await d.getByTestId('plan-spread').click()
  await d.getByTestId('plan-check').click()
  await expect(d.getByTestId('plan-checked')).toBeVisible()
  await d.getByTestId('plan-save').click()
  await expect(d).toBeHidden()
  await expect(card.getByTestId('plan-status')).toHaveText('respecté')
  await expect(card.getByTestId('recovery-suspended')).toBeVisible()
  await expect(card.getByTestId('recovery-next')).toHaveCount(0)
  await expect(card.getByTestId('plan-propose')).toHaveCount(0)

  await card.getByTestId('plan-cancel').click()
  await expect(card.getByTestId('plan-status')).toHaveText('annulé')
  await expect(card.getByTestId('recovery-suspended')).toHaveCount(0)
  await expect(card.getByTestId('recovery-next')).toHaveCount(2)
})

test('nothing overdue: no recovery card', async ({ page }) => {
  await mock(page, { arrears: { lease_id: 'l1', items: [], outstanding_cents: 0, overdue_cents: 0 }, steps: [], next: [], sureties: [], insured: false })
  await page.goto('/leases/l1/billing')
  await expect(page.getByTestId('lease-billing')).toBeVisible()
  await expect(page.getByTestId('recovery-card')).toHaveCount(0)
})
