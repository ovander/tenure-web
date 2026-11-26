import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// S15a Asset layout under tenure's CSP (Q-W25): seeded from the template,
// then edited (reorder, rename, remove, add, installation date) and saved with
// If-Match; a concurrent save reloads; the co-owner reads; an accountant is
// refused.

interface Req { method: string; path: string; csrf?: string; ifMatch?: string; body?: { rooms?: { id?: string; label: string; elements: { id?: string; label: string; installed_on?: string }[] }[]; bedrooms?: number; furnished?: boolean; features?: Record<string, boolean> } }
const requests = async (page: Page): Promise<Req[]> => (await page.request.get('/__mock/requests')).json()
const owner = '00000000-0000-7000-8000-000000000001'
const assets = [{ id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', furnished: true, version: 1, shares: [{ owner_id: owner, bp: 10000 }] }]

async function mock(page: Page, state: Record<string, unknown> = {}): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: { assets, ...state } })
}

test('an owner seeds the layout, then edits and saves it with If-Match', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/assets/a1/overview')
  await page.getByTestId('open-layout').click()
  await expect(page).toHaveURL(/\/assets\/a1\/layout$/)
  await expect(page.getByTestId('seed')).toBeVisible()
  // The asset is furnished: proposed so.
  await expect(page.locator('#seed_furnished')).toBeChecked()
  await page.locator('#seed_bedrooms').fill('2')
  await page.locator('#seed_cellar').check()
  await page.getByTestId('seed-layout').click()
  const rooms = page.getByTestId('room')
  await expect(rooms).toHaveCount(8)
  await expect(page.getByTestId('layout-summary')).toHaveText('8 pièce(s), 25 élément(s)')
  const seed = (await requests(page)).find((r) => r.path === '/assets/a1/layout/seed')
  expect(seed?.body).toEqual({ bedrooms: 2, furnished: true, features: { cellar: true } })
  expect(seed?.csrf).toBe('csrf-test-token')

  // Rename the living room, move the kitchen up, remove the second bedroom,
  // date the kitchen floor, add a balcony with its floor.
  await rooms.nth(1).getByTestId('room-label').fill('Grand séjour')
  await rooms.nth(2).getByTestId('room-up').click()
  await expect(rooms.nth(1).getByTestId('room-label')).toHaveValue('Cuisine')
  await rooms.nth(4).getByTestId('room-remove').click()
  await expect(rooms).toHaveCount(7)
  await page.locator('#el_1_0_installed').fill('01/10/2019')
  await page.locator('#el_1_0_installed').press('Tab')
  await page.getByTestId('add-room').click()
  await rooms.nth(7).getByTestId('room-label').fill('Balcon')
  await rooms.nth(7).getByTestId('add-element').click()
  await rooms.nth(7).getByTestId('element-label').fill('Sol du balcon')
  await expect(page.getByTestId('unsaved')).toBeVisible()
  await page.getByTestId('save-layout').click()
  await expect(page.getByTestId('unsaved')).toHaveCount(0)
  const put = (await requests(page)).filter((r) => r.method === 'PUT' && r.path === '/assets/a1/layout').at(-1)
  expect(put?.ifMatch).toBe('W/"1"')
  const labels = put?.body?.rooms?.map((r) => r.label)
  expect(labels).toEqual(['Entrée', 'Cuisine', 'Grand séjour', 'Chambre 1', 'Salle d’eau', 'WC', 'Cellier ou cave', 'Balcon'])
  expect(put?.body?.rooms?.slice(0, 7).every((r) => r.id)).toBe(true)
  expect(put?.body?.rooms?.[7]?.id).toBeUndefined()
  expect(put?.body?.rooms?.[1]?.elements[0]?.installed_on).toBe('2019-10-01')
  expect(violations).toEqual([])
})

test('an empty room name comes back on its field; a concurrent save reloads', async ({ page }) => {
  await mock(page)
  await page.goto('/assets/a1/layout')
  await page.getByTestId('seed-layout').click()
  const rooms = page.getByTestId('room')
  await rooms.nth(0).getByTestId('room-label').fill('')
  await page.getByTestId('save-layout').click()
  await expect(page.getByText('Le nom de la pièce est obligatoire.')).toBeVisible()
  // Someone saved first: the next save is stale. The screen reads the stored
  // version and says so, keeping what the owner typed; saving again replaces it.
  const layouts = await (await page.request.get('/api/v1/assets/a1/layout')).json()
  await page.request.post('/__mock/state', { data: { layouts: { a1: { ...layouts, version: 9 } } } })
  await rooms.nth(0).getByTestId('room-label').fill('Hall')
  await rooms.nth(1).getByTestId('add-element').click()
  await rooms.nth(1).getByTestId('element-label').last().fill('Cheminée')
  await page.getByTestId('save-layout').click()
  await expect(page.getByTestId('form-error')).toContainText('changé entre-temps')
  await expect(page.getByTestId('form-error')).toContainText('Vos modifications sont conservées')
  await expect(rooms.nth(0).getByTestId('room-label')).toHaveValue('Hall')
  await expect(rooms.nth(1).getByTestId('element-label').last()).toHaveValue('Cheminée')
  await expect(page.getByTestId('unsaved')).toBeVisible()
  await page.getByTestId('save-layout').click()
  await expect(page.getByTestId('unsaved')).toHaveCount(0)
  const put = (await requests(page)).filter((r) => r.method === 'PUT' && r.path === '/assets/a1/layout').at(-1)
  expect(put?.ifMatch).toBe('W/"9"')
  expect(put?.body?.rooms?.[0]?.label).toBe('Hall')
  expect(put?.body?.rooms?.[1]?.elements.at(-1)?.label).toBe('Cheminée')
})

test('after a 412 the owner may discard their edits for the stored layout', async ({ page }) => {
  await mock(page)
  await page.goto('/assets/a1/layout')
  await page.getByTestId('seed-layout').click()
  const rooms = page.getByTestId('room')
  const layouts = await (await page.request.get('/api/v1/assets/a1/layout')).json()
  layouts.rooms[0].label = 'Hall d’entrée'
  await page.request.post('/__mock/state', { data: { layouts: { a1: { ...layouts, version: 9 } } } })
  await rooms.nth(0).getByTestId('room-label').fill('Hall')
  await page.getByTestId('save-layout').click()
  await expect(page.getByTestId('form-error')).toContainText('Vos modifications sont conservées')
  await page.getByTestId('discard-layout').click()
  await expect(rooms.nth(0).getByTestId('room-label')).toHaveValue('Hall d’entrée')
  await expect(page.getByTestId('unsaved')).toHaveCount(0)
  await expect(page.getByTestId('form-error')).toHaveCount(0)
})

test('the co-owner reads the layout; an accountant is refused and sees no link', async ({ page }) => {
  await mock(page, { role: 'co_owner', layouts: { a1: { asset_id: 'a1', version: 1, rooms: [{ id: 'r1', position: 1, kind: 'box', label: 'Box', version: 1, elements: [{ id: 'e1', position: 1, category: 'floor', label: 'Sol', quantity: 0, version: 1 }] }] } } })
  await page.goto('/assets/a1/layout')
  await expect(page.getByTestId('room-label')).toContainText('Box')
  await expect(page.getByTestId('element-label')).toHaveText('Sol')
  await expect(page.getByTestId('save-layout')).toHaveCount(0)
  await expect(page.getByTestId('add-room')).toHaveCount(0)

  await mock(page, { role: 'accountant' })
  await page.goto('/assets/a1/overview')
  await expect(page.getByTestId('asset-title')).toBeVisible()
  await expect(page.getByTestId('open-layout')).toHaveCount(0)
  await page.goto('/assets/a1/layout')
  await expect(page.getByTestId('layout-denied')).toBeVisible()
})
