// The billing store (RENT-FE-001 §7): monthly runs (dry run, issue), the
// billing documents of a period or a lease, cancel and reissue, arrears, and
// payments with their matches. Server data only; each write returns the
// API's answer, which the views show as it is.
import { defineStore } from 'pinia'
import { api } from '@/api/client'
import type { Page, Schemas } from '@/api/types'

export type Fee = Schemas['billing.Fee']
export type FeeLine = Schemas['billing.Line']
export type RunView = Schemas['billing.RunView']
export type BillingDoc = Schemas['billing.DocView']
export type BillingKind = NonNullable<BillingDoc['kind']>
export type CancelResult = Schemas['billing.CancelResult']
export type Arrears = Schemas['billing.ArrearsView']
export type ArrearsItem = Schemas['billing.ArrearsItem']
export type Payment = Schemas['payment.View']
export type PaymentInput = Schemas['payment.Input']
export type PaymentMethod = NonNullable<PaymentInput['method']>
export type MatchLine = Schemas['payment.MatchLine']

export const paymentMethods: PaymentMethod[] = ['transfer', 'direct_debit', 'cheque', 'cash', 'card', 'caf', 'other']

export const useBilling = defineStore('billing', () => {
  // run computes (dryRun) or issues the rent calls of period for the scope. A
  // second run of an issued period issues nothing new.
  async function run(period: string, dryRun: boolean): Promise<RunView> {
    return (await api.post<RunView>('/billing/runs', { period, dry_run: dryRun })).data
  }
  async function documents(query: { period?: string; lease_id?: string; kind?: string; page?: number; size?: number }): Promise<Page<BillingDoc>> {
    return (await api.get<Page<BillingDoc>>('/billing/documents', { query: { page: 1, size: 100, ...query } })).data
  }
  async function cancel(id: string, reason: string): Promise<CancelResult> {
    return (await api.post<CancelResult>(`/billing/documents/${id}/cancel`, { reason })).data
  }
  async function arrears(leaseId: string): Promise<Arrears> {
    return (await api.get<Arrears>(`/leases/${leaseId}/arrears`)).data
  }
  async function payments(query: { lease_id?: string; unmatched?: boolean; page?: number; size?: number } = {}): Promise<Page<Payment>> {
    return (await api.get<Page<Payment>>('/payments', { query: { page: 1, size: 50, ...query, unmatched: query.unmatched || undefined } })).data
  }
  async function payment(id: string): Promise<Payment> {
    return (await api.get<Payment>(`/payments/${id}`)).data
  }
  async function record(input: PaymentInput): Promise<Payment> {
    return (await api.post<Payment>('/payments', input)).data
  }
  async function match(id: string, matches: MatchLine[] | 'auto'): Promise<Payment> {
    const body = matches === 'auto' ? { auto: true } : { matches }
    return (await api.post<Payment>(`/payments/${id}/matches`, body)).data
  }
  // issueReceipts runs billing.receipts now for the owner's own scope; it
  // otherwise runs every hour (RENT-BE-001 §5).
  async function issueReceipts(): Promise<void> {
    await api.post('/jobs/billing.receipts/trigger', {})
  }
  return { run, documents, cancel, arrears, payments, payment, record, match, issueReceipts }
})

// feesTotal is the sum of the fees' totals, in cents.
export function feesTotal(fees: Fee[]): number {
  return fees.reduce((s, f) => s + (f.total_cents ?? 0), 0)
}

// exception says why a fee needs a look before it is issued: a part month
// (start or end of the lease) or a credit carried over; '' otherwise.
export function exception(f: Fee): 'prorated' | 'carry_over' | '' {
  if (f.prorated) return 'prorated'
  if ((f.carry_over_cents ?? 0) < 0) return 'carry_over'
  return ''
}

// live reports whether a billing document still stands: not cancelled and
// not itself a cancellation.
export function live(d: BillingDoc): boolean {
  return !d.cancelled_by && d.kind !== 'cancellation'
}

// split proposes how to apply amount to the open rent calls, oldest first,
// as the API's auto match does; it never exceeds what each call still owes.
export function split(amount: number, open: ArrearsItem[]): MatchLine[] {
  const out: MatchLine[] = []
  let left = amount
  for (const it of [...open].sort((a, b) => (a.period ?? '').localeCompare(b.period ?? ''))) {
    if (left <= 0) break
    const owe = it.outstanding_cents ?? 0
    if (owe <= 0 || !it.billing_document_id) continue
    const part = Math.min(owe, left)
    out.push({ billing_document_id: it.billing_document_id, amount_cents: part })
    left -= part
  }
  return out
}

// shiftPeriod moves a YYYY-MM period by n months.
export function shiftPeriod(period: string, n: number): string {
  const [y = 0, m = 1] = period.split('-').map(Number)
  const i = y * 12 + (m - 1) + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}
