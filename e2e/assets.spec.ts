import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// Web slice 1 (RENT-FE-001 S02–S04) under tenure's CSP: list, create, hub,
// edit with If-Match and a stale version, a diagnostic, the activity tab,
// and the read-only view of an accountant.

interface Req { method: string; path: string; csrf?: string; ifMatch?: string; body?: Record<string, unknown> }
const requests = async (page: Page): Promise<Req[]> => (await page.request.get('/__mock/requests')).json()
async function mock(page: Page, state: Record<string, unknown> = {}): Promise<void> {
  await page.request.post('/__mock/reset')
  if (Object.keys(state).length) await page.request.post('/__mock/state', { data: state })
}

// Q-W14: a Baillargues flat is in a zone tendue without rent control; a
// rent-control area always is one, and the switch shows it locked on.
test('an owner records a flat in a zone tendue without rent control', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/assets/new')
  await page.locator('#address').fill('3 rue du Fort, 34670 Baillargues')
  await page.locator('#surface').fill('40')
  await expect(page.locator('#tense_zone')).not.toBeChecked()
  await page.locator('#controlled_zone').check()
  await expect(page.locator('#tense_zone')).toBeChecked()
  await expect(page.locator('#tense_zone')).toBeDisabled()
  await page.locator('#controlled_zone').uncheck()
  await expect(page.locator('#tense_zone')).toBeEnabled()
  await expect(page.locator('#tense_zone')).not.toBeChecked()
  await page.locator('#tense_zone').check()
  await expect(page.locator('#rent_zone')).toHaveCount(0)
  await page.getByTestId('help-tense_zone').focus()
  await expect(page.getByTestId('help-text-tense_zone')).toBeVisible()
  await expect(page.getByTestId('help-text-tense_zone')).toContainText('simulateur de service-public.fr')
  await page.getByTestId('save').click()

  await expect(page.getByTestId('details')).toContainText('Zone tendue')
  await expect(page.getByTestId('details')).toContainText(/Zone tendue\s*Oui/)
  const create = (await requests(page)).filter((r) => r.method === 'POST' && r.path === '/assets').at(-1)
  expect(create?.body).toMatchObject({ tense_zone: true, controlled_zone: false, rent_control_zone: '', rent_control_category: '' })
  expect(violations).toEqual([])
})

test('an owner creates an apartment, edits it after a concurrent change, adds a DPE', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/assets')
  await expect(page.getByTestId('assets-empty')).toBeVisible()
  await page.getByTestId('add-asset').click()

  // Validation from the API lands on the field.
  await page.getByTestId('save').click()
  await expect(page.getByTestId('error-address')).toHaveText('L’adresse est obligatoire.')

  await page.locator('#address').fill('12 rue des Lilas, 69003 Lyon')
  await page.locator('#lot').fill('Lot 4')
  await page.locator('#surface').fill('45,5')
  await page.locator('#acquisition').fill('185 000')
  await page.locator('#controlled_zone').check()
  await page.getByTestId('save').click()
  await expect(page.getByTestId('error-rent_zone')).toContainText('Zone et catégorie')
  await page.locator('#rent_zone').fill('Lyon-3')
  await page.locator('#rent_category').fill('T2 avant 1946')
  await page.getByTestId('save').click()

  await expect(page.getByTestId('asset-title')).toHaveText('12 rue des Lilas, 69003 Lyon · Lot 4')
  await expect(page.getByTestId('details')).toContainText('45,50 m²')
  await expect(page.getByTestId('details')).toContainText('185 000,00 €')
  await expect(page.getByTestId('shares')).toContainText('Bailleur Test')
  await expect(page.getByTestId('shares')).toContainText('100 %')
  const create = (await requests(page)).filter((r) => r.method === 'POST' && r.path === '/assets').at(-1)
  expect(create?.csrf).toBe('csrf-test-token')
  expect(create?.body).toMatchObject({ kind: 'apartment', surface_hundredths_m2: 4550, acquisition_cents: 18500000, rent_control_zone: 'Lyon-3' })
  const id = page.url().split('/').at(-1)!

  // Someone else saves first: the form reloads and says so; the next save wins.
  await page.getByTestId('edit-asset').click()
  await expect(page.getByText('Le type d’un bien ne change pas après sa création.')).toBeVisible()
  await expect(page.locator('#kind button, #kind [role=radio], #kind input').first()).toBeDisabled()
  await page.request.post(`/__mock/bump?id=${id}`)
  await page.locator('#lot').fill('Lot 5')
  await page.getByTestId('save').click()
  await expect(page.getByTestId('form-error')).toContainText('ont changé entre-temps')
  await page.locator('#lot').fill('Lot 5')
  await page.getByTestId('save').click()
  await expect(page.getByTestId('asset-title')).toHaveText('12 rue des Lilas, 69003 Lyon · Lot 5')
  const puts = (await requests(page)).filter((r) => r.method === 'PUT' && r.path === `/assets/${id}`)
  expect(puts.map((r) => r.ifMatch)).toEqual(['W/"1"', 'W/"2"'])
  expect(puts.at(-1)?.body?.shares).toEqual([{ owner_id: '00000000-0000-7000-8000-000000000001', bp: 10000 }])

  // A DPE needs its class.
  await page.getByTestId('add-diagnostic').click()
  await page.locator('#diag_done').fill('15/03/2025')
  await page.locator('#diag_done').press('Tab')
  await page.getByTestId('save-diagnostic').click()
  await expect(page.getByTestId('diag-error')).toBeVisible()
  await page.locator('#diag_result').click()
  await page.getByRole('option', { name: 'C', exact: true }).click()
  await page.getByTestId('save-diagnostic').click()
  await expect(page.getByTestId('diagnostics')).toContainText('15/03/2025')
  await expect(page.getByTestId('diagnostics')).toContainText('C')
  const diag = (await requests(page)).filter((r) => r.method === 'POST' && r.path.endsWith('/diagnostics')).at(-1)
  expect(diag?.body).toMatchObject({ kind: 'dpe', done_on: '2025-03-15', result: 'C' })

  // The activity tab lists the creation and the change.
  await page.getByTestId('tab-activity').click()
  await expect(page).toHaveURL(new RegExp(`/assets/${id}/activity$`))
  await expect(page.getByTestId('activity')).toContainText('Bien modifié')
  await expect(page.getByTestId('activity')).toContainText('lot')
  await expect(page.getByTestId('activity')).toContainText('Bien créé')
  await page.getByTestId('tab-leases').click()
  await expect(page.getByTestId('asset-leases')).toContainText('Aucun bail')
  await page.getByTestId('tab-documents').click()
  await expect(page.getByTestId('docs-empty')).toBeVisible()

  // Back in the list, the row opens the hub.
  await page.getByRole('link', { name: 'Biens', exact: true }).first().click()
  await expect(page.getByTestId('assets')).toContainText('45,50 m²')
  await page.getByTestId('assets').getByText('Appartement').click()
  await expect(page).toHaveURL(new RegExp(`/assets/${id}$`))
  expect(violations).toEqual([])
})

test('a box is attached to a dwelling and has no dwelling fields', async ({ page }) => {
  await mock(page, {
    assets: [{ id: 'a-house', kind: 'house', address: '3 chemin Vert, Annecy', version: 1, shares: [] }],
  })
  await page.goto('/assets/new')
  await page.getByText('Box', { exact: true }).click()
  await expect(page.locator('#surface')).toHaveCount(0)
  await expect(page.locator('#furnished')).toHaveCount(0)
  await page.locator('#address').fill('3 chemin Vert, Annecy')
  await page.locator('#parent').click()
  await page.getByRole('option', { name: '3 chemin Vert, Annecy' }).click()
  await page.getByTestId('save').click()
  await expect(page.getByTestId('details')).toContainText('3 chemin Vert, Annecy')
  const create = (await requests(page)).filter((r) => r.method === 'POST' && r.path === '/assets').at(-1)
  expect(create?.body).toMatchObject({ kind: 'box', parent_asset_id: 'a-house', furnished: false, controlled_zone: false })
})

test('an accountant reads assets without any write control', async ({ page }) => {
  await mock(page, {
    role: 'accountant',
    assets: [{ id: 'a1', kind: 'apartment', address: '5 quai Perrache, Lyon', surface_hundredths_m2: 3000, version: 1, shares: [] }],
  })
  await page.goto('/assets')
  await expect(page.getByTestId('assets')).toContainText('5 quai Perrache, Lyon')
  await expect(page.getByTestId('add-asset')).toHaveCount(0)
  await page.getByTestId('assets').getByText('5 quai Perrache, Lyon').click()
  await expect(page.getByTestId('asset-title')).toBeVisible()
  await expect(page.getByTestId('edit-asset')).toHaveCount(0)
  await expect(page.getByTestId('add-diagnostic')).toHaveCount(0)
  await expect(page.getByTestId('tab-activity')).toBeVisible()
  // The form is not reachable by URL either.
  await page.goto('/assets/new')
  await expect(page).toHaveURL(/\/$/)
})

test('an unknown asset says so', async ({ page }) => {
  await mock(page)
  await page.goto('/assets/00000000-0000-7000-8000-00000000dead')
  await expect(page.getByTestId('asset-missing')).toBeVisible()
})

// Test install findings (tenure-api #258): a diagnostic shows its effective
// expiry, the earlier of the report's date and the legal validity; the
// deadlines tab has its title; the home names the jobs in words.
test('a diagnostic shows its effective expiry, tabs and job runs are in words', async ({ page }) => {
  await mock(page, {
    assets: [{ id: 'a1', kind: 'apartment', address: '5 quai Perrache, Lyon', surface_hundredths_m2: 3000, furnished: false, version: 1, shares: [] }],
    diagnostics: [{ id: 'g1', asset_id: 'a1', kind: 'erp', done_on: '2026-06-01', valid_until: '2030-12-31', expires_on: '2026-11-30', version: 1 }],
    runs: [{ id: 'r1', job: 'billing.monthly', period: '2026-11', status: 'succeeded', finished_at: '2026-11-01T05:04:00Z' }],
  })
  const violations = await watchCSP(page)
  await page.goto('/assets/a1')
  await expect(page.getByTestId('diag-expires')).toHaveText('30/11/2026')
  await expect(page.getByTestId('diag-legal-cap')).toContainText('31/12/2030')
  await expect(page.getByTestId('tab-deadlines')).toHaveText('Échéances')
  // An unfurnished asset has no furnished tab.
  await expect(page.getByTestId('tab-furnished')).toHaveCount(0)
  await page.goto('/')
  await expect(page.getByTestId('run-job').first()).toHaveText('Appels de loyer du mois')
  expect(violations).toEqual([])
})
