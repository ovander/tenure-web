import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// The SCI at the income tax under tenure's CSP (RENT-SPEC-019 part 19,
// tenure-api Q-133, Q-W42): a person creates an SCI behind the step-up and
// lands in its scope; its register of associates through subscriptions and
// a transfer, a capital exceeded refused; its 2072, blocked while the
// register falls short or the year is open, issued behind the step-up; the
// associate's shares, a loan for parts, the dashboard per person and the
// SCI's own dashboard.

const sciID = '00000000-0000-7000-8000-0000000005c1'
const lastYear = new Date().getFullYear() - 1
async function reset(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: extra })
}
async function inSCI(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  await reset(page, {
    entities: [{ id: sciID, kind: 'sci', legal_name: 'SCI des Tilleuls', siren: '123456789', tax_regime: 'ir', capital_parts: 1000, version: 1 }],
    extraScopes: [{ owner_id: sciID, legal_name: 'SCI des Tilleuls', role: 'owner', kind: 'sci', manager: true }],
    ...extra,
  })
  await page.addInitScript((id) => sessionStorage.setItem('tenure.scope', id), sciID)
}
const fill = async (page: Page, sel: string, v: string) => {
  await page.locator(sel).fill(v)
  await page.locator(sel).press('Tab')
}
const pick = async (page: Page, testId: string, name: string | RegExp) => {
  await page.getByTestId(testId).click()
  await page.getByRole('option', { name, exact: typeof name === 'string' }).last().click()
}

test('an SCI created behind the step-up, its register through its movements', async ({ page }) => {
  await reset(page)
  const violations = await watchCSP(page)
  await page.goto('/settings/profile')
  await page.getByTestId('sci-create').click()
  const d = page.getByTestId('entity-dialog')
  await d.getByTestId('entity-name').fill('SCI des Tilleuls')
  await d.getByTestId('entity-siren').fill('123 456')
  await d.getByTestId('entity-parts').locator('input').fill('1000')
  await d.getByTestId('entity-save').click()
  await expect(d).toContainText('neuf chiffres')
  await d.getByTestId('entity-siren').fill('123 456 789')
  await d.getByTestId('entity-save').click()
  await expect(page.getByTestId('step-up')).toBeVisible()
  await page.request.post('/__mock/state', { data: { stepUpFresh: true } })
  await page.goto('/settings/profile')
  await page.getByTestId('sci-create').click()
  await d.getByTestId('entity-name').fill('SCI des Tilleuls')
  await d.getByTestId('entity-parts').locator('input').fill('1000')
  await d.getByTestId('entity-save').click()

  await expect(page).toHaveURL(/\/sci$/)
  await expect(page.getByTestId('sci-name')).toContainText('SCI des Tilleuls')
  await expect(page.getByTestId('sci-capital')).toContainText('1000 parts')
  await expect(page.getByTestId('scope')).toContainText('SCI des Tilleuls (SCI · gérant)')
  await expect(page.getByRole('link', { name: 'Impôts' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '2072' }).first()).toBeVisible()
  await expect(page.getByTestId('register-empty')).toBeVisible()

  const a = page.getByTestId('associate-dialog')
  await page.getByTestId('associate-add').click()
  await a.getByTestId('associate-name').fill('Gérante Fictive')
  await pick(page, 'associate-link', 'Moi')
  await a.getByTestId('associate-save').click()
  await expect(a).toBeHidden()
  await page.getByTestId('associate-add').click()
  await a.getByTestId('associate-name').fill('Associé Fictif')
  await a.getByTestId('associate-save').click()
  await expect(page.getByTestId('associate')).toHaveCount(2)
  await expect(page.getByTestId('associate-me')).toHaveCount(1)

  const m = page.getByTestId('movement-dialog')
  const subscribe = async (to: string, parts: string) => {
    await page.getByTestId('movement-add').click()
    await fill(page, '#mv_date', '10/01/2024')
    await m.getByTestId('movement-parts').locator('input').fill(parts)
    await pick(page, 'movement-to', to)
    await m.getByTestId('movement-save').click()
  }
  await subscribe('Gérante Fictive', '600')
  await expect(m).toBeHidden()
  await subscribe('Associé Fictif', '401')
  await expect(m.getByTestId('form-error')).toContainText('dépasseraient le capital')
  await m.getByTestId('movement-parts').locator('input').fill('400')
  await m.getByTestId('movement-save').click()
  await expect(m).toBeHidden()
  await expect(page.getByTestId('register-held')).toContainText('1000 parts détenues sur 1000')

  // A transfer: 200 of the manager's 600 to the other associate.
  await page.getByTestId('movement-add').click()
  await pick(page, 'movement-reason', 'Cession')
  await fill(page, '#mv_date', '01/07/2025')
  await m.getByTestId('movement-parts').locator('input').fill('200')
  await pick(page, 'movement-from', /Gérante Fictive · 600 parts/)
  await pick(page, 'movement-to', 'Associé Fictif')
  await m.getByTestId('movement-save').click()
  await expect(m).toBeHidden()
  await expect(page.getByTestId('movement')).toHaveCount(3)
  await fill(page, '#reg_on', '31/12/2025')
  const rows = page.getByTestId('associate')
  await expect(rows.nth(0).getByTestId('associate-parts')).toHaveText('400')
  await expect(rows.nth(1).getByTestId('associate-parts')).toHaveText('600')
  await expect(rows.nth(0)).toContainText('40 %')
  await expect(rows.nth(0).getByTestId('holding')).toHaveCount(2)
  expect(violations).toEqual([])
})

test('the 2072: blocked while the register falls short, issued behind the step-up', async ({ page }) => {
  await inSCI(page, {
    sci2072: { [lastYear]: { income_cents: 1800001, interest_cents: 300000, other_expenses_cents: 800001, net_cents: 700000, furnished_receipts_cents: 0, lines: [], flags: [] } },
    sci2072Alloc: { [lastYear]: [
      { name: 'Gérante Fictive', parts: 400, income_cents: 720001, interest_cents: 120000, other_expenses_cents: 320001, net_cents: 280000 },
      { name: 'Associé Fictif', parts: 600, income_cents: 1080000, interest_cents: 180000, other_expenses_cents: 480000, net_cents: 420000 }] },
  })
  const violations = await watchCSP(page)
  await page.goto(`/sci/2072/${lastYear}`)
  await expect(page.getByTestId('sci2072-title')).toContainText(String(lastYear))
  await expect(page.getByTestId('sci2072-blocker')).toContainText('ne font pas le capital')
  await expect(page.getByTestId('issue-2072')).toBeDisabled()

  // The register filled: 1000 parts held on 31 December.
  await page.request.post('/__mock/state', { data: {
    sciAssociates: [{ id: 'a1', name: 'Gérante Fictive', me: true, person_sub: 'sub-test', version: 1 }, { id: 'a2', name: 'Associé Fictif', version: 1 }],
    sciHoldings: [{ id: 'h1', associate_id: 'a1', parts: 400, from_on: '2020-01-01' }, { id: 'h2', associate_id: 'a2', parts: 600, from_on: '2020-01-01' }],
  } })
  await page.reload()
  await expect(page.getByTestId('sci2072-blocker')).toHaveCount(0)
  await expect(page.getByTestId('sci2072-net')).toHaveText(/7\s000,00\s€/)
  await expect(page.getByTestId('sci2072-allocation')).toHaveCount(2)
  await expect(page.getByTestId('sci2072-allocation').first()).toContainText('40 %')
  await expect(page.getByTestId('allocation-net').first()).toHaveText(/2\s800,00\s€/)

  await page.getByTestId('issue-2072').click()
  await page.getByTestId('confirm-dialog').getByTestId('confirm').click()
  await expect(page.getByTestId('step-up')).toBeVisible()
  await page.request.post('/__mock/state', { data: { stepUpFresh: true } })
  await page.reload()
  await page.getByTestId('issue-2072').click()
  await page.getByTestId('confirm-dialog').getByTestId('confirm').click()
  await expect(page.getByTestId('sci2072-declared')).toBeVisible()
  await expect(page.getByTestId('sci2072-issue')).toHaveCount(0)

  // In the SCI's scope a grant may appoint a manager.
  await page.goto('/settings/grants')
  await page.getByTestId('invite').click()
  await expect(page.getByTestId('role-manager')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto(`/sci/2072/${lastYear}`)

  // The year after is open.
  await page.getByTestId('year-next').click()
  await expect(page.getByTestId('sci2072-blocker')).toContainText('pas close')
  // The SCI's dashboard has no 2044 estimate.
  await page.request.post('/__mock/state', { data: { dashboards: { [lastYear]: { year: lastYear, as_of: `${lastYear}-12-31`, assets: [], portfolio: {}, months: [],
    year_to_date: {}, previous_year: {}, tax: { available: false, reason: 'entity/sci' } } } } })
  await page.goto(`/dashboard/${lastYear}`)
  await expect(page.getByTestId('tax-sci-scope')).toContainText('2072')
  expect(violations).toEqual([])
})

test("the associate's shares, a loan for parts, the dashboard per person", async ({ page }) => {
  await reset(page, {
    sciShares: { [lastYear]: { shares: [{ declaration_id: 'd1', sci_name: 'SCI des Tilleuls', parts: 400, total_parts: 1000, income_cents: 720001,
      interest_cents: 120000, other_expenses_cents: 320001, net_cents: 280000 }], pending: ['00000000-0000-7000-8000-0000000005c2'] } },
    dashboards: { [lastYear]: { year: lastYear, as_of: `${lastYear}-12-31`, assets: [], portfolio: {}, months: [], year_to_date: {}, previous_year: {},
      tax: { available: true, millesime: lastYear + 1, flags: 1, lower: 'reel', micro: { eligible: false }, reel: { taxable_cents: 249000 },
        sci_shares: [{ declaration_id: 'd1', sci_name: 'SCI des Tilleuls', net_cents: 280000 }],
        parts_loans: [{ loan_id: 'l1', sci_name: 'SCI des Tilleuls', interest_cents: 30000, insurance_cents: 1000 }], sci_pending: 1,
        bic: { declared: false, regime: 'reel', taxable_cents: 0, result_cents: 0, receipts_cents: 1800000 } } } },
  })
  const violations = await watchCSP(page)
  await page.goto(`/shares/${lastYear}`)
  await expect(page.getByTestId('shares-pending')).toContainText('1 SCI')
  await expect(page.getByTestId('share')).toHaveCount(1)
  await expect(page.getByTestId('share')).toContainText('40 %')
  await expect(page.getByTestId('shares-total')).toHaveText(/2\s800,00\s€/)
  await expect(page.getByTestId('parts-loans-empty')).toBeVisible()

  await page.getByTestId('parts-loan-add').click()
  const d = page.getByTestId('loan-dialog')
  await d.getByTestId('loan-label').fill('Prêt pour les parts')
  await d.getByTestId('loan-save').click()
  await expect(d).toContainText('nom de la SCI')
  await d.getByTestId('loan-sci').fill('SCI des Tilleuls')
  await d.getByTestId('loan-mode').getByText('Coller le tableau de la banque').click()
  await fill(page, '#loan_principal', '10 000')
  await d.getByTestId('loan-table').fill(`10/06/${lastYear};10 000;300;10\n`)
  await d.getByTestId('loan-save').click()
  await expect(d).toBeHidden()
  await expect(page.getByTestId('parts-loan')).toHaveCount(1)
  await expect(page.getByTestId('parts-loan')).toContainText(/310,00\s€/)
  const posted = await (await page.request.get('/__mock/requests')).json().catch(() => null)
  if (posted) {
    const loan = posted.find((r: { method: string; path: string }) => r.method === 'POST' && r.path === '/loans')
    expect(loan?.body?.kind).toBe('parts')
    expect(loan?.body?.asset_id).toBeUndefined()
  }

  await page.goto(`/dashboard/${lastYear}`)
  await expect(page.getByTestId('tax-sci-share')).toContainText('SCI des Tilleuls')
  await expect(page.getByTestId('tax-parts-loan')).toContainText(/310,00\s€/)
  await expect(page.getByTestId('tax-sci-pending')).toBeVisible()
  await expect(page.getByTestId('tax-bic')).toContainText('non ajoutée')
  // A person's scope has no SCI page.
  await page.goto('/sci')
  await expect(page).toHaveURL(/\/$/)
  expect(violations).toEqual([])
})
