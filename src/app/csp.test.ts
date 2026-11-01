import { describe, expect, it } from 'vitest'
import { cspNonce } from './csp'

function doc(content?: string): Document {
  const d = document.implementation.createHTMLDocument('')
  if (content !== undefined) {
    const m = d.createElement('meta')
    m.name = 'csp-nonce'
    m.content = content
    d.head.append(m)
  }
  return d
}

describe('cspNonce', () => {
  it('reads the nonce tenure wrote', () => expect(cspNonce(doc('q1w2e3r4t5y6u7i8o9p0Aa=='))).toBe('q1w2e3r4t5y6u7i8o9p0Aa=='))
  it('ignores the placeholder, a missing tag and a malformed value', () => {
    expect(cspNonce(doc('__CSP_NONCE__'))).toBeUndefined()
    expect(cspNonce(doc())).toBeUndefined()
    expect(cspNonce(doc('"><script>'))).toBeUndefined()
  })
})
