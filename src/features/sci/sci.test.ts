import { describe, expect, it } from 'vitest'
import { navFor } from '@/app/nav'
import { nineDigits, openHoldings, sharePercent, type Associate } from './sci'

describe('sharePercent', () => {
  it('reads parts over the parts held, on integers', () => {
    expect(sharePercent(400, 1000)).toBe('40 %')
    expect(sharePercent(1, 3)).toBe('33,33 %')
    expect(sharePercent(2, 3)).toBe('66,66 %')
    expect(sharePercent(1, 8)).toBe('12,5 %')
  })
  it('says nothing when nobody holds a part', () => {
    expect(sharePercent(0, 1000)).toBe('—')
    expect(sharePercent(5, 0)).toBe('—')
    expect(sharePercent(undefined, undefined)).toBe('—')
  })
})

describe('openHoldings', () => {
  it('keeps the holdings still held, with their associate', () => {
    const as: Associate[] = [
      { id: 'a', name: 'A', holdings: [{ id: 'h1', parts: 600, from_on: '2024-01-10', closed_on: '2025-07-01' }, { id: 'h2', parts: 400, from_on: '2025-07-01' }] },
      { id: 'b', name: 'B', holdings: [{ id: 'h3', parts: 400, from_on: '2024-01-10' }] },
      { id: 'c', name: 'C' },
    ]
    expect(openHoldings(as).map((x) => [x.associate.id, x.holding.id])).toEqual([['a', 'h2'], ['b', 'h3']])
  })
})

describe('nineDigits', () => {
  it('checks a SIREN form', () => {
    expect(nineDigits('123 456 789')).toBe(true)
    expect(nineDigits('12345678')).toBe(false)
    expect(nineDigits('12345678A')).toBe(false)
  })
})

describe('navFor', () => {
  it('shows the SCI entries in an SCI scope and the person ones elsewhere', () => {
    const sci = navFor(true).map((i) => i.to)
    const person = navFor(false).map((i) => i.to)
    expect(sci).toContain('/sci')
    expect(sci).not.toContain('/tax')
    expect(sci).not.toContain('/bic')
    expect(person).toContain('/tax')
    expect(person).toContain('/shares')
    expect(person).not.toContain('/sci')
    expect(sci).toContain('/assets')
    expect(person).toContain('/assets')
  })
})
