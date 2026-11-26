import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// The notice on S05 under tenure's CSP (RENT-SPEC-010, tenure-api Q-118,
// Q-W33): the tenant's, its end computed before saving and its letter
// uploaded; the owner's, a ground checked, the term and the last day of
// receipt previewed, the CG letter generated, then its reception recorded;
// a box keeps the end date typed by hand; a mobility lease offers no owner
// notice; the overview shows the recorded notice.

interface Req { method: string; path: string; body?: Record<string, unknown> }
const requests = async (page: Page): Promise<Req[]> => (await page.request.get('/__mock/requests')).json()
const owner = '00000000-0000-7000-8000-000000000001'
const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
const fr = (d: string) => d.split('-').reverse().join('/')
const months = (d: string, n: number) => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number]
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  t.setUTCDate(Math.min(day, new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()))
  return t.toISOString().slice(0, 10)
}
const days = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
// A lease whose term ends about eight months from today.
const start = `${months(iso, -28).slice(0, 7)}-01`
const termEnd = days(months(start, 36), -1)

async function mock(page: Page, lease: Record<string, unknown> = {}): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: {
    assets: [{ id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', version: 1, shares: [{ owner_id: owner, bp: 10000 }] }],
    tenants: [{ id: 't1', names: ['Léa Martin'], version: 1 }],
    leases: [{ id: 'l1', kind: 'unfurnished', state: 'active', asset_ids: ['a1'], tenants: [{ tenant_id: 't1' }], start_on: start, term_months: 36,
      rent_cents: 80000, provision_cents: 5000, due_day: 5, version: 3, ...lease }],
  } })
}

test('the tenant gives notice: the reduced end computed, the letter uploaded, the notice recorded', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/leases/l1')
  await page.getByTestId('action-notice').click()
  await expect(page.getByTestId('notice-dialog')).toBeVisible()
  await page.locator('#notice_reason').click()
  await page.getByRole('option', { name: 'Perte d’emploi', exact: true }).click()
  await page.getByTestId('notice-compute').click()
  const end = (() => { const same = months(iso, 1); return same.slice(8) !== iso.slice(8) ? same : days(same, -1) })()
  await expect(page.getByTestId('notice-terms')).toContainText(`le ${fr(end)} (préavis de 1 mois)`)
  await expect(page.getByTestId('notice-terms')).toContainText('Préavis réduit.')
  await page.getByTestId('file-notice_letter').setInputFiles({ name: 'conge.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n%%EOF\n') })
  await page.locator('#notice_tracking').fill('1A 234 567 8901 2')
  await page.getByTestId('save-notice').click()
  await expect(page.getByTestId('notice-dialog')).toBeHidden()
  await expect(page.getByTestId('lease-state')).toHaveText('congé donné')
  await expect(page.getByTestId('notice-card')).toBeVisible()
  await expect(page.getByTestId('notice-given-by')).toHaveText('le locataire')
  await expect(page.getByTestId('notice-ground')).toHaveText('Perte d’emploi')
  await expect(page.getByTestId('notice-end')).toHaveText(fr(end))

  const reqs = await requests(page)
  const upload = reqs.find((r) => r.path === '/documents' && r.method === 'POST')
  expect(upload?.body).toMatchObject({ class: 'notice', lease_id: 'l1' })
  const posted = reqs.filter((r) => r.path === '/leases/l1/notice' && r.method === 'POST')
  expect(posted.map((r) => r.body?.dry_run)).toEqual([true, false])
  expect(posted.at(-1)?.body).toMatchObject({ given_by: 'tenant', reason: 'job_loss', received_on: iso, delivery: 'registered_letter',
    tracking_ref: '1A 234 567 8901 2', document_id: expect.any(String), dry_run: false })
  expect(violations).toEqual([])
})

test('the owner gives notice for repossession: ground checked, term previewed, CG letter, then reception', async ({ page }) => {
  await mock(page)
  await page.goto('/leases/l1')
  await page.getByTestId('action-notice').click()
  await page.locator('#notice_by').click()
  await page.getByRole('option', { name: 'le bailleur' }).click()
  await expect(page.getByTestId('notice-ground')).toBeVisible()
  await expect(page.getByTestId('save-notice')).toHaveCount(0)

  // Nothing filled: each requirement comes back on its field.
  await page.getByTestId('letter-preview').click()
  await expect(page.getByTestId('notice-ground')).toContainText('Le nom du bénéficiaire est obligatoire.')
  await expect(page.getByTestId('notice-ground')).toContainText('Répondez à la question du locataire protégé.')
  await page.locator('#notice_beneficiary').fill('Claire Exemple')
  await page.locator('#notice_rel').click()
  await page.getByRole('option', { name: 'Un descendant du bailleur' }).click()
  await page.locator('#notice_address').fill('3 rue Fictive, Lyon')
  // A protected tenant without a rehousing offer is refused by the API.
  await page.locator('#notice_protected').click()
  await page.getByRole('option', { name: 'Oui, sans offre de relogement' }).click()
  await page.getByTestId('letter-preview').click()
  await expect(page.getByTestId('form-error')).toContainText('locataire protégé ne peut recevoir congé')
  await page.locator('#notice_protected').click()
  await page.getByRole('option', { name: 'Non', exact: true }).click()
  await page.getByTestId('letter-preview').click()
  const latest = days(months(days(termEnd, 1), -6), -1)
  await expect(page.getByTestId('letter-terms')).toContainText(`fin du bail au ${fr(termEnd)}`)
  await expect(page.getByTestId('letter-terms')).toContainText(`au plus tard le ${fr(latest)} (6 mois avant)`)

  await page.getByTestId('letter-issue').click()
  await expect(page.getByTestId('notice-letter')).toContainText('Lettre de congé CG-00000001-2026-0001 générée')
  await page.locator('#notice_delivery').click()
  await page.getByRole('option', { name: 'Acte de commissaire de justice' }).click()
  await page.getByTestId('save-notice').click()
  await expect(page.getByTestId('notice-dialog')).toBeHidden()
  await expect(page.getByTestId('lease-state')).toHaveText('congé donné')
  await expect(page.getByTestId('notice-given-by')).toHaveText('le bailleur')
  await expect(page.getByTestId('notice-ground')).toHaveText('Reprise pour habiter')
  await expect(page.getByTestId('notice-end')).toHaveText(fr(termEnd))

  const reqs = await requests(page)
  const letters = reqs.filter((r) => r.path === '/leases/l1/notice/letter' && r.method === 'POST')
  expect(letters.at(-1)?.body).toEqual({ reason: 'repossession', protected_tenant: 'no', dry_run: false,
    beneficiary: { name: 'Claire Exemple', relationship: 'descendant', address: '3 rue Fictive, Lyon' } })
  expect(reqs.filter((r) => r.path === '/leases/l1/notice' && r.method === 'POST').at(-1)?.body).toMatchObject({ given_by: 'owner', delivery: 'bailiff', document_id: expect.any(String) })
})

test('a letter prepared earlier is recorded on reopening; a box keeps its end date by hand; a mobility lease has no owner notice', async ({ page }) => {
  await mock(page)
  await page.request.post('/api/v1/leases/l1/notice/letter', { headers: { 'X-CSRF-Token': 'csrf-test-token' },
    data: { reason: 'legitimate', grounds: 'Impayés répétés', protected_tenant: 'no' } })
  await page.goto('/leases/l1')
  await page.getByTestId('action-notice').click()
  await page.locator('#notice_by').click()
  await page.getByRole('option', { name: 'le bailleur' }).click()
  await expect(page.getByTestId('notice-letter')).toContainText('CG-00000001-2026-0001')
  await expect(page.getByTestId('notice-ground')).toHaveCount(0)
  await expect(page.getByTestId('save-notice')).toBeVisible()

  await mock(page, { kind: 'box' })
  await page.goto('/leases/l1')
  await page.getByTestId('action-notice').click()
  await expect(page.getByTestId('notice-dialog')).toHaveCount(0)
  await expect(page.locator('#notice_end')).toBeVisible()

  await mock(page, { kind: 'mobility', term_months: 6 })
  await page.goto('/leases/l1')
  await page.getByTestId('action-notice').click()
  await page.locator('#notice_by').click()
  await expect(page.getByRole('option', { name: 'le bailleur' })).toHaveAttribute('aria-disabled', 'true')
})

test('a notice refused once is retried with the letter already uploaded', async ({ page }) => {
  await mock(page)
  // The first recording fails; the letter's upload before it succeeded.
  let refused = false
  await page.route('**/api/v1/leases/l1/notice', async (r) => {
    if (!refused && r.request().method() === 'POST' && (r.request().postDataJSON() as { dry_run?: boolean }).dry_run === false) {
      refused = true
      await r.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', status: 503, title: 'Service indisponible.' }) })
      return
    }
    await r.continue()
  })
  await page.goto('/leases/l1')
  await page.getByTestId('action-notice').click()
  await page.locator('#notice_reason').click()
  await page.getByRole('option', { name: 'Perte d’emploi', exact: true }).click()
  await page.getByTestId('notice-compute').click()
  await expect(page.getByTestId('notice-terms')).toBeVisible()
  await page.getByTestId('file-notice_letter').setInputFiles({ name: 'conge.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n%%EOF\n') })
  await page.getByTestId('save-notice').click()
  await expect(page.getByTestId('notice-dialog')).toContainText('Service indisponible.')
  await page.getByTestId('save-notice').click()
  await expect(page.getByTestId('notice-dialog')).toBeHidden()
  await expect(page.getByTestId('lease-state')).toHaveText('congé donné')

  const reqs = await requests(page)
  const uploads = reqs.filter((r) => r.path === '/documents' && r.method === 'POST')
  expect(uploads).toHaveLength(1)
  const saved = reqs.filter((r) => r.path === '/leases/l1/notice' && r.method === 'POST' && r.body?.dry_run === false)
  expect(saved).toHaveLength(1)
  expect(saved[0]?.body?.document_id).toEqual(expect.any(String))
})
