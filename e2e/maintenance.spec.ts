import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// Maintenance under tenure's CSP (RENT-SPEC-015, tenure-api Q-130, Q-131,
// Q-W40): a contractor added; an incident reported and followed through a
// quote, the works scheduled and done, to a repair invoice that becomes a
// charge; a boiler's servicing with the legal rhythm the API serves, a visit
// recorded, a longer interval refused.

const owner = '00000000-0000-7000-8000-000000000001'
const iso = (d: Date) => d.toISOString().slice(0, 10)
const fr = (s: string) => s.split('-').reverse().join('/')
async function mock(page: Page): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: {
    assets: [{ id: 'a1', kind: 'house', address: '12 rue des Lilas, Lyon', version: 1, shares: [{ owner_id: owner, bp: 10000 }] }],
    // Made up on purpose: the screen shows what the API decides.
    maintenanceRules: { boiler: { interval_months: 9, responsible: 'tenant' }, chimney: { interval_months: 1, responsible: 'tenant' } },
    maintenanceChimney: { default_months: 10, fuels: { wood: 4 } },
    extraParams: { 'tax.improvement_deductible': { asset_kinds: ['apartment'] } },
  } })
}

test('a contractor, an incident through to its repair invoice', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/maintenance/contractors')
  await expect(page.getByTestId('contractors-empty')).toBeVisible()
  await page.getByTestId('contractor-add').click()
  const cd = page.getByTestId('contractor-dialog')
  await cd.getByTestId('contractor-name').fill('Plomberie Exemple')
  await cd.getByTestId('contractor-trade').fill('plombier')
  await cd.getByTestId('contractor-save').click()
  await expect(cd).toBeHidden()
  await expect(page.getByTestId('contractor')).toContainText('Plomberie Exemple')

  await page.getByTestId('tab-incidents').click()
  await expect(page.getByTestId('incidents-empty')).toBeVisible()
  await page.getByTestId('incident-add').click()
  const id = page.getByTestId('incident-dialog')
  await id.getByTestId('incident-save').click()
  await expect(id.getByTestId('error-inc_asset')).toBeVisible()
  await id.getByTestId('incident-asset').click()
  await page.getByRole('option', { name: '12 rue des Lilas, Lyon' }).click()
  await id.getByTestId('incident-title').fill('Fuite sous l’évier')
  await id.getByTestId('incident-urgency').getByText('Urgent').click()
  await id.getByTestId('incident-save').click()
  await expect(id).toBeHidden()
  const card = page.getByTestId('incident')
  await expect(card.getByTestId('incident-status')).toHaveText('Signalé')

  const td = page.getByTestId('transition-dialog')
  await card.getByTestId('incident-quote').click()
  await td.getByTestId('transition-contractor').click()
  await page.getByRole('option', { name: 'Plomberie Exemple · plombier' }).click()
  await td.locator('#tr_quote').fill('420')
  await td.locator('#tr_quote').press('Tab')
  await td.getByTestId('transition-save').click()
  await expect(td).toBeHidden()
  await expect(card.getByTestId('incident-status')).toHaveText('Devis reçu')
  await expect(card.getByTestId('incident-facts')).toContainText(/devis 420,00\s€/)

  await card.getByTestId('incident-schedule').click()
  await td.getByTestId('transition-save').click()
  await expect(card.getByTestId('incident-status')).toHaveText('Planifié')
  await card.getByTestId('incident-done').click()
  await td.getByTestId('transition-save').click()
  await expect(card.getByTestId('incident-status')).toHaveText('Fait')
  await expect(card.getByTestId('incident-edit')).toHaveCount(0)

  await card.getByTestId('incident-invoice').click()
  await expect(td.getByTestId('treatment-hint')).toContainText('ligne 224')
  // The asset is a house, which the (made-up) parameter does not list: its
  // improvement is capitalised; enlargement never deducted.
  await td.getByTestId('transition-treatment').getByText('Amélioration').click()
  await expect(td.getByTestId('treatment-hint')).toContainText('jamais déduit')
  await td.getByTestId('transition-treatment').getByText('Construction, agrandissement').click()
  await expect(td.getByTestId('treatment-hint')).toContainText('jamais déduit')
  await td.getByTestId('transition-treatment').getByText('Réparation, entretien').click()
  await td.getByTestId('transition-save').click()
  await expect(td).toBeHidden()
  // Invoiced, it leaves the open list; all of them show it with its charge.
  await expect(page.getByTestId('incidents-empty')).toBeVisible()
  await page.getByTestId('open-only').click()
  await expect(card.getByTestId('incident-invoice')).toContainText(/Facture de 420,00\s€ \(réparation, entretien\) — enregistrée en charge déductible/)
  await expect(card.getByTestId('incident-charge')).toHaveAttribute('href', '/charges')
  expect(violations).toEqual([])
})

test('a boiler serviced on the legal rhythm, a visit recorded, a longer interval refused', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/maintenance/contracts')
  await expect(page.getByTestId('contracts-empty')).toBeVisible()
  await page.getByTestId('contract-add').click()
  const d = page.getByTestId('contract-dialog')
  await d.getByTestId('contract-asset').click()
  await page.getByRole('option', { name: '12 rue des Lilas, Lyon' }).click()
  await expect(d.getByTestId('contract-title')).toHaveValue('Entretien de la chaudière')
  await d.getByTestId('contract-save').click()
  await expect(d).toBeHidden()
  const row = page.getByTestId('contract').first()
  const today = iso(new Date())
  await expect(row).toContainText('tous les 9 mois')
  await expect(row).toContainText('le locataire')
  await expect(row.getByTestId('contract-next')).toContainText(fr(today))

  await row.getByTestId('contract-visit').click()
  const v = page.getByTestId('visit-dialog')
  await v.locator('[data-test="file-vi_doc"]').setInputFiles({ name: 'attestation.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') })
  await v.getByTestId('visit-save').click()
  await expect(v).toBeHidden()
  const n = new Date()
  n.setMonth(n.getMonth() + 9)
  await expect(row.getByTestId('contract-last')).toHaveText(fr(today))
  await expect(row.getByTestId('contract-next')).toContainText(fr(iso(n)).slice(3))

  // A chimney needs its fuel; wood follows the (made-up) wood rhythm.
  await page.getByTestId('contract-add').click()
  await d.getByTestId('contract-asset').click()
  await page.getByRole('option', { name: '12 rue des Lilas, Lyon' }).click()
  await d.getByTestId('contract-kind').click()
  await page.getByRole('option', { name: 'Ramonage' }).click()
  await d.getByTestId('contract-save').click()
  await expect(d.getByTestId('error-ct_fuel')).toBeVisible()
  await d.getByTestId('contract-fuel').click()
  await page.getByRole('option', { name: 'Bois' }).click()
  await d.getByTestId('contract-save').click()
  await expect(d).toBeHidden()
  await expect(page.getByTestId('contract').filter({ hasText: 'Bois' })).toContainText('tous les 4 mois')

  await row.getByTestId('contract-edit').click()
  await d.locator('#ct_interval').fill('24')
  await d.locator('#ct_interval').press('Tab')
  await d.getByTestId('contract-save').click()
  await expect(d.getByTestId('error-ct_interval')).toContainText('9 mois au plus')
  expect(violations).toEqual([])
})
