import { describe, expect, it } from 'vitest'
import { current, rendered, shortHash } from './templates'

describe('templates', () => {
  const t = { versions: [{ version: 'v1', documents: 2 }, { version: 'v2', current: true, documents: 1 }, { version: 'v3' }] }

  it('finds the version in force and counts every version’s documents', () => {
    expect(current(t)?.version).toBe('v2')
    expect(current({ versions: [] })).toBeUndefined()
    expect(rendered(t)).toBe(3)
    expect(rendered({})).toBe(0)
  })

  it('shortens a fingerprint for display', () => {
    expect(shortHash('abcdef0123456789')).toBe('abcdef012345')
    expect(shortHash(undefined)).toBe('')
  })
})
