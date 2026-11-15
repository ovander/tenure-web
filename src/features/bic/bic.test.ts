import { describe, expect, it } from 'vitest'
import { FULL, basisOf, duration, parsePercent, percent, shareTotal } from './bic'

describe('bic helpers', () => {
  it('formats and reads shares in basis points, by string', () => {
    expect(percent(1500)).toBe('15 %')
    expect(percent(1250)).toBe('12,5 %')
    expect(percent(null)).toBe('—')
    expect(parsePercent('15')).toBe(1500)
    expect(parsePercent('12,5')).toBe(1250)
    expect(parsePercent(' 7.25 % ')).toBe(725)
    expect(parsePercent('101')).toBeNull()
    expect(parsePercent('abc')).toBeNull()
  })
  it('adds up the shares and computes the basis', () => {
    expect(shareTotal([{ share_bp: 4000 }, { share_bp: 6000 }])).toBe(FULL)
    expect(basisOf({ price_cents: 100_000, acquisition_costs_cents: 7_000 })).toBe(107_000)
    expect(basisOf({ price_cents: 100_000, acquisition_costs_cents: 7_000, costs_expensed: true })).toBe(100_000)
  })
  it('names a duration', () => {
    expect(duration(600)).toEqual({ years: 50 })
    expect(duration(18)).toEqual({ months: 18 })
    expect(duration(0)).toBeNull()
  })
})
