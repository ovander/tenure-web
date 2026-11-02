import { describe, expect, it } from 'vitest'
import { basisPoints, currentPeriod, date, dayOf, hundredths, isoDay, localDay, money, parseHundredths, surface, timestamp } from './format'

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

describe('two-decimal quantities', () => {
  it.each([
    ['1 234,56', 123456],
    ['1234.5', 123450],
    ['12', 1200],
    ['0,05', 5],
    ['1 000,00 €', 100000],
    ['−3,10', -310],
    ['45,50 m²', 4550],
  ])('parses %s', (text, want) => expect(parseHundredths(text)).toBe(want))

  it('refuses what is not a two-decimal number, and an empty field is null', () => {
    expect(parseHundredths('')).toBeNull()
    expect(parseHundredths('  ')).toBeNull()
    for (const bad of ['1,234', 'abc', '1,2,3', '12e3', '99999999999999999999']) expect(parseHundredths(bad)).toBeNaN()
  })

  it('formats and round-trips', () => {
    expect(plain(hundredths(123456))).toBe('1 234,56')
    expect(plain(surface(4550))).toBe('45,50 m²')
    expect(surface(null)).toBe('')
    expect(plain(basisPoints(5000))).toBe('50 %')
    expect(plain(basisPoints(3333))).toBe('33,33 %')
    for (const v of [0, 7, 123456, -310, 900719925474099]) expect(parseHundredths(hundredths(v))).toBe(v)
  })
})

describe('calendar days', () => {
  it('keeps the picked day whatever the time zone', () => {
    expect(isoDay(new Date(2026, 0, 31))).toBe('2026-01-31')
    expect(isoDay(localDay('2024-02-29'))).toBe('2024-02-29')
    expect(isoDay(null)).toBeUndefined()
    expect(localDay('31/01/2026')).toBeNull()
  })
})
