import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// The deposit restitution under tenure's CSP (Q-W30): a wear grid recorded
// and annexed, a deduction on the exit's worse item backed by a quote (the
// share from the grid), a key deduction removed, the first RD statement with
// the holdback of a collective building, then its release net of the
// regularisation; the co-owner reads, an accountant is refused.

interface Req { method: string; path: string; body?: Record<string, unknown> }
const requests = async (page: Page): Promise<Req[]> => (await page.request.get('/__mock/requests')).json()
const owner = '00000000-0000-7000-8000-000000000001'
const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
const fr = (d: string) => d.split('-').reverse().join('/')
const plusMonths = (d: string, n: number) => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number]
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  t.setUTCDate(Math.min(day, new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()))
  return t.toISOString().slice(0, 10)
}
const pdf = { name: 'devis.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n%%EOF\n') }
const item = (id: string, category: string, label: string, condition: string, extra = {}) => ({ id, category, label, condition, quantity: 0, comment: '', to_check: false, photos: [], version: 2, ...extra })

async function mock(page: Page): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: {
    assets: [{ id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', version: 1, collective_building: true, shares: [{ owner_id: owner, bp: 10000 }] }],
    tenants: [{ id: 't1', names: ['Léa Martin'], version: 1 }],
    leases: [{ id: 'l1', kind: 'unfurnished', state: 'ended', asset_ids: ['a1'], tenants: [{ tenant_id: 't1' }], start_on: '2025-01-01', end_on: iso, term_months: 36, rent_cents: 80000, provision_cents: 5000, deposit_cents: 140000, due_day: 5, version: 4 }],
    inventories: [{ id: 'e1', lease_id: 'l1', kind: 'entry', mode: 'amicable', state: 'issued', done_on: '2025-01-01', document_id: 'd1' },
      { id: 'x1', lease_id: 'l1', kind: 'exit', mode: 'amicable', state: 'issued', done_on: iso, document_id: 'd2' }],
    captures: {
      e1: { id: 'e1', lease_id: 'l1', kind: 'entry', mode: 'amicable', state: 'issued', done_on: '2025-01-01', version: 9,
        rooms: [{ room_id: 'r1', label: 'Séjour', kind: 'living', items: [item('i1', 'floor', 'Parquet', 'good'), item('i2', 'walls', 'Murs', 'good')] }],
        meters: [], keys: [{ kind: 'key', destination: 'porte d’entrée', quantity: 2, comment: '' }], signatures: [], requests: [], parties: [] },
      x1: { id: 'x1', lease_id: 'l1', kind: 'exit', mode: 'amicable', state: 'issued', done_on: iso, keys_returned_on: iso, tenant_new_address: '8 avenue Neuve', version: 9, entry_inventory_id: 'e1',
        rooms: [{ room_id: 'r1', label: 'Séjour', kind: 'living', items: [item('x-i1', 'floor', 'Parquet', 'poor', { entry_item_id: 'i1' }), item('x-i2', 'walls', 'Murs', 'good', { entry_item_id: 'i2' })] }],
        meters: [], keys: [{ kind: 'key', destination: 'porte d’entrée', quantity: 1, comment: '' }], signatures: [], requests: [], parties: [] },
    },
  } })
}

test('a grid, a deduction from the quote, the RD statement with its holdback, then the release', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/leases/l1/deposit')
  await expect(page.getByTestId('deposit-held')).toHaveText(/1\s400,00\s€/)
  await expect(page.getByTestId('collective')).toBeVisible()
  await expect(page.getByTestId('flagged-item')).toHaveCount(1)
  await expect(page.getByTestId('flagged-item')).toContainText('Parquet — Bon état → Mauvais état')
  await expect(page.getByTestId('missing-key')).toHaveCount(1)

  // The grid: 10 % a year, 20 % residual value on floors.
  await page.getByTestId('grid-new').click()
  await page.getByTestId('grid-name-input').fill('Accord collectif')
  await page.getByTestId('grid-source').fill('Accord collectif de location')
  await page.locator('#gl_rate_0').fill('10')
  await page.locator('#gl_rate_0').blur()
  await page.locator('#gl_floor_0').fill('20')
  await page.locator('#gl_floor_0').blur()
  await page.getByTestId('grid-save').click()
  await expect(page.getByTestId('grid-name')).toContainText('Accord collectif')
  const grid = (await requests(page)).find((r) => r.path === '/vetuste-grids' && r.method === 'POST')
  expect(grid?.body).toMatchObject({ name: 'Accord collectif', lines: [{ category: 'floor', lifetime_years: 10, franchise_years: 0, yearly_rate_bp: 1000, floor_bp: 2000 }] })

  // The parquet, one year old at exit: 90 % of 480 €.
  await page.getByTestId('retain-item').click()
  await page.getByTestId('ded-save').click()
  await expect(page.getByTestId('deduction-form')).toContainText('Le coût est obligatoire.')
  await page.locator('#ded_cost').fill('480')
  await page.locator('#ded_cost').blur()
  await page.getByTestId('file-ded_doc').setInputFiles(pdf)
  await page.getByTestId('ded-save').click()
  await expect(page.getByTestId('deduction')).toHaveCount(1)
  await expect(page.getByTestId('deduction-share')).toHaveText('90 %')
  await expect(page.getByTestId('deduction-amount')).toHaveText(/432,00\s€/)
  await expect(page.getByTestId('retained')).toBeVisible()
  const ded = (await requests(page)).find((r) => r.path === '/leases/l1/deposit-deductions' && r.method === 'POST')
  expect(ded?.body).toMatchObject({ exit_item_id: 'x-i1', description: 'Séjour · Parquet', cost_cents: 48000, basis: 'quote' })

  // A key deduction, then removed.
  await page.getByTestId('retain-key').click()
  await page.locator('#ded_cost').fill('25')
  await page.locator('#ded_cost').blur()
  await page.getByTestId('file-ded_doc').setInputFiles(pdf)
  await page.getByTestId('ded-save').click()
  await expect(page.getByTestId('deduction')).toHaveCount(2)
  await page.getByTestId('deduction').nth(1).getByTestId('deduction-remove').click()
  await expect(page.getByTestId('deduction')).toHaveCount(1)

  // The first statement: 1 400 − 432 − 280 of holdback, two months after the keys.
  const pv = page.getByTestId('statement-preview')
  await expect(pv.getByTestId('pv-holdback')).toHaveText(/280,00\s€/)
  await expect(pv.getByTestId('pv-total')).toHaveText(/688,00\s€/)
  await expect(pv.getByTestId('pv-deadline')).toContainText(fr(plusMonths(iso, 2)))
  await pv.getByTestId('issue').click()
  await page.getByTestId('confirm-dialog').getByTestId('confirm').click()
  await expect(page.getByTestId('statement')).toHaveCount(1)
  await expect(page.getByTestId('statement')).toContainText(/688,00\s€/)
  await expect(page.getByTestId('retain-item')).toHaveCount(0)
  await expect(page.getByTestId('deduction-remove')).toHaveCount(0)

  // The release, once the accounts are approved, net of 120 € of charges.
  await expect(pv).toContainText('Solde de la provision retenue')
  await pv.getByTestId('issue').click()
  await page.getByTestId('confirm-dialog').getByTestId('confirm').click()
  await expect(page.getByTestId('deposit-error')).toBeVisible()
  await page.locator('#st_approved').fill(fr(iso))
  await page.locator('#st_approved').press('Tab')
  await page.locator('#st_reg').fill('120')
  await page.locator('#st_reg').blur()
  await page.getByTestId('compute').click()
  await expect(pv.getByTestId('pv-total')).toHaveText(/160,00\s€/)
  await page.getByTestId('file-st_reg_doc').setInputFiles(pdf)
  await pv.getByTestId('issue').click()
  await page.getByTestId('confirm-dialog').getByTestId('confirm').click()
  await expect(page.getByTestId('statement')).toHaveCount(2)
  await expect(page.getByTestId('deposit-done')).toBeVisible()
  const rel = (await requests(page)).filter((r) => r.path === '/leases/l1/deposit-settlement' && r.method === 'POST').at(-1)
  expect(rel?.body).toMatchObject({ dry_run: false, release: true, accounts_approved_on: iso, regularisation_cents: 12000 })
  expect(typeof rel?.body?.regularisation_document_id).toBe('string')
  expect(violations).toEqual([])
})

test('the co-owner reads the deposit without acting; an accountant is refused', async ({ page }) => {
  await mock(page)
  await page.request.post('/__mock/state', { data: { role: 'co_owner' } })
  await page.goto('/leases/l1/deposit')
  await expect(page.getByTestId('flagged-item')).toHaveCount(1)
  await expect(page.getByTestId('retain-item')).toHaveCount(0)
  await expect(page.getByTestId('grid-new')).toHaveCount(0)
  await expect(page.getByTestId('issue')).toHaveCount(0)
  await page.request.post('/__mock/state', { data: { role: 'accountant' } })
  await page.goto('/leases/l1/deposit')
  await expect(page.getByTestId('deposit-denied')).toBeVisible()
})
