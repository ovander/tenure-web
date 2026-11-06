import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// The completions of an issued entry under tenure's CSP (Q-W29): the windows
// on the lease tab and the screen, a tenant's request recorded item by item,
// a lease warning on the home, the decision per line issuing the EC document;
// the co-owner reads, an accountant is refused.

interface Req { method: string; path: string; body?: Record<string, unknown> }
const requests = async (page: Page): Promise<Req[]> => (await page.request.get('/__mock/requests')).json()
const owner = '00000000-0000-7000-8000-000000000001'
const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
const plus10 = new Date(Date.parse(`${iso}T00:00:00Z`) + 10 * 86400000).toISOString().slice(0, 10).split('-').reverse().join('/')
const item = (id: string, category: string, label: string) => ({ id, category, label, condition: 'good', quantity: 0, comment: '', to_check: false, photos: [], version: 2 })

async function mock(page: Page): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: {
    assets: [{ id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', version: 1, shares: [{ owner_id: owner, bp: 10000 }] }],
    tenants: [{ id: 't1', names: ['Léa Martin'], version: 1 }],
    leases: [{ id: 'l1', kind: 'unfurnished', state: 'active', asset_ids: ['a1'], tenants: [{ tenant_id: 't1' }], start_on: iso, term_months: 36, rent_cents: 80000, provision_cents: 5000, due_day: 5, version: 3 }],
    inventories: [{ id: 'e1', lease_id: 'l1', kind: 'entry', mode: 'amicable', state: 'issued', done_on: iso, document_id: 'd1' }],
    captures: { e1: { id: 'e1', lease_id: 'l1', kind: 'entry', mode: 'amicable', state: 'issued', done_on: iso, version: 9, place: '', observations: '',
      rooms: [{ room_id: 'r1', label: 'Séjour', kind: 'living', items: [item('i1', 'floor', 'Parquet'), item('i2', 'heating', 'Radiateur')] }],
      meters: [], keys: [], signatures: [], requests: [], parties: [] } },
  } })
}

test('a request is recorded, warned on the home, then decided line by line into EC', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/leases/l1/inventories')
  await expect(page.getByTestId('tab-ten-day')).toHaveText(`Complément possible jusqu’au ${plus10} inclus`)
  await page.getByTestId('open-completions').click()
  await expect(page).toHaveURL(/\/inventories\/e1\/completions$/)
  await expect(page.getByTestId('window-ten-day')).toContainText('Ouvert')
  await expect(page.getByTestId('no-requests')).toBeVisible()

  // The request, as received.
  await page.getByTestId('start-request').click()
  await page.getByTestId('save-request').click()
  await expect(page.locator('[data-test="request-line"]').first()).toContainText('Choisissez un élément.')
  const lines = page.getByTestId('request-line')
  await lines.nth(0).getByTestId('line-item').click()
  await page.getByRole('option', { name: 'Séjour · Parquet' }).click()
  await lines.nth(0).getByTestId('line-condition').getByText('État d’usage').click()
  await lines.nth(0).getByTestId('line-comment').fill('Rayure près de la fenêtre')
  await page.getByTestId('add-line').click()
  await lines.nth(1).getByTestId('line-item').click()
  await page.getByRole('option', { name: 'Séjour · Radiateur' }).click()
  await lines.nth(1).getByTestId('line-works').getByText('Non', { exact: true }).click()
  await page.getByTestId('save-request').click()
  await expect(page.getByTestId('completion')).toHaveCount(1)
  expect((await requests(page)).find((r) => r.path === '/inventories/e1/completions' && r.method === 'POST')?.body).toEqual({
    reason: 'ten_day', requested_on: iso,
    lines: [{ entry_item_id: 'i1', condition: 'fair', comment: 'Rayure près de la fenêtre' }, { entry_item_id: 'i2', works: 'ko' }] })
  const c = page.getByTestId('completion')
  await expect(c.getByTestId('decision')).toHaveText('À trancher')
  await expect(c.getByTestId('completion-line').nth(0)).toContainText('Bon état')
  await expect(c.getByTestId('completion-line').nth(0)).toContainText('État d’usage')

  // The home lists the pending request.
  await page.goto('/')
  await expect(page.getByText('Une demande de complément de l’état des lieux d’entrée attend votre décision.')).toBeVisible()
  await page.goto('/leases/l1/inventories')
  await expect(page.getByTestId('tab-pending')).toHaveText('1 demande(s) à trancher')
  await page.getByTestId('open-completions').click()

  // The decision, every line.
  await c.getByTestId('save-decision').click()
  await expect(c).toContainText('Acceptez ou refusez chaque ligne.')
  await c.getByTestId('completion-line').nth(0).getByTestId('line-decide').getByText('Accepter').click()
  await c.getByTestId('completion-line').nth(1).getByTestId('line-decide').getByText('Refuser').click()
  await c.getByTestId('save-decision').click()
  await expect(c.getByTestId('decision')).toHaveText('Acceptée en partie')
  await expect(c.getByTestId('line-decision')).toHaveText(['Acceptée', 'Refusée'])
  await expect(c.getByTestId('download-ec')).toBeVisible()
  await expect(c.getByTestId('decide')).toHaveCount(0)
  const put = (await requests(page)).find((r) => r.method === 'PUT' && r.path.startsWith('/completions/'))
  expect(put?.body).toEqual({ lines: [{ entry_item_id: 'i1', accepted: true }, { entry_item_id: 'i2', accepted: false }] })
  expect(violations).toEqual([])
})

test('the co-owner reads the requests without acting; an accountant is refused', async ({ page }) => {
  await mock(page)
  await page.request.post('/api/v1/inventories/e1/completions', { headers: { 'X-CSRF-Token': 'csrf-test-token' },
    data: { reason: 'ten_day', requested_on: iso, lines: [{ entry_item_id: 'i1', condition: 'fair' }] } })
  await page.request.post('/__mock/state', { data: { role: 'co_owner' } })
  await page.goto('/inventories/e1/completions')
  await expect(page.getByTestId('completion')).toHaveCount(1)
  await expect(page.getByTestId('start-request')).toHaveCount(0)
  await expect(page.getByTestId('line-decide')).toHaveCount(0)
  await expect(page.getByTestId('save-decision')).toHaveCount(0)
  await page.request.post('/__mock/state', { data: { role: 'accountant' } })
  await page.goto('/inventories/e1/completions')
  await expect(page.getByTestId('completions-denied')).toBeVisible()
})
