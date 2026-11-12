import { describe, expect, it } from 'vitest'
import { loanSource, parseRate, parseTable, rate } from './loans'

describe('rates', () => {
  it('reads a percent as parts per million, by string', () => {
    expect(parseRate('3,45')).toBe(34_500)
    expect(parseRate(' 3.45 % ')).toBe(34_500)
    expect(parseRate('1,125')).toBe(11_250)
    expect(parseRate('0')).toBe(0)
    expect(parseRate('')).toBeNull()
    expect(parseRate('100')).toBeNaN()
    expect(parseRate('3,45678')).toBeNaN()
    expect(parseRate('abc')).toBeNaN()
  })
  it('formats parts per million without trailing zeros', () => {
    expect(rate(34_500)).toBe('3,45 %')
    expect(rate(40_000)).toBe('4 %')
    expect(rate(11_250)).toBe('1,125 %')
    expect(rate(null)).toBe('—')
  })
})

describe('parseTable', () => {
  it('reads a pasted bank table, skipping its header and total', () => {
    const t = parseTable('Échéance;Capital;Intérêts;Assurance\n05/11/2026;0,00;28,75;3,00\n2026-12-05\t3 300,00\t28,75\t3\nTotal;3300;57,50;6\n')
    expect(t.bad).toEqual([])
    expect(t.rows).toEqual([
      { due_on: '2026-11-05', principal_cents: 0, interest_cents: 2875, insurance_cents: 300 },
      { due_on: '2026-12-05', principal_cents: 330000, interest_cents: 2875, insurance_cents: 300 },
    ])
  })
  it('reports a dated line it cannot read', () => {
    const t = parseTable('05/11/2026;abc;1\n05/12/2026;10\n05/01/2027;10;1')
    expect(t.bad).toEqual([1, 2])
    expect(t.rows).toHaveLength(1)
    expect(t.rows[0]?.insurance_cents).toBe(0)
  })
})

describe('loanSource', () => {
  it('reads the tax line sources of a loan', () => {
    expect(loanSource('loan:K1:12')).toEqual({ loanId: 'K1', seq: 12, insurance: false })
    expect(loanSource('loan:K1:12:insurance')).toEqual({ loanId: 'K1', seq: 12, insurance: true })
    expect(loanSource('0190c3a2-charge')).toBeNull()
  })
})
