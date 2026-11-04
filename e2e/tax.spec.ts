import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// Web slice 5, RENT-FE-001 flow 4 « tax year » under tenure's CSP: computing
// asks for a fresh strong sign-in (step-up), then micro-foncier and the régime
// réel side by side, each 2044 line expandable to its charges and payments,
// a charge without a supporting document in orange, and the issue under the
// chosen regime with its PDF and CSV. Plus the accountant's read-only view.
// The 2044 line numbers and the lock-in years are made up: the app must read
// them from the parameters, never know them.

interface Req { method: string; path: string; query?: string; csrf?: string; body?: Record<string, unknown> }
const requests = async (page: Page): Promise<Req[]> => (await page.request.get('/__mock/requests')).json()
const owner = '00000000-0000-7000-8000-000000000001'

const fixture = {
  year: 2025, millesime: 2026, flags: [{ kind: 'missing_document', id: 'c2' }],
  owners: [{
    owner_id: owner,
    micro: { eligible: true, gross_cents: 960000, allowance_cents: 288000, taxable_cents: 672000 },
    reel: { income_cents: 960000, other_expenses_cents: 250000, interest_cents: 120000, net_cents: 590000, taxable_cents: 590000, carried_forward: [], prior_used: [], expired: [] },
    totals: [
      { line: '901', amount_cents: 960000, sources: ['p1'] },
      { line: '902', amount_cents: 50000, sources: ['c1'] },
      { line: '903', amount_cents: 200000, sources: ['c2'] },
      { line: '904', amount_cents: 120000, sources: ['c3'] },
    ],
    assets: [{ asset_id: 'a1', furnished: false, net_cents: 590000 }],
  }],
}

async function mock(page: Page, state: Record<string, unknown> = {}): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', {
    data: {
      assets: [{ id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', version: 1, shares: [{ owner_id: owner, bp: 10000 }] }],
      leases: [{ id: 'l1', kind: 'unfurnished', state: 'active', asset_ids: ['a1'], tenants: [], start_on: '2024-01-01', term_months: 36, rent_cents: 80000, version: 2 }],
      charges: [
        { id: 'c1', asset_id: 'a1', category: 'management', label: 'Frais d’agence 2025', amount_cents: 50000, recoverable_cents: 0, charged_on: '2025-06-30', exercise_year: 2025, status: 'confirmed', source: 'manual', version: 1 },
        { id: 'c2', asset_id: 'a1', category: 'property_tax', label: 'Taxe foncière 2025', amount_cents: 200000, recoverable_cents: 0, charged_on: '2025-10-15', exercise_year: 2025, status: 'confirmed', source: 'manual', version: 1 },
        { id: 'c3', asset_id: 'a1', category: 'loan_interest', label: 'Intérêts 2025', amount_cents: 120000, recoverable_cents: 0, charged_on: '2025-12-31', exercise_year: 2025, status: 'confirmed', source: 'manual', version: 1 },
      ],
      payments: [{ id: 'p1', lease_id: 'l1', amount_cents: 960000, paid_on: '2025-12-05', method: 'transfer', version: 1, matches: [] }],
      taxFixture: fixture,
      params: {
        form_2044_line_map: { tax_year: 2025, millesime: 2026, lines: { rent: '901', management: '902', property_tax: '903', loan_interest: '904' }, income_lines: ['901'], interest_lines: ['904'] },
        reel_option_lock_years: 7,
      },
      ...state,
    },
  })
}

test('flow 4: a tax year computed after step-up, reviewed line by line, issued', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/tax/2025')
  await expect(page.getByTestId('tax-title')).toHaveText('Revenus fonciers 2025')
  await expect(page.getByTestId('tax-empty')).toBeVisible()

  // A computation without a fresh strong sign-in asks for one.
  await page.getByTestId('compute').click()
  await expect(page.getByTestId('step-up')).toBeVisible()
  await page.getByTestId('step-up').getByRole('button', { name: 'Continuer vers Socrate' }).click()
  await expect(page.locator('#socrate')).toBeVisible()
  const login = (await requests(page)).find((r) => r.path === '/bff/login')
  expect(login?.query).toContain('step_up=1')
  expect(decodeURIComponent(login?.query ?? '')).toContain('return_to=/tax/2025')

  // Back from Socrate with a fresh sign-in.
  await page.request.post('/__mock/state', { data: { stepUpFresh: true } })
  await page.goto('/tax/2025')
  await page.getByTestId('compute').click()
  await expect(page.getByTestId('tax-state')).toHaveText('brouillon')
  await expect(page.getByTestId('micro-taxable')).toHaveText(/6\s720,00\s€/)
  await expect(page.getByTestId('reel-taxable')).toHaveText(/5\s900,00\s€/)
  await expect(page.getByTestId('lower-note')).toContainText('Régime réel')

  // The lines come from the parameter: numbers and their categories.
  await expect(page.getByTestId('line-number')).toHaveText(['901', '902', '903', '904'])
  const tax = page.getByTestId('line').filter({ hasText: '903' })
  await expect(tax).toContainText('Taxe foncière')
  await expect(tax).toHaveClass(/bg-orange-50/)
  await expect(page.getByTestId('tax-flags')).toContainText('1 charge(s) sans justificatif')
  await tax.click()
  await expect(page.getByTestId('source')).toContainText([/Taxe foncière 2025 — 2\s000,00\s€ · sans justificatif/])
  await page.getByTestId('line').filter({ hasText: '901' }).click()
  await expect(page.getByTestId('line-sources').first()).toContainText(/Paiement — 9\s600,00\s€/)

  // Issue under the régime réel, proposed as the lower base; its lock-in comes from the parameter.
  await page.getByTestId('issue-tax').click()
  await expect(page.locator('#reg_reel')).toBeChecked()
  await expect(page.getByTestId('confirm-dialog')).toContainText('vous engage pour 7 ans')
  await page.getByTestId('confirm').click()
  await expect(page.getByTestId('tax-state')).toHaveText('émis')
  await expect(page.getByTestId('tax-issued')).toContainText('Régime réel')
  await expect(page.getByTestId('tax-documents').getByTestId('document-card')).toHaveCount(2)
  for (const id of ['compute', 'issue-tax']) await expect(page.getByTestId(id)).toHaveCount(0)
  const posts = (await requests(page)).filter((r) => r.method === 'POST' && r.path === '/tax/summaries')
  expect(posts.map((r) => r.body)).toEqual([{ year: 2025 }, { year: 2025 }, { year: 2025, regime: 'reel' }])
  expect(posts.at(-1)?.csrf).toBe('csrf-test-token')
  expect(violations).toEqual([])
})

test('an accountant reads an issued tax year with no write control', async ({ page }) => {
  await mock(page, {
    role: 'accountant',
    taxSummaries: [{ id: 's1', tax_year: 2025, state: 'issued', regime: 'micro', issued_at: '2026-04-10T08:00:00Z', document_id: 'd1', csv_document_id: 'd2', summary: fixture, inputs: {}, version: 2 }],
  })
  const violations = await watchCSP(page)
  await page.goto('/tax/2025')
  await expect(page.getByTestId('tax-issued')).toContainText('Micro-foncier')
  await expect(page.getByTestId('tax-documents').getByTestId('document-card')).toHaveCount(2)
  for (const id of ['compute', 'issue-tax']) await expect(page.getByTestId(id)).toHaveCount(0)
  expect(violations).toEqual([])
})

test('a computation made while the year is still loading stays on screen', async ({ page }) => {
  // The page's payments arrive late: a click on « Calculer » must not have its
  // draft wiped by the load that finishes after it.
  await mock(page, { stepUpFresh: true, delay: { '/payments': 1500 } })
  const violations = await watchCSP(page)
  await page.goto('/tax/2025')
  await page.getByTestId('compute').click()
  await expect(page.getByTestId('tax-state')).toHaveText('brouillon')
  await page.waitForTimeout(2000)
  await expect(page.getByTestId('tax-state')).toHaveText('brouillon')
  await expect(page.getByTestId('micro-taxable')).toHaveText(/6\s720,00\s€/)
  expect(violations).toEqual([])
})
