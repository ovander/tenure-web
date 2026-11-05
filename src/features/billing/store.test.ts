import { describe, expect, it } from 'vitest'
import { exception, feesTotal, live, revisionNotes, shiftPeriod, split } from './store'

describe('billing helpers', () => {
  it('sums the fees in cents', () => {
    expect(feesTotal([{ total_cents: 85000 }, { total_cents: 51548 }, {}])).toBe(136548)
    expect(feesTotal([])).toBe(0)
  })

  it('says what limited a revision, a forfeiture first', () => {
    expect(revisionNotes({ forfeited: true, capped_by: 'irl_cap' })).toEqual(['revision.forfeited'])
    expect(revisionNotes({ above_ceiling: true })).toEqual(['revision.aboveCeiling'])
    expect(revisionNotes({ capped_by: 'irl_cap' })).toEqual(['revision.cappedIrl'])
    expect(revisionNotes({ capped_by: 'rent_control.zone_ceiling' })).toEqual(['revision.cappedCeiling'])
    expect(revisionNotes({ capped_by: '' })).toEqual([])
  })

  it('flags a part month before a carried credit', () => {
    expect(exception({ prorated: true, carry_over_cents: -500 })).toBe('prorated')
    expect(exception({ prorated: false, carry_over_cents: -500 })).toBe('carry_over')
    expect(exception({ prorated: false, carry_over_cents: 0 })).toBe('')
  })

  it('tells a standing document from a cancelled one or a cancellation', () => {
    expect(live({ kind: 'rent_call' })).toBe(true)
    expect(live({ kind: 'rent_call', cancelled_by: 'x' })).toBe(false)
    expect(live({ kind: 'cancellation' })).toBe(false)
  })

  it('splits a payment over the oldest rent calls, never above what each owes', () => {
    const open = [
      { billing_document_id: 'feb', period: '2026-02', outstanding_cents: 30000 },
      { billing_document_id: 'jan', period: '2026-01', outstanding_cents: 10000 },
      { billing_document_id: 'paid', period: '2025-12', outstanding_cents: 0 },
    ]
    expect(split(25000, open)).toEqual([
      { billing_document_id: 'jan', amount_cents: 10000 },
      { billing_document_id: 'feb', amount_cents: 15000 },
    ])
    expect(split(99999, open).reduce((s, m) => s + (m.amount_cents ?? 0), 0)).toBe(40000)
    expect(split(0, open)).toEqual([])
  })

  it('moves a period across years', () => {
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12')
    expect(shiftPeriod('2026-12', 1)).toBe('2027-01')
    expect(shiftPeriod('2026-06', 0)).toBe('2026-06')
  })
})
