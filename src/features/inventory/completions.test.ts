import { describe, expect, it } from 'vitest'
import { asked, eligible, outcome, pending } from './completions'

describe('completions', () => {
  it('offers every item within ten days, heating items only in the heating season', () => {
    const items = [{ id: 'a', category: 'floor' }, { id: 'b', category: 'heating' }]
    expect(eligible(items, 'ten_day').map((i) => i.id)).toEqual(['a', 'b'])
    expect(eligible(items, 'heating').map((i) => i.id)).toEqual(['b'])
  })
  it('needs a line to ask for something', () => {
    expect(asked({})).toBe(false)
    expect(asked({ comment: '  ' })).toBe(false)
    expect(asked({ condition: 'fair' })).toBe(true)
    expect(asked({ works: 'ko' })).toBe(true)
    expect(asked({ comment: 'Rayure' })).toBe(true)
  })
  it('counts the requests to decide', () => {
    expect(pending({ completions: [{ decision: 'pending' }, { decision: 'accepted' }, { decision: 'pending' }] })).toBe(2)
    expect(pending(null)).toBe(0)
  })
  it('gives the decision once every line is decided', () => {
    expect(outcome(['a', 'b'], { a: true })).toBeUndefined()
    expect(outcome(['a', 'b'], { a: true, b: true })).toBe('accepted')
    expect(outcome(['a', 'b'], { a: false, b: false })).toBe('refused')
    expect(outcome(['a', 'b'], { a: true, b: false })).toBe('partial')
    expect(outcome([], {})).toBeUndefined()
  })
})
