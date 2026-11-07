import { expect, test } from '@playwright/test'
import { watchCSP } from './csp'

// Settings › À propos (Q-W31): the web and API builds under tenure's CSP, a
// mismatch between the loaded bundle and the pinned release, an unstamped
// local API, and the API unavailable.

test('shows both builds and flags a bundle the API does not pin', async ({ page }) => {
  await page.request.post('/__mock/reset')
  const violations = await watchCSP(page)
  await page.goto('/settings/about')
  await expect(page.getByTestId('web-version')).toContainText(/^v\d+\.\d+\.\d+/)
  await expect(page.getByTestId('web-framework')).toContainText('Vue 3.')
  await expect(page.getByTestId('api-version')).toContainText('v0.1.21')
  await expect(page.getByTestId('api-stamp')).toHaveText('build de release')
  await expect(page.getByTestId('api-commit')).toHaveText('0123456789ab')
  await expect(page.getByTestId('api-go')).toHaveText('go1.27.3 · linux/amd64')
  await expect(page.getByTestId('api-schema')).toHaveText('000016')
  await expect(page.getByTestId('api-web')).toHaveText('v0.21.0')
  // The mock pins v0.21.0, this bundle's version: no mismatch.
  await expect(page.getByTestId('web-version')).toContainText('v0.21.0')
  await expect(page.getByTestId('mismatch')).toHaveCount(0)
  expect(violations).toEqual([])

  await page.request.post('/__mock/state', { data: { version: { api: { version: 'dev', stamped: false, modified: true, go_version: 'go1.27.3', platform: 'darwin/arm64' }, web: { release: 'v0.1.0' } } } })
  await page.reload()
  await expect(page.getByTestId('api-stamp')).toHaveText('build local, non estampillé')
  await expect(page.getByTestId('api-commit')).toHaveText('inconnu')
  await expect(page.getByTestId('mismatch')).toContainText('v0.1.0')
})

test('says when the server cannot tell its build', async ({ page }) => {
  await page.request.post('/__mock/reset')
  await page.request.post('/__mock/state', { data: { version: null } })
  await page.route('**/api/v1/version', (r) => r.fulfill({ status: 503, contentType: 'application/problem+json', body: '{"status":503,"title":"Indisponible"}' }))
  await page.goto('/settings/about')
  await expect(page.getByTestId('api-unavailable')).toBeVisible()
  await expect(page.getByTestId('web-version')).toContainText('v0.21.0')
})
