import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// S15b entry inventory capture under tenure's CSP (Q-W26): created from the
// lease's inventories tab, scheduled, started, assessed item by item (each
// saved on its own with If-Match), a photo taken and shown from blob: then
// from the archive's signed link, meters and keys saved, completed once the
// blocking checks clear; a failed save stays « not saved » until retried;
// the co-owner reads; an accountant is refused.

interface Req { method: string; path: string; csrf?: string; ifMatch?: string; body?: Record<string, unknown> }
const requests = async (page: Page): Promise<Req[]> => (await page.request.get('/__mock/requests')).json()
const owner = '00000000-0000-7000-8000-000000000001'
const el = (category: string, label: string) => ({ id: `e-${label}`, position: 1, category, label, quantity: 0, version: 1 })
const state = {
  assets: [{ id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', version: 1, shares: [{ owner_id: owner, bp: 10000 }] }],
  tenants: [{ id: 't1', names: ['Léa Martin'], version: 1 }],
  leases: [{ id: 'l1', kind: 'unfurnished', state: 'draft', asset_ids: ['a1'], tenants: [{ tenant_id: 't1' }], start_on: '2026-12-01', term_months: 36, rent_cents: 80000, provision_cents: 5000, due_day: 5, version: 1 }],
  layouts: {
    a1: { asset_id: 'a1', version: 1, rooms: [
      { id: 'r1', position: 1, kind: 'living', label: 'Séjour', version: 1, elements: [el('floor', 'Sol'), el('walls', 'Murs'), el('ceiling', 'Plafond')] },
      { id: 'r2', position: 2, kind: 'kitchen', label: 'Cuisine', version: 1, elements: [el('floor', 'Carrelage'), el('appliance', 'Plaques')] },
    ] },
  },
}
async function mock(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: { ...state, ...extra } })
}
// A tiny PNG, as a camera would hand it over.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

test('an owner captures an entry inventory on site, from draft to completed', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/leases/l1/inventories')
  await page.getByTestId('add-inventory').click()
  await expect(page.getByTestId('inventory-mode')).toContainText('Le saisir dans Tenure')
  await page.getByTestId('create-capture').click()
  await expect(page).toHaveURL(/\/inventories\/[^/]+\/capture$/)
  const id = /inventories\/([^/]+)\/capture/.exec(page.url())?.[1] ?? ''
  const created = (await requests(page)).find((r) => r.path === '/leases/l1/inventories' && r.method === 'POST')
  expect(created?.body).toEqual({ kind: 'entry', mode: 'amicable' })
  await expect(page.getByTestId('capture-state')).toHaveText('Brouillon')
  await expect(page.getByTestId('capture-progress')).toHaveText('0 éléments évalués sur 5')
  await expect(page.getByTestId('section-room')).toHaveText([/Séjour\s*0\/3/, /Cuisine\s*0\/2/])

  // Schedule: the date and place are required.
  await page.getByTestId('schedule').click()
  await expect(page.getByTestId('form-error')).toBeVisible()
  await page.getByTestId('scheduled-at').fill('2026-11-30T10:00')
  await page.getByTestId('place').fill('Sur place')
  await page.getByTestId('schedule').click()
  await expect(page.getByTestId('capture-state')).toHaveText('Planifié')
  // Not on site yet: items read only.
  await expect(page.getByTestId('condition')).toHaveCount(0)
  await page.getByTestId('start').click()
  await expect(page.getByTestId('capture-state')).toHaveText('En cours')

  // Assess the living room; each change is its own PUT with If-Match.
  const items = page.getByTestId('item')
  await items.nth(0).getByTestId('condition').getByText('Bon état').click()
  await expect(page.getByTestId('section-room').nth(0)).toContainText('1/3')
  const put = (await requests(page)).filter((r) => r.method === 'PUT' && r.path.includes('/items/'))
  expect(put.at(-1)?.ifMatch).toBe('W/"1"')
  expect(put.at(-1)?.body).toMatchObject({ condition: 'good', quantity: 0, comment: '' })
  await items.nth(1).getByTestId('condition').getByText('Bon état').click()
  await items.nth(2).getByTestId('condition').getByText('Mauvais état').click()
  await expect(page.getByTestId('blocking')).toContainText('Mauvais état ou hors d’usage sans observation ni photo — Séjour · Plafond')
  await expect(page.getByTestId('complete')).toBeDisabled()

  // A photo of the ceiling: previewed from blob:, then the archived photo.
  await items.nth(2).getByTestId('camera-input').setInputFiles({ name: 'plafond.png', mimeType: 'image/png', buffer: png })
  await expect(items.nth(2).getByTestId('photo')).toHaveCount(1)
  const upload = (await requests(page)).find((r) => r.path === `/inventories/${id}/photos`)
  expect(upload?.body).toMatchObject({ item_id: expect.any(String), file: 'plafond.jpg' })
  await page.reload()
  await expect(page.getByTestId('item').nth(2).getByTestId('photo')).toHaveAttribute('src', /^http:\/\/127\.0\.0\.1:\d+\/photo\//)
  await expect.poll(() => page.getByTestId('item').nth(2).getByTestId('photo').evaluate((img: { naturalWidth: number }) => img.naturalWidth)).toBeGreaterThan(0)

  // The kitchen: the hob asks whether it works; a save that fails stays shown.
  await page.getByTestId('section-room').nth(1).click()
  await expect(page.getByTestId('room-title')).toHaveText('Cuisine')
  await expect(items.nth(0).getByTestId('works')).toHaveCount(0)
  await page.request.post('/__mock/state', { data: { failItem: 'Plaques' } })
  await items.nth(1).getByTestId('condition').getByText('Bon état').click()
  await expect(page.getByTestId('not-saved')).toBeVisible()
  await page.getByTestId('retry-saves').click()
  await expect(page.getByTestId('not-saved')).toHaveCount(0)
  await items.nth(1).getByTestId('works').getByText('Oui').click()
  await items.nth(0).getByTestId('condition').getByText('Neuf').click()
  await items.nth(0).getByTestId('comment').fill('Carrelage posé en 2026')
  await items.nth(0).getByTestId('comment').blur()
  await expect(page.getByTestId('capture-progress')).toHaveText('5 éléments évalués sur 5')
  // Another writer saved the tiles first: the owner's choice gives way (412)
  // and the card says so until the owner acts on it again.
  await page.request.post('/__mock/state', { data: { staleItem: 'Carrelage' } })
  await items.nth(0).getByTestId('condition').getByText('Bon état').click()
  await expect(items.nth(0).getByTestId('item-unsaved')).toBeVisible()

  // Meters and keys, each saved with the inventory's version.
  await page.getByTestId('section-meters').click()
  await page.getByTestId('add-meter').click()
  await page.getByTestId('reading').fill('12.3.4')
  await page.getByTestId('save-meters').click()
  await expect(page.getByTestId('meters')).toContainText('Index attendu')
  await page.getByTestId('reading').fill('4567,8')
  await page.getByTestId('save-meters').click()
  await expect(page.getByTestId('form-error')).toHaveCount(0)
  await page.getByTestId('section-keys').click()
  await page.getByTestId('add-key').click()
  await page.getByTestId('key-opens').fill('porte d’entrée')
  await page.getByTestId('save-keys').click()
  const keys = (await requests(page)).filter((r) => r.path === `/inventories/${id}/keys`)
  expect(keys.at(-1)?.body).toEqual({ keys: [{ kind: 'key', destination: 'porte d’entrée', quantity: 1, comment: '' }] })
  expect(keys.at(-1)?.ifMatch).toMatch(/^W\/"\d+"$/)

  // Every check cleared, but the dropped edit was never seen again: a retry
  // does not clear it, so completing is refused until the owner acts.
  await expect(page.getByTestId('blocking')).toHaveCount(0)
  await page.getByTestId('complete').click()
  await expect(page.getByTestId('form-error')).toContainText('1 modification(s) non enregistrée(s)')
  await expect(page.getByTestId('capture-state')).toHaveText('En cours')
  await page.getByTestId('section-room').nth(1).click()
  await items.nth(0).getByTestId('condition').getByText('Neuf').click()
  await expect(items.nth(0).getByTestId('item-unsaved')).toHaveCount(0)
  const last = (await requests(page)).filter((r) => r.method === 'PUT' && r.path.includes('/items/')).at(-1)
  expect(last?.body).toMatchObject({ condition: 'new' })
  // Complete, then reopen is offered.
  await page.getByTestId('complete').click()
  await expect(page.getByTestId('capture-state')).toHaveText('Terminé')
  await expect(page.getByTestId('reopen')).toBeVisible()
  await page.getByTestId('section-room').nth(0).click()
  await expect(page.getByTestId('condition')).toHaveCount(0)
  await expect(page.getByTestId('item-read').first()).toHaveText('Bon état')

  // The lease's tab lists it with its state.
  await page.getByTestId('crumb-lease').click()
  await expect(page.getByTestId('inventory-state')).toHaveText('Terminé')
  await expect(page.getByTestId('open-capture')).toBeVisible()
  expect(violations).toEqual([])
})

test('an asset without a layout is refused, and the exit is uploaded only', async ({ page }) => {
  await mock(page, { layouts: {} })
  await page.goto('/leases/l1/inventories')
  await page.getByTestId('add-inventory').click()
  await page.getByTestId('create-capture').click()
  await expect(page.getByTestId('inventory-error')).toContainText('plan de pièces')
  await page.locator('#inv_kind').click()
  await page.getByRole('option', { name: 'de sortie' }).click()
  await expect(page.getByTestId('inventory-mode')).toContainText('Déposer le PDF signé')
  await expect(page.getByTestId('create-capture')).toHaveCount(0)
  await expect(page.getByTestId('save-inventory')).toBeVisible()
})

test('the co-owner reads the capture; an accountant is refused', async ({ page }) => {
  await mock(page, { role: 'co_owner' })
  // An inventory created as the owner would have.
  await page.request.post('/__mock/state', { data: { role: 'owner' } })
  const r = await page.request.post('/api/v1/leases/l1/inventories', { data: { kind: 'entry', mode: 'amicable' }, headers: { 'X-CSRF-Token': 'csrf-test-token' } })
  const inv = (await r.json()) as { id: string }
  await page.request.post('/__mock/state', { data: { role: 'co_owner' } })
  await page.goto(`/inventories/${inv.id}/capture`)
  await expect(page.getByTestId('capture-state')).toHaveText('Brouillon')
  await expect(page.getByTestId('next-step')).toHaveCount(0)
  await expect(page.getByTestId('condition')).toHaveCount(0)
  await expect(page.getByTestId('item-read').first()).toHaveText('Non évalué')
  await page.request.post('/__mock/state', { data: { role: 'accountant' } })
  await page.goto(`/inventories/${inv.id}/capture`)
  await expect(page.getByTestId('capture-denied')).toBeVisible()
})
