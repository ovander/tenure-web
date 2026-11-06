import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// The exit inventory and S15d under tenure's CSP (Q-W28): created from the
// issued entry on a lease under notice, each item shown with its entry state
// and « à vérifier » until saved; the return of the keys and the new address
// recorded; completed; compared with the entry (worse, missing, changes only).

interface Req { method: string; path: string; body?: Record<string, unknown> }
const requests = async (page: Page): Promise<Req[]> => (await page.request.get('/__mock/requests')).json()
const owner = '00000000-0000-7000-8000-000000000001'
const iso = new Date().toISOString().slice(0, 10)
const fr = iso.split('-').reverse().join('/')
const item = (id: string, category: string, label: string) => ({ id, category, label, condition: 'good', quantity: 0, comment: '', to_check: false, photos: [], version: 2 })

async function mock(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: {
    assets: [{ id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', version: 1, shares: [{ owner_id: owner, bp: 10000 }] }],
    tenants: [{ id: 't1', names: ['Léa Martin'], version: 1 }],
    leases: [{ id: 'l1', kind: 'unfurnished', state: 'notice', asset_ids: ['a1'], tenants: [{ tenant_id: 't1' }], start_on: '2025-01-01', end_on: '2026-12-31', term_months: 36, rent_cents: 80000, provision_cents: 5000, due_day: 5, version: 3 }],
    inventories: [{ id: 'e1', lease_id: 'l1', kind: 'entry', mode: 'amicable', state: 'issued', done_on: '2025-01-01', document_id: 'd1' }],
    captures: { e1: { id: 'e1', lease_id: 'l1', kind: 'entry', mode: 'amicable', state: 'issued', done_on: '2025-01-01', version: 9, place: '', observations: '',
      rooms: [{ room_id: 'r1', label: 'Séjour', kind: 'living', items: [item('i1', 'floor', 'Parquet'), item('i2', 'walls', 'Murs')] }],
      meters: [{ id: 'm1', kind: 'water_cold', meter_number: 'A12', reading: '100', unit: 'm³', photos: [] }],
      keys: [{ kind: 'key', destination: 'porte d’entrée', quantity: 2, comment: '' }], signatures: [], requests: [],
      parties: [{ party: 'owner', name: 'Bailleur Test', signed: true }, { party: 'tenant', name: 'Léa Martin', signed: true }] } },
    ...extra,
  } })
}

test('the exit is captured from the entry, completed, then compared', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/leases/l1/inventories')
  await page.getByTestId('add-inventory').click()
  await expect(page.locator('#inv_kind')).toContainText('de sortie')
  await expect(page.getByTestId('inventory-mode')).toContainText('Le saisir dans Tenure')
  await page.getByTestId('create-capture').click()
  await expect(page).toHaveURL(/\/inventories\/[^/]+\/capture$/)
  const id = /inventories\/([^/]+)\/capture/.exec(page.url())?.[1] ?? ''
  expect((await requests(page)).find((r) => r.path === '/leases/l1/inventories' && r.method === 'POST')?.body).toEqual({ kind: 'exit', mode: 'amicable' })

  // Each item shows its entry state and is to check.
  await page.getByTestId('schedule').waitFor()
  await page.getByTestId('scheduled-at').fill('2026-12-30T10:00')
  await page.getByTestId('place').fill('Sur place')
  await page.getByTestId('schedule').click()
  await page.getByTestId('start').click()
  const items = page.getByTestId('item')
  await expect(items.nth(0).getByTestId('item-entry')).toHaveText('À l’entrée : Bon état')
  await expect(items.nth(0).getByTestId('to-check')).toBeVisible()
  await expect(page.getByTestId('blocking')).toContainText('Élément repris de l’entrée, pas encore vérifié')
  await expect(page.getByTestId('complete')).toBeDisabled()

  // On site: the parquet is worse, the walls as at entry, one key missing.
  await items.nth(0).getByTestId('condition').getByText('Mauvais état').click()
  await items.nth(0).getByTestId('comment').fill('Tache de 20 cm')
  await items.nth(0).getByTestId('comment').blur()
  await items.nth(1).getByTestId('same-as-entry').click()
  await expect(items.nth(1).getByTestId('to-check')).toHaveCount(0)
  await page.getByTestId('section-keys').click()
  await page.getByTestId('key-qty').locator('input').fill('1')
  await page.getByTestId('save-keys').click()

  // The return of the keys and the new address.
  await page.getByTestId('section-observations').click()
  await expect(page.getByTestId('exit-header')).toBeVisible()
  await page.locator('#head_keys').fill(fr)
  await page.locator('#head_keys').press('Tab')
  await page.getByTestId('new-address').fill('8 avenue Neuve, Grenoble')
  await page.getByTestId('save-header').click()
  const header = (await requests(page)).filter((r) => r.path === `/inventories/${id}` && r.method === 'PUT').at(-1)
  expect(header?.body).toMatchObject({ keys_returned_on: iso, tenant_new_address: '8 avenue Neuve, Grenoble' })
  await expect(page.getByTestId('blocking')).toHaveCount(0)
  await page.getByTestId('complete').click()
  await expect(page.getByTestId('capture-state')).toHaveText('Terminé')

  // S15d: the differences only, then everything.
  await page.getByTestId('to-compare').click()
  await expect(page).toHaveURL(new RegExp(`/inventories/${id}/compare$`))
  await expect(page.getByTestId('flagged')).toContainText('2 écart(s) à qualifier')
  await expect(page.getByTestId('compare-row')).toHaveCount(1)
  await expect(page.getByTestId('compare-row')).toContainText('Parquet')
  await expect(page.getByTestId('compare-row')).toContainText('Bon état')
  await expect(page.getByTestId('compare-row')).toContainText('Mauvais état')
  await expect(page.getByTestId('result')).toHaveText('Dégradé')
  await page.getByTestId('only-changes').click()
  await expect(page.getByTestId('compare-row')).toHaveCount(2)
  await expect(page.getByTestId('compare-key')).toContainText('Manquant')
  expect(violations).toEqual([])
})

test('an exit without an issued entry is recorded from its PDF only; the co-owner reads the comparison; an accountant is refused', async ({ page }) => {
  await mock(page, { inventories: [], captures: {} })
  await page.goto('/leases/l1/inventories')
  await page.getByTestId('add-inventory').click()
  await page.locator('#inv_kind').click()
  await page.getByRole('option', { name: 'de sortie' }).click()
  await expect(page.getByTestId('inventory-mode')).toContainText('Déposer le PDF signé')
  await expect(page.getByTestId('create-capture')).toHaveCount(0)

  await mock(page)
  const r = await page.request.post('/api/v1/leases/l1/inventories', { data: { kind: 'exit', mode: 'amicable' }, headers: { 'X-CSRF-Token': 'csrf-test-token' } })
  const inv = (await r.json()) as { id: string }
  await page.request.post('/__mock/state', { data: { role: 'co_owner' } })
  await page.goto(`/inventories/${inv.id}/compare`)
  await expect(page.getByTestId('flagged')).toContainText('Aucun élément dégradé')
  await page.request.post('/__mock/state', { data: { role: 'accountant' } })
  await page.goto(`/inventories/${inv.id}/compare`)
  await expect(page.getByTestId('compare-denied')).toBeVisible()
})
