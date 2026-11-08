import { describe, expect, it } from 'vitest'
import { mayReevaluate, references, stepState } from './renewal'

describe('renewal', () => {
  it('re-evaluates an active unfurnished lease with no end only', () => {
    expect(mayReevaluate({ kind: 'unfurnished', state: 'active' })).toBe(true)
    expect(mayReevaluate({ kind: 'furnished', state: 'active' })).toBe(false)
    expect(mayReevaluate({ kind: 'unfurnished', state: 'notice', end_on: '2027-01-31' })).toBe(false)
    expect(mayReevaluate({ kind: 'unfurnished', state: 'active', end_on: '2027-01-31' })).toBe(false)
  })
  it('keeps the filled references, trimmed, and flags a half-filled one', () => {
    expect(references([
      { address: ' 1 rue A ', description: ' T2 ', rentCents: 80000 },
      { address: '', description: '', rentCents: null },
      { address: '2 rue B', description: '', rentCents: 81000 },
    ])).toEqual({ refs: [{ address: '1 rue A', description: 'T2', rent_cents: 80000 }, { address: '2 rue B', rent_cents: 81000 }], incomplete: false })
    expect(references([{ address: '3 rue C', description: '', rentCents: null }]).incomplete).toBe(true)
    expect(references([{ address: '', description: '', rentCents: 50000 }]).incomplete).toBe(true)
  })
  it('marks steps applied, due and upcoming', () => {
    const r = { steps_applied: 1, steps_due: 1 }
    expect([0, 1, 2].map((i) => stepState(r, i))).toEqual(['applied', 'due', 'upcoming'])
  })
})
