import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// Web slice 8 under tenure's CSP (Q-W23): a current lease is amended from its
// contract tab (rent, tenant added, box added), each amendment AV-… listed
// with the lease documents; the overview computes the IRL revision as a dry
// run, shows what limited it and applies it, issuing the notice. A read role
// sees neither action. Every amount and index here is made up.

interface Req { method: string; path: string; csrf?: string; body?: Record<string, unknown> }
const requests = async (page: Page): Promise<Req[]> => (await page.request.get('/__mock/requests')).json()
const owner = '00000000-0000-7000-8000-000000000001'

const base = {
  assets: [
    { id: 'a1', kind: 'apartment', address: '12 rue des Lilas, Lyon', version: 1, shares: [{ owner_id: owner, bp: 10000 }] },
    { id: 'b1', kind: 'box', address: '12 rue des Lilas, Lyon', lot: 'Box 7', version: 1, shares: [{ owner_id: owner, bp: 10000 }] },
  ],
  tenants: [{ id: 't1', names: ['Jeanne Martin'], version: 1 }, { id: 't2', names: ['Paul Durand'], version: 1 }],
  leases: [
    { id: 'l1', kind: 'unfurnished', state: 'active', asset_ids: ['a1'], tenants: [{ tenant_id: 't1', solidary: true }], start_on: '2025-01-01', term_months: 36,
      rent_cents: 80000, provision_cents: 5000, deposit_cents: 80000, due_day: 5, irl_ref_quarter: '2024-Q3', irl_ref_value: 14000, revision_month: 1, version: 2 },
  ],
}
async function mock(page: Page, state: Record<string, unknown> = {}): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: { ...base, ...state } })
}
async function choose(page: Page, id: string, option: string): Promise<void> {
  await page.locator(`#${id}`).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

test('an owner amends a current lease: a new rent, a tenant added, a box added', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/leases/l1/contract')

  // A rent change proposes the current rent; the same rent is the API's refusal.
  await page.getByTestId('amend').click()
  const dialog = page.getByTestId('amendment-dialog')
  await expect(dialog).toContainText('Loyer actuel : 800,00 €')
  await expect(page.locator('#amend_rent')).toHaveValue('800,00')
  await page.getByTestId('save-amendment').click()
  await expect(page.getByTestId('form-error')).toContainText('L’avenant demandé n’est pas valide.')
  await page.locator('#amend_rent').fill('820')
  await page.locator('#amend_rent').press('Tab')
  await page.locator('#amend_reason').fill('Accord des parties')
  await page.getByTestId('save-amendment').click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Avenant AV-00000001-2026-0001 émis.')).toBeVisible()
  await expect(page.getByTestId('document-card')).toContainText(['Avenant'])
  const sent = (await requests(page)).filter((r) => r.method === 'POST' && r.path === '/leases/l1/amendments')
  expect(sent.at(-1)?.body).toEqual({ kind: 'rent', effective_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), rent_cents: 82000, reason: 'Accord des parties' })
  expect(sent.at(-1)?.csrf).toBe('csrf-test-token')

  // A tenant added: only those not yet on the lease are offered.
  await page.getByTestId('amend').click()
  await choose(page, 'amend_kind', 'Ajout d’un locataire')
  await page.locator('#amend_tenant').click()
  await expect(page.getByRole('option')).toHaveText(['Paul Durand'])
  await page.getByRole('option', { name: 'Paul Durand' }).click()
  await page.getByTestId('save-amendment').click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('lease-tenants')).toHaveText('Jeanne Martin · Paul Durand')

  // A box added, keeping the rent when none is typed.
  await page.getByTestId('amend').click()
  await choose(page, 'amend_kind', 'Ajout d’un box')
  await expect(page.locator('#amend_rent')).toHaveValue('')
  await page.getByTestId('save-amendment').click()
  await expect(dialog.getByText('Le box ajouté est obligatoire.')).toBeVisible()
  await choose(page, 'amend_box', '12 rue des Lilas, Lyon · Box 7')
  await page.getByTestId('save-amendment').click()
  await expect(dialog).toBeHidden()
  const last = (await requests(page)).filter((r) => r.path === '/leases/l1/amendments').at(-1)
  expect(last?.body).toEqual({ kind: 'asset_add', effective_on: expect.any(String), asset_id: 'b1' })
  await page.getByTestId('tab-overview').click()
  await expect(page.getByTestId('lease-assets')).toContainText('Box 7')
  await expect(page.getByTestId('lease-terms')).toContainText('820,00 €')
  expect(violations).toEqual([])
})

test('the IRL revision is computed, explained and applied from the overview', async ({ page }) => {
  await mock(page, {
    revisions: {
      l1: { lease_id: 'l1', anniversary: '2026-01-01', effective_from: '2026-12', old_rent_cents: 80000, indexed_rent_cents: 83200, new_rent_cents: 82800,
        new_ref_quarter: '2025-Q3', new_ref_value: 14560, capped_by: 'irl_cap', ceiling_cents: 0, above_ceiling: false, forfeited: false },
    },
  })
  const violations = await watchCSP(page)
  await page.goto('/leases/l1/overview')
  await page.getByTestId('revise').click()
  const r = page.getByTestId('revision')
  await expect(r).toContainText('01/01/2026')
  await expect(r).toContainText('2025-Q3 : 145,60 (référence 2024-Q3 : 140,00)')
  await expect(page.getByTestId('revision-indexed')).toHaveText('832,00 €')
  await expect(page.getByTestId('revision-new')).toHaveText('828,00 €')
  await expect(page.getByTestId('revision-from')).toHaveText('décembre 2026')
  await expect(page.getByTestId('revision-note')).toHaveText('La hausse est limitée par la règle de plafonnement de l’IRL en vigueur.')
  // Opening the dialog only computed it.
  const dry = (await requests(page)).filter((r) => r.path === '/leases/l1/revision')
  expect(dry.map((x) => x.body)).toEqual([{ dry_run: true }])

  await page.getByTestId('apply-revision').click()
  await expect(page.getByTestId('revision-dialog')).toBeHidden()
  await expect(page.getByText('Révision appliquée, avis RV-00000001-2026-0001 émis.')).toBeVisible()
  await expect(page.getByTestId('lease-terms')).toContainText('828,00 €')
  await expect(page.getByTestId('lease-terms')).toContainText('2025-Q3, indice 145,60')

  // Once applied, none is due: the dialog says so and offers nothing to apply.
  await page.getByTestId('revise').click()
  await expect(page.getByTestId('revision-error')).toHaveText('Aucune révision de loyer n’est due pour ce bail.')
  await expect(page.getByTestId('apply-revision')).toHaveCount(0)
  expect(violations).toEqual([])
})

test('a forfeited revision says so before it is applied', async ({ page }) => {
  await mock(page, {
    revisions: {
      l1: { lease_id: 'l1', anniversary: '2024-01-01', effective_from: '2026-12', old_rent_cents: 80000, indexed_rent_cents: 83200, new_rent_cents: 80000,
        new_ref_quarter: '2025-Q3', new_ref_value: 14560, capped_by: '', forfeited: true },
    },
  })
  await page.goto('/leases/l1/overview')
  await page.getByTestId('revise').click()
  await expect(page.getByTestId('revision-note')).toContainText('elle est perdue et le loyer reste inchangé')
  await expect(page.getByTestId('revision-dialog')).toContainText('Le loyer ne change pas.')
})

test('a read role sees neither the amendment nor the revision, and a draft cannot be amended', async ({ page }) => {
  await mock(page, { role: 'accountant' })
  await page.goto('/leases/l1/contract')
  await expect(page.getByTestId('no-documents')).toBeVisible()
  await expect(page.getByTestId('amend')).toHaveCount(0)
  await page.getByTestId('tab-overview').click()
  await expect(page.getByTestId('lease-terms')).toBeVisible()
  await expect(page.getByTestId('revise')).toHaveCount(0)

  await mock(page, { leases: [{ ...base.leases[0], state: 'draft' }] })
  await page.goto('/leases/l1/contract')
  await expect(page.getByTestId('no-documents')).toBeVisible()
  await expect(page.getByTestId('amend')).toHaveCount(0)
  await page.getByTestId('tab-overview').click()
  await expect(page.getByTestId('revise')).toHaveCount(0)
})
