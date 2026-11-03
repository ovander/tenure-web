import { describe, expect, it } from 'vitest'
import { Suggestions, depositFor, firstOfNextMonth, monthOf, termFor } from './defaults'

// Parameter values are made up: the app never knows the law's numbers.
const terms = { unfurnished: 30, furnished: 10 }
const mobility = { min: 2, max: 8 }

describe('lease defaults', () => {
  it('starts on the 1st of next month in Europe/Paris', () => {
    expect(firstOfNextMonth(new Date('2026-11-03T10:00:00Z'))).toBe('2026-12-01')
    expect(firstOfNextMonth(new Date('2026-12-31T23:30:00Z'))).toBe('2027-02-01') // already 1 January in Paris
    expect(firstOfNextMonth(new Date('2026-12-15T12:00:00Z'))).toBe('2027-01-01')
  })
  it('reads the month of a day', () => {
    expect(monthOf('2026-12-01')).toBe(12)
    expect(monthOf('')).toBeUndefined()
  })
  it('takes the term from the parameters for the kind, none for a box or without them', () => {
    expect(termFor('unfurnished', terms, mobility)).toBe(30)
    expect(termFor('furnished', terms, mobility)).toBe(10)
    expect(termFor('mobility', terms, mobility)).toBe(8)
    expect(termFor('box', terms, mobility)).toBeUndefined()
    expect(termFor('unfurnished', undefined, mobility)).toBeUndefined()
  })
  it('proposes the rent times the cap, none for a box, without a rent or without a cap', () => {
    expect(depositFor('furnished', 80000, 3)).toBe(240000)
    expect(depositFor('mobility', 80000, 0)).toBe(0)
    expect(depositFor('box', 8000, 3)).toBeUndefined()
    expect(depositFor('unfurnished', undefined, 1)).toBeUndefined()
    expect(depositFor('unfurnished', 80000, undefined)).toBeUndefined()
  })
  it('replaces a field only while it is empty or holds the last proposal', () => {
    const form: { term?: number } = {}
    const s = new Suggestions<typeof form>()
    s.propose(form, 'term', 30)
    expect(form.term).toBe(30)
    s.propose(form, 'term', 10) // the kind changed: still the last proposal
    expect(form.term).toBe(10)
    form.term = 24 // the user typed their own
    s.propose(form, 'term', 30)
    expect(form.term).toBe(24)
    const f2: { term?: number } = {}
    const s2 = new Suggestions<typeof f2>()
    s2.propose(f2, 'term', 30)
    s2.propose(f2, 'term', undefined) // no default any more: the proposal is withdrawn
    expect(f2.term).toBeUndefined()
  })
})
