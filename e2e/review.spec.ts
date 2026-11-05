import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// S15c Review and sign under tenure's CSP (Q-W27): a completed inventory is
// signed by the owner and each co-tenant, by hand (the copy to sign as a
// PDF, then the signed copy uploaded for the parties who signed it) or
// electronically (one link per party, opened in turn, then « actualiser »);
// the last signature issues the document. The co-owner reads without links;
// an accountant is refused.

interface Req { method: string; path: string; body?: Record<string, unknown> }
const requests = async (page: Page): Promise<Req[]> => (await page.request.get('/__mock/requests')).json()
const owner = '00000000-0000-7000-8000-000000000001'
const csrf = { 'X-CSRF-Token': 'csrf-test-token' }
const el = (category: string, label: string) => ({ id: `e-${label}`, position: 1, category, label, quantity: 0, version: 1 })

// completed creates a captured entry and takes it to completed through the mock API.
async function completed(page: Page, extra: Record<string, unknown> = {}): Promise<string> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: {
    assets: [{ id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', version: 1, shares: [{ owner_id: owner, bp: 10000 }] }],
    tenants: [{ id: 't1', names: ['Léa Martin', 'Paul Durand'], email: 'coloc@example.test', version: 1 }],
    leases: [{ id: 'l1', kind: 'unfurnished', state: 'draft', asset_ids: ['a1'], tenants: [{ tenant_id: 't1' }], start_on: '2026-12-01', term_months: 36, rent_cents: 80000, provision_cents: 5000, due_day: 5, version: 1 }],
    layouts: { a1: { asset_id: 'a1', version: 1, rooms: [{ id: 'r1', position: 1, kind: 'living', label: 'Séjour', version: 1, elements: [el('floor', 'Sol')] }] } },
    ...extra,
  } })
  const inv = (await (await page.request.post('/api/v1/leases/l1/inventories', { data: { kind: 'entry', mode: 'amicable' }, headers: csrf })).json()) as { id: string }
  const post = (path: string, data: unknown, ifMatch?: string) => page.request.fetch(`/api/v1/inventories/${inv.id}${path}`, { method: path.includes('items') || path === '/keys' ? 'PUT' : 'POST', data, headers: { ...csrf, ...(ifMatch ? { 'If-Match': ifMatch } : {}) } })
  await post('/transitions', { action: 'schedule', scheduled_at: '2026-11-30T09:00:00Z', place: 'Sur place' })
  await post('/transitions', { action: 'start' })
  const c = (await (await page.request.get(`/api/v1/inventories/${inv.id}`)).json()) as { version: number; rooms: { items: { id: string; version: number }[] }[] }
  const item = c.rooms[0]?.items[0]
  await post(`/items/${item?.id}`, { condition: 'good', quantity: 0, comment: '' }, `W/"${item?.version}"`)
  await post('/keys', { keys: [{ kind: 'key', destination: 'porte', quantity: 2, comment: '' }] }, `W/"${c.version}"`)
  const r = await post('/transitions', { action: 'complete' })
  expect(r.status()).toBe(200)
  return inv.id
}

test('the parties sign by hand, then the document is issued', async ({ page }) => {
  const id = await completed(page)
  const violations = await watchCSP(page)
  await page.goto(`/inventories/${id}/capture`)
  await page.getByTestId('to-review').click()
  await expect(page).toHaveURL(new RegExp(`/inventories/${id}/review$`))
  await expect(page.getByTestId('party')).toHaveText([/Bailleur · Bailleur Test\s*À signer/, /Locataire · Léa Martin\s*À signer/, /Locataire · Paul Durand\s*À signer/])

  // The copy to sign, as a PDF kept in the browser.
  await page.getByTestId('prepare-pdf').click()
  await expect(page.getByTestId('pdf-link')).toHaveAttribute('href', /^blob:/)

  // Nothing ticked, no file: both are asked for.
  await page.getByTestId('wet-record').click()
  await expect(page.getByTestId('form-error')).toBeVisible()
  await expect(page.getByTestId('wet')).toContainText('La copie signée est obligatoire.')

  // The owner and Léa sign a first copy, Léa with a reservation.
  const parties = page.getByTestId('sign-party')
  await parties.nth(0).getByTestId('pick').click()
  await parties.nth(1).getByTestId('pick').click()
  await parties.nth(1).getByTestId('reservations').fill('Rayure sur le parquet')
  await page.getByTestId('file-signed').setInputFiles({ name: 'edl-signe.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n%%EOF\n') })
  await page.getByTestId('wet-record').click()
  await expect(page.getByTestId('party').nth(1)).toContainText('Signé')
  await expect(page.getByTestId('sign-party')).toHaveCount(1)
  const signed = (await requests(page)).filter((r) => r.path === `/inventories/${id}/signatures` && r.method === 'POST')
  expect(signed.at(-1)?.body).toMatchObject({ method: 'wet_scan', document_id: expect.any(String),
    signers: [{ party: 'owner', signer_name: 'Bailleur Test' }, { party: 'tenant', signer_name: 'Léa Martin', reservations: 'Rayure sur le parquet' }] })
  const upload = (await requests(page)).find((r) => r.path === '/documents' && r.method === 'POST')
  expect(upload?.body).toMatchObject({ class: 'inventory', lease_id: 'l1' })

  // Paul signs a second copy: the document is issued.
  await page.getByTestId('sign-party').getByTestId('pick').click()
  await page.getByTestId('file-signed').setInputFiles({ name: 'edl-paul.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n%%EOF\n') })
  await page.getByTestId('wet-record').click()
  await expect(page.getByTestId('review-state')).toHaveText('Émis')
  await expect(page.getByTestId('issued-doc')).toBeVisible()
  await expect(page.getByTestId('signatures')).toContainText('Léa Martin — signature manuscrite')
  expect(violations).toEqual([])
})

test('each party signs electronically in turn on the tablet', async ({ page }) => {
  const id = await completed(page)
  await page.goto(`/inventories/${id}/review`)
  await expect(page.getByTestId('esign')).toBeVisible()
  // The provider needs an e-mail per party.
  await page.getByTestId('esign-start').click()
  await expect(page.getByTestId('sign-form')).toContainText('Une adresse e-mail est nécessaire')
  const parties = page.getByTestId('sign-party')
  await parties.nth(0).getByTestId('email').fill('bailleur@example.test')
  await parties.nth(1).getByTestId('email').fill('lea@example.test')
  await parties.nth(2).getByTestId('email').fill('paul@example.test')
  await page.getByTestId('esign-start').click()
  const links = page.getByTestId('esign-link')
  await expect(links).toHaveCount(3)
  await expect(links.first()).toHaveAttribute('href', 'https://sign.example.test/s1')
  await expect(links.first()).toHaveAttribute('target', '_blank')

  // The owner signs, then refresh: their link is gone.
  await page.request.post('/__mock/state', { data: { esignSigned: ['owner:Bailleur Test'] } })
  await page.getByTestId('esign-refresh').click()
  await expect(page.getByTestId('esign-signer').nth(0)).toContainText('Signé')
  await expect(links).toHaveCount(2)
  // The tenants sign: the document is issued.
  await page.request.post('/__mock/state', { data: { esignSigned: ['owner:Bailleur Test', 'tenant:Léa Martin', 'tenant:Paul Durand'] } })
  await page.getByTestId('esign-refresh').click()
  await expect(page.getByTestId('review-state')).toHaveText('Émis')
  await expect(page.getByTestId('signatures')).toContainText('Paul Durand — signature électronique')
})

test('a request is cancelled, then the parties sign by hand; without a provider only the hand signature is offered', async ({ page }) => {
  const id = await completed(page)
  await page.goto(`/inventories/${id}/review`)
  for (const [i, e] of ['a@example.test', 'b@example.test', 'c@example.test'].entries()) await page.getByTestId('sign-party').nth(i).getByTestId('email').fill(e)
  await page.getByTestId('esign-start').click()
  await expect(page.getByTestId('esign-pending')).toBeVisible()
  await page.getByTestId('esign-cancel').click()
  await expect(page.getByTestId('esign-ended')).toContainText('annulée')
  await expect(page.getByTestId('wet')).toBeVisible()

  const other = await completed(page, { esign: false })
  await page.goto(`/inventories/${other}/review`)
  await expect(page.getByTestId('wet')).toBeVisible()
  await expect(page.getByTestId('esign')).toHaveCount(0)
  await expect(page.getByTestId('email')).toHaveCount(0)
})

test('the co-owner reads without links or actions; an accountant is refused', async ({ page }) => {
  const id = await completed(page)
  await page.request.post(`/api/v1/inventories/${id}/signatures`, { headers: csrf, data: { method: 'esign', signers: [
    { party: 'owner', signer_name: 'Bailleur Test', email: 'a@example.test' }, { party: 'tenant', signer_name: 'Léa Martin', email: 'b@example.test' },
    { party: 'tenant', signer_name: 'Paul Durand', email: 'c@example.test' }] } })
  await page.request.post('/__mock/state', { data: { role: 'co_owner' } })
  await page.goto(`/inventories/${id}/review`)
  await expect(page.getByTestId('party')).toHaveCount(3)
  await expect(page.getByTestId('esign-pending')).toHaveCount(0)
  await expect(page.getByTestId('esign-link')).toHaveCount(0)
  await expect(page.getByTestId('wet')).toHaveCount(0)
  await page.request.post('/__mock/state', { data: { role: 'accountant' } })
  await page.goto(`/inventories/${id}/review`)
  await expect(page.getByTestId('review-denied')).toBeVisible()
})
