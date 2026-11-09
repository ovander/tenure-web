// The recovery of a lease's unpaid rent (RENT-SPEC-011; tenure-api Q-121,
// Q-122; Q-W36): the escalation computed by the API (formal notice, surety
// informed, insurer's claim, commandement de payer, its notice to the
// surety, court), its MD and IC letters, the steps recorded, and the
// payment plan that suspends it while respected. Pure helpers are exported
// for the tests.
import { api } from '@/api/client'
import type { Schemas } from '@/api/types'

export type Recovery = Schemas['billing.RecoveryResult']
export type NextStep = Schemas['billing.NextStep']
export type Step = Schemas['billing.RecoveryStep']
export type Letter = Schemas['billing.RecoveryLetter']
export type PlanState = Schemas['billing.PlanState']
export type Instalment = Schemas['billing.Instalment']
export type StepInput = Schemas['billing.RecoveryStepInput']

export const stepKinds = ['formal_notice', 'surety_notice', 'insurance_claim', 'commandement', 'surety_commandement', 'court'] as const
export type StepKind = (typeof stepKinds)[number]
export const deliveries = ['registered_letter', 'bailiff', 'hand_delivery', 'email'] as const

export async function getRecovery(lease: string): Promise<Recovery> {
  return (await api.get<Recovery>(`/leases/${lease}/recovery`)).data
}
export async function prepareLetter(lease: string, kind: 'formal_notice' | 'surety_notice', guaranteeId?: string): Promise<Letter> {
  return (await api.post<Letter>(`/leases/${lease}/recovery/letter`, { kind, guarantee_id: guaranteeId })).data
}
export async function recordStep(lease: string, input: StepInput): Promise<Recovery> {
  return (await api.post<Recovery>(`/leases/${lease}/recovery/steps`, input)).data
}
export async function recordPlan(lease: string, input: { agreed_on: string; instalments: Instalment[]; dry_run?: boolean }): Promise<Recovery> {
  return (await api.post<Recovery>(`/leases/${lease}/recovery/plans`, input)).data
}
export async function cancelPlan(lease: string, plan: PlanState, cancelledOn: string): Promise<Recovery> {
  return (await api.post<Recovery>(`/leases/${lease}/recovery/plans/${plan.id}/cancel`, { cancelled_on: cancelledOn, version: plan.version })).data
}

// hasLetter says a step is recorded on a letter tenure prepares (MD, IC).
export function hasLetter(kind: string | undefined): kind is 'formal_notice' | 'surety_notice' {
  return kind === 'formal_notice' || kind === 'surety_notice'
}

// addMonths adds months to a YYYY-MM-DD day, clamped to the month's last day.
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const first = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  first.setUTCDate(Math.min(d, last))
  return first.toISOString().slice(0, 10)
}

// splitDebt spreads a debt in cents over n monthly instalments from first:
// equal shares rounded down, the remainder on the last, so they add up to
// the debt exactly.
export function splitDebt(debtCents: number, n: number, first: string): Instalment[] {
  if (n <= 0 || debtCents <= 0) return []
  const share = Math.floor(debtCents / n)
  return Array.from({ length: n }, (_, i) => ({
    due_on: addMonths(first, i),
    amount_cents: i === n - 1 ? debtCents - share * (n - 1) : share,
  }))
}

// overdueDebt is what the overdue calls owe: the debt a plan must cover.
export function overdueDebt(r: Pick<Recovery, 'arrears'>): number {
  return r.arrears?.overdue_cents ?? 0
}
