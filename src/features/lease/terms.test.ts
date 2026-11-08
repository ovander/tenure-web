import { describe, expect, it } from 'vitest'
import { yearsOf } from './terms'

describe('terms', () => {
  it('lists the vacant years latest first, without empty years', () => {
    expect(yearsOf({ days_by_year: { 2024: 92, 2026: 8, 2025: 0 } as Record<string, number> })).toEqual([{ year: 2026, days: 8 }, { year: 2024, days: 92 }])
    expect(yearsOf({})).toEqual([])
  })
})
