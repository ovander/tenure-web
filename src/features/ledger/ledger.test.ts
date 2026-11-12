import { describe, expect, it } from 'vitest'
import { byClass, entryTotals, exportName, exportPath } from './ledger'

describe('ledger helpers', () => {
  it('names the exports', () => {
    expect(exportPath('fec', 2025)).toBe('/ledger/fec.txt?year=2025')
    expect(exportPath('pack', 2025)).toBe('/ledger/pack.zip?year=2025')
    expect(exportName('fec', 2025)).toBe('FEC20251231.txt')
    expect(exportName('journal', 2025)).toBe('journal-2025.csv')
  })
  it('totals an entry', () => {
    expect(entryTotals({ lines: [{ debit_cents: 900 }, { credit_cents: 800 }, { credit_cents: 100 }] })).toEqual({ debit: 900, credit: 900 })
  })
  it('groups the balances by class', () => {
    const g = byClass([{ account: '512000' }, { account: '164000' }, { account: '706000' }, { account: '165000' }])
    expect(g.map((x) => x.cls)).toEqual(['1', '5', '7'])
    expect(g[0]?.items.map((x) => x.account)).toEqual(['164000', '165000'])
  })
})
