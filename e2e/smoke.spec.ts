import { expect, test, type Page } from '@playwright/test'
import { watchCSP } from './csp'

// Smoke of the shell (RENT-FE-001 §7) under tenure's CSP: a session is read
// from the BFF, the CSRF token rides on unsafe requests, a missing session
// goes to /bff/login, and nothing the app does violates the policy.

interface Req { method: string; path: string; csrf?: string; scope?: string; ifMatch?: string; query?: string; body?: Record<string, unknown> }

async function mock(page: Page, state: Record<string, unknown> = {}): Promise<void> {
  await page.request.post('/__mock/reset')
  if (Object.keys(state).length) await page.request.post('/__mock/state', { data: state })
}
const requests = async (page: Page): Promise<Req[]> => (await page.request.get('/__mock/requests')).json()


test('a signed-in owner sees home, styled, with no CSP violation', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/')
  await expect(page.getByTestId('welcome')).toHaveText('Bonjour Bailleur Test')
  await expect(page.getByTestId('runs')).toContainText('Appels de loyer du mois')
  await expect(page.getByTestId('runs')).toContainText('réussi')
  await expect(page.getByTestId('runs')).toContainText('01/11/2026 06:00')
  // PrimeVue's theme reached the page through the nonce: the tag is coloured.
  const tag = page.locator('[data-test="runs"] .p-tag').first()
  await expect(tag).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(page.locator('style[data-primevue-style-id]').first()).toBeAttached()
  // Navigation and the placeholder screens.
  await page.getByRole('link', { name: 'Facturation', exact: true }).click()
  await expect(page).toHaveURL(/\/billing\/\d{4}-\d{2}$/)
  await expect(page.getByTestId('billing-title')).toContainText('Facturation')
  await page.getByRole('link', { name: 'Documents' }).click()
  await expect(page).toHaveURL(/\/documents$/)
  await expect(page.getByTestId('export')).toBeVisible()
  await page.goto('/settings/templates')
  await expect(page.getByTestId('template')).toHaveCount(2)
  // One scope: no scope switcher.
  await expect(page.getByTestId('scope')).toHaveCount(0)
  const scoped = (await requests(page)).find((r) => r.path.startsWith('/jobs/runs'))
  expect(scoped?.scope).toBe('00000000-0000-7000-8000-000000000001')
  expect(violations).toEqual([])
})

test('without a session the app goes to the BFF login with its return path', async ({ page }) => {
  await mock(page, { authenticated: false })
  await page.goto('/settings/profile')
  await expect(page.locator('#socrate')).toBeVisible()
  const login = (await requests(page)).find((r) => r.path === '/bff/login')
  expect(new URLSearchParams(login?.query).get('return_to')).toBe('/settings/profile')
})

test('the profile saves with If-Match and the CSRF token, and switches the language', async ({ page }) => {
  await mock(page)
  const violations = await watchCSP(page)
  await page.goto('/settings/profile')
  await expect(page.locator('#legal_name')).toHaveValue('Bailleur Test')
  await page.locator('#legal_name').fill('')
  await page.getByTestId('save').click()
  await expect(page.getByTestId('form-error')).toContainText('Corrigez les champs signalés.')
  await expect(page.getByText('Le nom est obligatoire.')).toBeVisible()

  await page.locator('#legal_name').fill('Bailleur Renommé')
  await page.locator('#language').click()
  await page.getByRole('option', { name: 'English' }).click()
  await page.getByTestId('save').click()
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()
  const put = (await requests(page)).filter((r) => r.method === 'PUT' && r.path === '/me').at(-1)
  expect(put?.csrf).toBe('csrf-test-token')
  expect(put?.ifMatch).toBe('W/"3"')
  expect(put?.scope).toBeUndefined()
  expect(put?.body).toMatchObject({ legal_name: 'Bailleur Renommé', language: 'en' })
  expect(violations).toEqual([])
})

test('a first visit without a profile is invited to create one', async ({ page }) => {
  await mock(page, { owner: null })
  await page.goto('/')
  await expect(page.getByTestId('no-profile')).toBeVisible()
  await page.getByRole('link', { name: 'Créer mon profil' }).click()
  await page.locator('#legal_name').fill('Nouvelle Bailleresse')
  await page.locator('#address').fill('2 place Bellecour, Lyon')
  await page.getByRole('button', { name: 'Créer mon profil' }).click()
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeVisible()
  const put = (await requests(page)).filter((r) => r.method === 'PUT').at(-1)
  expect(put?.ifMatch).toBeUndefined()
})

test('several scopes show the switcher', async ({ page }) => {
  await mock(page, { extraScopes: [{ owner_id: '00000000-0000-7000-8000-000000000002', legal_name: 'SCI Lumière', role: 'accountant' }] })
  await page.goto('/')
  await expect(page.getByTestId('scope')).toBeVisible()
  await page.getByTestId('scope').click()
  await expect(page.getByRole('option', { name: 'SCI Lumière (comptable)' })).toBeVisible()
})

test('logout posts with the CSRF token', async ({ page }) => {
  await mock(page)
  await page.goto('/')
  await page.getByTestId('logout').click()
  await expect(page.locator('#socrate')).toBeVisible()
  const out = (await requests(page)).find((r) => r.path === '/bff/logout')
  expect(out?.method).toBe('POST')
  expect(out?.csrf).toBe('csrf-test-token')
})

test('an unknown hashed asset is a 404, an unknown route is the app', async ({ page }) => {
  expect((await page.request.get('/assets/missing-abc.js')).status()).toBe(404)
  await mock(page)
  await page.goto('/nope/nothing')
  await expect(page.getByText('Page introuvable')).toBeVisible()
})
