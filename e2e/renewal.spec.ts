import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// The rent re-evaluation at renewal under tenure's CSP (RENT-SPEC-010,
// tenure-api Q-120, Q-W35): the proposal and its references computed, the PR
// letter, its reception, the tenant's answer; an accepted proposal's due
// step applied to the rent; a furnished lease shows nothing.

const owner = '00000000-0000-7000-8000-000000000001'
async function mock(page: Page, lease: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: {
    assets: [{ id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', version: 1, shares: [{ owner_id: owner, bp: 10000 }] }],
    tenants: [{ id: 't1', names: ['Léa Martin'], version: 1 }],
    leases: [{ id: 'l1', kind: 'unfurnished', state: 'active', asset_ids: ['a1'], tenants: [{ tenant_id: 't1' }], start_on: '2024-07-01', term_months: 36, rent_cents: 70000, provision_cents: 5000, due_day: 5, version: 3, ...lease }],
    ...extra,
  } })
}

test('the owner proposes a new rent with three references, issues the PR letter, records its reception and the answer', async ({ page }) => {
  await mock(page, {})
  const violations = await watchCSP(page)
  await page.goto('/leases/l1')
  await expect(page.getByTestId('renewal-none')).toHaveText('Aucune proposition de nouveau loyer.')
  await page.getByTestId('renewal-propose').click()
  const d = page.getByTestId('renewal-dialog')
  await d.getByTestId('renewal-proposed').locator('input').fill('730,01')
  for (const [i, addr] of ['1 rue Fictive, Lyon', '2 rue Fictive, Lyon'].entries()) {
    await d.getByTestId('ref-address').nth(i).fill(addr)
    await d.getByTestId('ref-rent').nth(i).locator('input').fill('800')
  }
  await d.getByTestId('renewal-preview').click()
  await expect(d.getByTestId('form-error')).toBeVisible()
  await d.getByTestId('ref-address').nth(2).fill('3 rue Fictive, Lyon')
  await d.getByTestId('ref-rent').nth(2).locator('input').fill('800')
  await d.getByTestId('renewal-preview').click()
  await expect(d.getByTestId('renewal-terms')).toContainText('Hausse de 30,01')
  await expect(d.getByTestId('renewal-preview-steps').locator('li')).toHaveCount(3)
  await expect(d.getByTestId('renewal-preview-steps').locator('li').nth(2)).toContainText('730,01')
  await d.getByTestId('renewal-issue').click()
  await expect(d).toBeHidden()

  const card = page.getByTestId('renewal-card')
  await expect(card.getByTestId('renewal-status')).toHaveText('lettre prête, à remettre')
  await expect(card.getByTestId('renewal-rents')).toContainText('Loyer actuel 700,00')
  await expect(card.getByTestId('renewal-step')).toHaveCount(3)
  await card.getByTestId('renewal-reception').click()
  await page.getByTestId('renewal-step-save').click()
  await expect(card.getByTestId('renewal-status')).toHaveText('reçue, en attente de réponse')
  await expect(card.getByTestId('renewal-propose')).toHaveCount(0)
  await card.getByTestId('renewal-answer').click()
  await page.getByTestId('renewal-answer-select').click()
  await page.getByRole('option', { name: 'Refusée', exact: true }).click()
  await page.getByTestId('renewal-step-save').click()
  await expect(card.getByTestId('renewal-status')).toHaveText('refusée')
  await expect(card.getByTestId('renewal-refused')).toContainText('commission départementale de conciliation')

  await page.goto('/documents')
  expect(violations).toEqual([])
})

test('an accepted proposal with a step due is applied to the rent; a furnished lease shows nothing', async ({ page }) => {
  await mock(page, {}, { renewals: { l1: [{ id: 'r1', lease_id: 'l1', renewal_on: '2026-07-01', status: 'accepted', document_id: 'd1', received_on: '2025-12-01', answered_on: '2025-12-20', steps_applied: 0, steps_due: 1, version: 3,
    proposal: { proposed_rent_cents: 73000, references: [] },
    terms: { renewal_on: '2026-07-01', latest_receipt_on: '2025-12-31', current_rent_cents: 70000, increase_cents: 3000, increase_bp: 428, references_mean_cents: 80000,
      steps: [{ from: '2026-07-01', rent_cents: 71000 }, { from: '2027-07-01', rent_cents: 72000 }, { from: '2028-07-01', rent_cents: 73000 }] } }] } })
  await page.goto('/leases/l1')
  const card = page.getByTestId('renewal-card')
  await expect(card.getByTestId('renewal-due')).toHaveText('1 palier(s) échu(s) à appliquer au loyer.')
  await card.getByTestId('renewal-apply').click()
  await expect(page.getByText('Loyer porté à 710,00')).toBeVisible()
  await expect(card.getByTestId('renewal-step').first()).toContainText('appliqué')
  await expect(card.getByTestId('renewal-apply')).toHaveCount(0)

  await mock(page, { kind: 'furnished', term_months: 12 })
  await page.goto('/leases/l1')
  await expect(page.getByTestId('lease-assets')).toBeVisible()
  await expect(page.getByTestId('renewal-card')).toHaveCount(0)
})
