import { describe, expect, it } from 'vitest'
import { currentPeriod, date, dayOf, money, timestamp } from './format'

const nbsp = /[  ]/g
const plain = (s: string) => s.replace(nbsp, ' ')

describe('money', () => {
  it.each([
    [0, '0,00 €'],
    [5, '0,05 €'],
    [123456, '1 234,56 €'],
    [100000000, '1 000 000,00 €'],
    [-4250, '−42,50 €'],
  ])('%d cents is %s', (cents, want) => expect(plain(money(cents))).toBe(want))

  it('is exact beyond float precision', () => {
    expect(plain(money(900719925474099312n))).toBe('9 007 199 254 740 993,12 €')
  })
})

describe('dates', () => {
  it('formats a calendar day without a time zone shift', () => {
    expect(date('2026-01-01')).toBe('01/01/2026')
    expect(date('nope')).toBe('')
    expect(date(undefined)).toBe('')
  })
  it('formats instants in Europe/Paris', () => {
    expect(timestamp('2026-11-01T05:00:12Z')).toBe('01/11/2026 06:00')
    expect(dayOf('2026-06-30T22:30:00Z')).toBe('01/07/2026')
  })
  it('takes the current period in Europe/Paris', () => {
    expect(currentPeriod(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11')
  })
})
