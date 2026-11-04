import { describe, expect, it } from 'vitest'
import { categoriesOf, flagsBySource, lineKind, lower, type LineMap } from './store'

// Made-up line numbers: the app reads them from form_2044_line_map.
const map: LineMap = { lines: { rent: '901', management: '902', loan_interest: '904', loan_insurance: '904', teom: '' }, income_lines: ['901'], interest_lines: ['904'], subtracted_lines: ['905'] }

describe('tax helpers', () => {
  it('names the categories of a line from the parameter', () => {
    expect(categoriesOf('904', map)).toEqual(['loan_insurance', 'loan_interest'])
    expect(categoriesOf('999', map)).toEqual([])
    expect(categoriesOf('901', undefined)).toEqual([])
  })

  it('tells how a line counts', () => {
    expect(lineKind('901', map)).toBe('income')
    expect(lineKind('904', map)).toBe('interest')
    expect(lineKind('905', map)).toBe('subtracted')
    expect(lineKind('902', map)).toBe('expense')
  })

  it('names the lower taxable base, only when micro-foncier is open and they differ', () => {
    expect(lower({ micro: { eligible: true, taxable_cents: 672000 }, reel: { taxable_cents: 590000 } })).toBe('reel')
    expect(lower({ micro: { eligible: true, taxable_cents: 500000 }, reel: { taxable_cents: 590000 } })).toBe('micro')
    expect(lower({ micro: { eligible: false, taxable_cents: 1 }, reel: { taxable_cents: 590000 } })).toBe('')
    expect(lower({ micro: { eligible: true, taxable_cents: 7 }, reel: { taxable_cents: 7 } })).toBe('')
  })

  it('indexes flags by the source they point at', () => {
    expect(flagsBySource([{ kind: 'missing_document', id: 'c2' }, { kind: 'draft_charge', id: 'c2' }, { kind: 'unmatched_payment', id: 'p1' }]))
      .toEqual({ c2: ['missing_document', 'draft_charge'], p1: ['unmatched_payment'] })
  })
})
