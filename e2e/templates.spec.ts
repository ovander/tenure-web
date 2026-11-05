import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// S14 Settings › Templates under tenure's CSP (Q-W24): each document template
// with its versions, the one in force marked, how many documents each version
// produced and when, its SHA-256, and a link to the archive of its class.
// Read only, for every role; an accountant gets the financial ones.

async function mock(page: Page, state: Record<string, unknown> = {}): Promise<void> {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: state })
}

test('S14 lists the templates and their versions, newest first', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/settings')
  await page.getByRole('link', { name: 'Modèles' }).click()
  await expect(page).toHaveURL(/\/settings\/templates$/)
  const contract = page.locator('[data-test="template"][data-name="contract"]')
  await expect(contract.getByTestId('template-name')).toHaveText('Contrat de location')
  await expect(contract).toContainText('version en vigueur : v2')
  const rows = contract.getByTestId('template-version')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('v2')
  await expect(rows.nth(0).getByTestId('version-current')).toHaveText('en vigueur')
  await expect(rows.nth(1).getByTestId('version-current')).toHaveCount(0)
  await expect(rows.nth(1).getByTestId('version-documents')).toHaveText('2 document(s)')
  await expect(rows.nth(1)).toContainText('du 10/01/2026 au 02/03/2026')
  await expect(rows.nth(1).getByTestId('version-sha')).toHaveAttribute('title', '1'.repeat(64))
  await expect(rows.nth(1).getByTestId('version-sha')).toHaveText('111111111111…')

  // A template that produced nothing yet says so and links nowhere.
  const call = page.locator('[data-test="template"][data-name="rent_call"]')
  await expect(call.getByTestId('version-documents')).toHaveText('aucun')
  await expect(call.getByTestId('template-documents')).toHaveCount(0)

  // The count opens the archive on the template's class.
  await contract.getByTestId('template-documents').click()
  await expect(page).toHaveURL(/\/documents\?class=contract$/)
  expect(violations).toEqual([])
})

test('an accountant reads the financial templates, with no edit control', async ({ page }) => {
  await mock(page, { role: 'accountant' })
  await page.goto('/settings/templates')
  await expect(page.getByTestId('template')).toHaveCount(1)
  await expect(page.getByTestId('template-name')).toHaveText('Appel de loyer')
  await expect(page.locator('[data-test="templates"] button')).toHaveCount(0)
})
