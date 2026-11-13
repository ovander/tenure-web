import { describe, expect, it } from 'vitest'
import { barWidths, bucketKey, change, occupancyBP } from './dashboard'

describe('dashboard helpers', () => {
  it('computes the occupancy in basis points', () => {
    expect(occupancyBP({ days: 90, occupied_days: 90 })).toBe(10_000)
    expect(occupancyBP({ days: 59, occupied_days: 49 })).toBe(8305)
    expect(occupancyBP({ days: 0, occupied_days: 0 })).toBeNull()
  })
  it('names the buckets', () => {
    expect(bucketKey({ from_days: 1, to_days: 30 })).toBe('1-30')
    expect(bucketKey({ from_days: 91 })).toBe('91+')
  })
  it('computes a variation', () => {
    expect(change(290_000, 234_000)).toBe(2393)
    expect(change(-50, -100)).toBe(5000)
    expect(change(10, 0)).toBeNull()
  })
  it('scales the month bars', () => {
    expect(barWidths([{ in_cents: 90_000, out_cents: 72_000 }, { in_cents: 140_000, out_cents: 0 }])).toEqual([{ in: 64, out: 51 }, { in: 100, out: 0 }])
    expect(barWidths([])).toEqual([])
  })
})
