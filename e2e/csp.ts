import type { Page } from '@playwright/test'

// watchCSP collects every CSP violation of the page with where it came from:
// the console message, and the securitypolicyviolation event's directive,
// source file, line and blocked sample, so that a failure names its cause.
export async function watchCSP(page: Page): Promise<string[]> {
  const violations: string[] = []
  // Runs in the page (a string: the test project has no DOM types).
  await page.addInitScript({
    content: `document.addEventListener('securitypolicyviolation', (e) =>
      console.log('[csp] ' + e.violatedDirective + ' at ' + e.sourceFile + ':' + e.lineNumber + ':' + e.columnNumber + ' sample=' + JSON.stringify(e.sample)))`,
  })
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to|^\[csp\]/.test(m.text())) violations.push(m.text())
  })
  return violations
}
