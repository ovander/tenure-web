import { describe, expect, it } from 'vitest'
import { addMonths, hasLetter, overdueDebt, splitDebt } from './recovery'

describe('recovery', () => {
  it('adds months, clamped to the month end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-11-10', 2)).toBe('2027-01-10')
  })
  it('splits a debt in equal monthly instalments, the remainder last', () => {
    const p = splitDebt(100000, 3, '2026-12-10')
    expect(p.map((x) => x.due_on)).toEqual(['2026-12-10', '2027-01-10', '2027-02-10'])
    expect(p.map((x) => x.amount_cents)).toEqual([33333, 33333, 33334])
    expect(p.reduce((s, x) => s + (x.amount_cents ?? 0), 0)).toBe(100000)
    expect(splitDebt(0, 3, '2026-12-10')).toEqual([])
  })
  it('knows the steps with a letter, and the debt a plan covers', () => {
    expect(hasLetter('formal_notice')).toBe(true)
    expect(hasLetter('commandement')).toBe(false)
    expect(overdueDebt({ arrears: { overdue_cents: 75000 } })).toBe(75000)
  })
})
