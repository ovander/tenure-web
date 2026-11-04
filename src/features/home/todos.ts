// What S01 Home lists (RENT-FE-001 §1 « Blocked, not surprised », §3 S01):
// to-dos built from what the API already serves (arrears, blockers, unmatched
// payments, this month's rent calls) and the next dates read from the leases
// themselves. Pure functions: the view loads the data and passes today.
import type { Key } from '@/i18n'
import type { Arrears, BillingDoc, Payment } from '@/features/billing/store'
import type { Blockers, Lease } from '@/features/lease/store'

export type Severity = 'error' | 'warn' | 'info'

export interface Todo {
  id: string
  severity: Severity
  key: Key
  params: Record<string, string | number>
  to: string
  leaseId?: string
}

export interface TodoInput {
  leases: Lease[]
  blockers: Record<string, Blockers>
  arrears: Record<string, Arrears>
  unmatched: Payment[]
  // the scope's billing documents of the period
  billed: BillingDoc[]
  period: string
  label: (l: Lease) => string
  money: (cents: number) => string
  month: (period: string) => string
}

const order = ['arrears', 'blocked', 'warning', 'unmatched', 'billing']
const rank = (x: Todo) => order.indexOf(x.id.split('-')[0] ?? '')

// dueIn lists the leases a rent call is due for in the period: running
// (active or under notice), started by its last day, not ended before its
// first.
export function dueIn(leases: Lease[], period: string): Lease[] {
  const first = `${period}-01`
  const last = `${period}-${String(daysInMonth(period)).padStart(2, '0')}`
  return leases.filter((l) => (l.state === 'active' || l.state === 'notice') && (l.start_on ?? '') <= last && (!l.end_on || l.end_on >= first))
}

// todos builds the home list, most urgent kind first (then in lease order): overdue arrears, draft
// leases blocked before their contract or activation, warnings on running
// leases, payments to match, rent calls of the month still to issue.
export function todos(x: TodoInput): Todo[] {
  const out: Todo[] = []
  for (const l of x.leases) {
    const id = l.id ?? ''
    const a = x.arrears[id]
    if (a && (a.overdue_cents ?? 0) > 0)
      out.push({ id: `arrears-${id}`, severity: 'error', key: 'todo.arrears', leaseId: id, to: `/leases/${id}/billing`,
        params: { lease: x.label(l), overdue: x.money(a.overdue_cents ?? 0), outstanding: x.money(a.outstanding_cents ?? 0) } })
    const b = x.blockers[id]
    if (!b) continue
    const blocking = [...(b.generation ?? []), ...(b.activation ?? [])]
    if (l.state === 'draft' && blocking.length)
      out.push({ id: `blocked-${id}`, severity: 'warn', key: 'todo.blocked', leaseId: id, to: `/leases/${id}/contract`,
        params: { lease: x.label(l), n: blocking.length, first: blocking[0]?.title ?? '' } })
    for (const [i, w] of (b.warnings ?? []).entries())
      out.push({ id: `warning-${id}-${i}`, severity: 'warn', key: 'todo.warning', leaseId: id, to: `/leases/${id}/overview`,
        params: { lease: x.label(l), title: w.title ?? '' } })
  }
  const open = x.unmatched.filter((p) => (p.unmatched_cents ?? 0) > 0)
  if (open.length)
    out.push({ id: 'unmatched', severity: 'warn', key: 'todo.unmatched', to: '/billing/payments?unmatched=1',
      params: { n: open.length, amount: x.money(open.reduce((s, p) => s + (p.unmatched_cents ?? 0), 0)) } })
  const called = new Set(x.billed.filter((d) => d.kind === 'rent_call' && d.period === x.period && !d.cancelled_by).map((d) => d.lease_id))
  const missing = dueIn(x.leases, x.period).filter((l) => !called.has(l.id))
  if (missing.length)
    out.push({ id: 'billing', severity: 'info', key: 'todo.billing', to: `/billing/${x.period}`, params: { n: missing.length, month: x.month(x.period) } })
  return out.sort((p, q) => rank(p) - rank(q))
}

export type NextKind = 'notice_end' | 'term_end' | 'revision'

export interface NextDate {
  on: string
  kind: NextKind
  lease: Lease
}

// nextDates lists the leases' next dates from today on, soonest first: the
// end of a notice, the end of the current term (renewed tacitly, except a
// mobility lease, which ends), the month of the next IRL revision. Only what
// the lease itself states: no legal delay is added here.
export function nextDates(leases: Lease[], today: string, limit = 6): NextDate[] {
  const out: NextDate[] = []
  const month = today.slice(0, 7)
  for (const l of leases) {
    if (l.state === 'notice' && l.end_on && l.end_on >= today) out.push({ on: l.end_on, kind: 'notice_end', lease: l })
    if (l.state !== 'active' || !l.start_on) continue
    const term = l.term_months ?? 0
    if (term > 0) {
      let k = 1
      let end = termEnd(l.start_on, term * k)
      while (end < today && l.kind !== 'mobility' && k < 100) end = termEnd(l.start_on, term * ++k)
      if (end >= today) out.push({ on: end, kind: 'term_end', lease: l })
    }
    const rm = l.revision_month ?? 0
    if (l.irl_ref_quarter && rm >= 1 && rm <= 12) {
      let y = Number(month.slice(0, 4))
      if (rm < Number(month.slice(5, 7))) y++
      let on = `${y}-${String(rm).padStart(2, '0')}-01`
      if (on <= l.start_on) on = `${y + 1}-${String(rm).padStart(2, '0')}-01`
      out.push({ on, kind: 'revision', lease: l })
    }
  }
  return out.sort((a, b) => a.on.localeCompare(b.on)).slice(0, limit)
}

// termEnd is the last day of a term of n months from start: the day before
// the same day n months later (or the month's last day when it has none).
export function termEnd(start: string, months: number): string {
  const [y = 0, m = 1, d = 1] = start.split('-').map(Number)
  const total = (m - 1) + months
  const ty = y + Math.floor(total / 12)
  const tm = (total % 12) + 1
  const day = Math.min(d, daysInMonth(`${ty}-${String(tm).padStart(2, '0')}`))
  const t = new Date(Date.UTC(ty, tm - 1, day) - 86400000)
  return t.toISOString().slice(0, 10)
}

function daysInMonth(period: string): number {
  const [y = 0, m = 1] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
