import { describe, expect, it } from 'vitest'
import { dueIn, nextDates, termEnd, todos, type TodoInput } from './todos'
import type { Lease } from '@/features/lease/store'

const lease = (x: Partial<Lease>): Lease => ({ id: 'l1', kind: 'unfurnished', state: 'active', start_on: '2026-01-01', term_months: 36, asset_ids: ['a1'], ...x })
const base = (x: Partial<TodoInput> = {}): TodoInput => ({
  leases: [], blockers: {}, arrears: {}, unmatched: [], billed: [], period: '2026-11',
  label: (l) => `bail ${l.id}`, money: (c) => `${c} c`, month: (p) => `mois ${p}`, ...x,
})

describe('todos', () => {
  it('is empty when nothing needs attention', () => {
    const l = lease({})
    const out = todos(base({ leases: [l], billed: [{ kind: 'rent_call', lease_id: 'l1', period: '2026-11' }], arrears: { l1: { outstanding_cents: 500, overdue_cents: 0 } } }))
    expect(out).toEqual([])
  })

  it('lists overdue arrears first, then blockers and warnings, payments, and the month to bill', () => {
    const draft = lease({ id: 'd1', state: 'draft' })
    const run = lease({ id: 'l1' })
    const out = todos(base({
      leases: [draft, run],
      blockers: {
        d1: { generation: [{ type: 'lease/diagnostic-missing', title: 'DPE manquant' }], activation: [{ type: 'lease/contract-missing', title: 'Contrat' }], warnings: [] },
        l1: { generation: [], activation: [], warnings: [{ type: 'lease/diagnostic-expiring', title: 'DPE bientôt expiré' }] },
      },
      arrears: { l1: { outstanding_cents: 85000, overdue_cents: 80000 } },
      unmatched: [{ id: 'p1', unmatched_cents: 1200 }, { id: 'p2', unmatched_cents: 300 }, { id: 'p3', unmatched_cents: 0 }],
    }))
    expect(out.map((x) => x.id)).toEqual(['arrears-l1', 'blocked-d1', 'warning-l1-0', 'unmatched', 'billing'])
    expect(out[0]).toMatchObject({ severity: 'error', to: '/leases/l1/billing', params: { overdue: '80000 c', outstanding: '85000 c' } })
    expect(out[1]).toMatchObject({ to: '/leases/d1/contract', params: { n: 2, first: 'DPE manquant' } })
    // With a namer, the blocker says what it is about.
    const named = todos(base({ leases: [draft], blockers: { d1: { generation: [{ title: 'DPE manquant', asset_id: 'a1', diagnostic: 'dpe' }], activation: [], warnings: [] } },
      named: (b) => `${b.title} — ${b.diagnostic} · ${b.asset_id}` }))
    expect(named[0]?.params.first).toBe('DPE manquant — dpe · a1')
    expect(out[3]?.params).toEqual({ n: 2, amount: '1500 c' })
    expect(out[4]).toMatchObject({ to: '/billing/2026-11', params: { n: 1, month: 'mois 2026-11' } })
  })

  it('counts a cancelled rent call as not issued, and ignores blockers of running leases', () => {
    const out = todos(base({
      leases: [lease({})],
      blockers: { l1: { generation: [{ title: 'x' }], activation: [], warnings: [] } },
      billed: [{ kind: 'rent_call', lease_id: 'l1', period: '2026-11', cancelled_by: 'c1' }, { kind: 'receipt', lease_id: 'l1', period: '2026-11' }],
    }))
    expect(out.map((x) => x.id)).toEqual(['billing'])
  })
})

describe('dueIn', () => {
  it('keeps running leases that overlap the period', () => {
    const ls = [
      lease({ id: 'a' }), lease({ id: 'b', state: 'notice', end_on: '2026-11-15' }), lease({ id: 'c', state: 'notice', end_on: '2026-10-31' }),
      lease({ id: 'd', start_on: '2026-12-01' }), lease({ id: 'e', state: 'draft' }), lease({ id: 'f', start_on: '2026-11-30' }),
    ]
    expect(dueIn(ls, '2026-11').map((l) => l.id)).toEqual(['a', 'b', 'f'])
  })
})

describe('termEnd', () => {
  it('is the day before the same day n months later', () => {
    expect(termEnd('2026-01-01', 36)).toBe('2028-12-31')
    expect(termEnd('2026-03-15', 12)).toBe('2027-03-14')
    expect(termEnd('2026-11-01', 2)).toBe('2026-12-31')
  })
})

describe('nextDates', () => {
  it('lists notice ends, term ends (tacitly renewed) and revision months, soonest first', () => {
    const out = nextDates([
      lease({ id: 'n', state: 'notice', end_on: '2027-01-31' }),
      lease({ id: 'r', start_on: '2020-02-01', term_months: 36, irl_ref_quarter: '2025-Q4', revision_month: 2 }),
      lease({ id: 'm', kind: 'mobility', start_on: '2026-03-01', term_months: 6 }),
      lease({ id: 'x', state: 'draft', start_on: '2026-12-01' }),
    ], '2026-11-04')
    expect(out.map((d) => `${d.kind}:${d.lease.id}:${d.on}`)).toEqual([
      'notice_end:n:2027-01-31', 'revision:r:2027-02-01', 'term_end:r:2029-01-31',
    ])
  })

  it('puts this month’s revision in, and never a revision before the lease starts', () => {
    const out = nextDates([
      lease({ id: 'a', irl_ref_quarter: 'q', revision_month: 11, start_on: '2025-11-01', term_months: 0 }),
      lease({ id: 'b', irl_ref_quarter: 'q', revision_month: 12, start_on: '2026-12-01', term_months: 0 }),
    ], '2026-11-04')
    expect(out.map((d) => `${d.lease.id}:${d.on}`)).toEqual(['a:2026-11-01', 'b:2027-12-01'])
  })
})
