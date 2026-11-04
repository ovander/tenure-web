import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// Web slice 6 under tenure's CSP: S13 documents (filters and number search in
// the URL, download, ZIP export behind step-up, flow 5 « cancel and reissue »
// from a rent call), S14 grants (give then revoke, behind step-up),
// parameters (read for all, an admin adds a dated value behind step-up), and
// the RGPD export of the profile.

interface Req { method: string; path: string; csrf?: string; body?: Record<string, unknown> }
const requests = async (page: Page): Promise<Req[]> => (await page.request.get('/__mock/requests')).json()
const owner = '00000000-0000-7000-8000-000000000001'

async function mock(page: Page, state: Record<string, unknown> = {}): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', {
    data: {
      assets: [{ id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', version: 1, shares: [{ owner_id: owner, bp: 10000 }] }],
      tenants: [{ id: 't1', names: ['Jeanne Martin'], version: 1 }],
      leases: [{ id: 'l1', kind: 'unfurnished', state: 'active', asset_ids: ['a1'], tenants: [{ tenant_id: 't1' }], start_on: '2026-01-01', term_months: 36, rent_cents: 80000, provision_cents: 5000, due_day: 5, version: 2 }],
      archive: [
        { id: 'f1', class: 'rent_call', number: 'AL-00000001-2026-0011', asset_id: 'a1', lease_id: 'l1', period: '2026-11', issued_at: '2026-11-01T05:00:00Z', source: 'generated', template_version: 'v1', sha256: 'a'.repeat(64) },
        { id: 'f2', class: 'receipt', number: 'QL-00000001-2026-0010', asset_id: 'a1', lease_id: 'l1', period: '2026-10', issued_at: '2026-10-08T05:00:00Z', source: 'generated', template_version: 'v1', sha256: 'b'.repeat(64) },
        { id: 'f3', class: 'contract', asset_id: 'a1', lease_id: 'l1', issued_at: '2026-01-02T10:00:00Z', source: 'upload', original_name: 'bail-signé.pdf', sha256: 'c'.repeat(64) },
      ],
      billingDocs: [{ id: 'b1', kind: 'rent_call', lease_id: 'l1', period: '2026-11', number: 'AL-00000001-2026-0011', generation: 1, total_cents: 85000, document_id: 'f1', issued_at: '2026-11-01T05:00:00Z' }],
      ...state,
    },
  })
}
const fresh = (page: Page) => page.request.post('/__mock/state', { data: { stepUpFresh: true } })

test('S13: filter and search the archive, download, export a year after step-up, cancel and reissue a rent call', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/documents')
  await expect(page.getByTestId('doc-class')).toHaveText(['Appel de loyer', 'Quittance', 'Contrat'])
  await expect(page.getByTestId('doc-name')).toContainText(['Document généré (modèle v1)', 'Document généré (modèle v1)', 'bail-signé.pdf'])

  // Filters and the number search live in the URL.
  await page.locator('#d_class').click()
  await page.getByRole('option', { name: 'Appel de loyer' }).click()
  await expect(page).toHaveURL(/class=rent_call/)
  await expect(page.getByTestId('doc-class')).toHaveText(['Appel de loyer'])
  await page.locator('#d_class').click()
  await page.getByRole('option', { name: 'Tous les types' }).click()
  await page.locator('#d_number').fill('QL-00000001')
  await page.getByTestId('search-number').click()
  await expect(page).toHaveURL(/number=QL-00000001/)
  await expect(page.getByTestId('doc-class')).toHaveText(['Quittance'])
  await page.reload()
  await expect(page.getByTestId('doc-class')).toHaveText(['Quittance'])

  // Download goes through the signed link.
  await page.getByTestId('archive-download').click()
  await expect.poll(async () => (await requests(page)).some((r) => r.path === '/documents/f2/content')).toBe(true)

  // Export: step-up first, then the archive is prepared and its link offered.
  await page.goto('/documents')
  await page.getByTestId('export').click()
  await page.getByTestId('confirm').click()
  await expect(page.getByTestId('step-up')).toBeVisible()
  await page.getByTestId('step-up').getByRole('button', { name: 'Annuler' }).click()
  await fresh(page)
  await page.getByTestId('confirm').click()
  await expect(page.getByTestId('export-ready')).toContainText('3 document(s)')
  await expect(page.getByTestId('export-download')).toBeVisible()
  const exp = (await requests(page)).filter((r) => r.path === '/documents/export').at(-1)
  expect(exp?.body).toEqual({ year: new Date().getFullYear() - 1 })
  expect(exp?.csrf).toBe('csrf-test-token')
  await page.keyboard.press('Escape')

  // Flow 5 from the archive: the rent call is cancelled and reissued.
  await page.getByTestId('archive-cancel').click()
  await expect(page.getByTestId('confirm-dialog')).toContainText('AL-00000001-2026-0011')
  await expect(page.getByTestId('confirm')).toBeDisabled()
  await page.locator('#archive_reason').fill('Erreur de provision')
  await page.getByTestId('confirm').click()
  await expect(page.getByText(/réémis sous le numéro AL-/)).toBeVisible()
  const cancel = (await requests(page)).filter((r) => r.path === '/billing/documents/b1/cancel').at(-1)
  expect(cancel?.body).toEqual({ reason: 'Erreur de provision' })

  // The asset hub shows the same archive for its asset.
  await page.goto('/assets/a1/documents')
  await expect(page.getByTestId('doc-class')).toHaveCount(3)
  expect(violations).toEqual([])
})

test('S14: an owner gives an accountant access, then revokes it, behind step-up', async ({ page }) => {
  await mock(page, { stepUpFresh: true })
  const violations = await watchCSP(page)
  await page.goto('/settings/grants')
  await expect(page.getByTestId('grants-empty')).toBeVisible()
  await page.getByTestId('invite').click()
  await expect(page.locator('#g_acc')).toBeChecked()
  await page.locator('#g_sub').fill('socrate|comptable-42')
  await page.getByTestId('confirm').click()
  await expect(page.getByTestId('grant-sub')).toHaveText(['socrate|comptable-42'])
  await expect(page.getByTestId('grant')).toContainText('Comptable')
  await page.getByTestId('revoke').click()
  await expect(page.getByTestId('confirm-dialog')).toContainText('socrate|comptable-42 n’aura plus accès')
  await page.getByTestId('confirm').click()
  await expect(page.getByTestId('grants-empty')).toBeVisible()
  await expect(page.getByTestId('grants-revoked')).toContainText('1 accès révoqué(s)')
  const reqs = await requests(page)
  expect(reqs.find((r) => r.method === 'POST' && r.path === '/grants')?.body).toEqual({ grantee_sub: 'socrate|comptable-42', role: 'accountant' })
  expect(reqs.some((r) => r.method === 'DELETE' && r.path.startsWith('/grants/'))).toBe(true)
  expect(violations).toEqual([])
})

test('S14: parameters are read by all; an admin adds a dated value behind step-up', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/settings/params')
  await expect(page.getByTestId('param-key')).toContainText(['deposit_max_months.unfurnished'])
  await expect(page.getByTestId('irl')).toContainText('2026-Q2')
  await expect(page.getByTestId('param-add')).toHaveCount(0)

  await mock(page, { admin: true, stepUpFresh: true })
  await page.goto('/settings/params')
  await page.locator('#p_filter').fill('deposit_max_months.unfurnished')
  await expect(page.getByTestId('param')).toHaveCount(1)
  await page.getByTestId('param-add').click()
  await expect(page.locator('#pa_value')).toHaveValue('1')
  await page.locator('#pa_value').fill('{bad')
  await page.getByTestId('confirm').click()
  await expect(page.getByTestId('param-error')).toContainText('JSON')
  await page.locator('#pa_value').fill('2')
  await page.locator('#pa_source').fill('Test : valeur inventée')
  await page.getByTestId('confirm').click()
  await expect(page.getByTestId('confirm-dialog')).toBeHidden()
  const put = (await requests(page)).find((r) => r.method === 'PUT' && r.path === '/params/deposit_max_months.unfurnished')
  expect(put?.body).toMatchObject({ value: 2, source: 'Test : valeur inventée' })
  expect(String(put?.body?.effective_from)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(violations).toEqual([])
})

test('S14: the profile exports the owner’s data after step-up', async ({ page }) => {
  await mock(page, { stepUpFresh: true })
  const violations = await watchCSP(page)
  await page.goto('/settings/profile')
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('my-data').click()])
  expect(file.suggestedFilename()).toMatch(/^tenure-mes-donnees-\d{4}-\d{2}-\d{2}\.json$/)
  const body = JSON.parse(await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8')))
  expect(body).toMatchObject({ sub: 'sub-test', owner: { legal_name: 'Bailleur Test' } })
  expect(violations).toEqual([])
})
