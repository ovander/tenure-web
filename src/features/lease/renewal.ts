// The re-evaluation of an unfurnished lease's rent at its renewal
// (RENT-SPEC-010; tenure-api Q-120; Q-W35): the owner's proposal and its
// references, prepared as a PR letter, then its reception, the tenant's
// answer and the yearly steps applied to the rent. Pure helpers are exported
// for the tests.
import { api } from '@/api/client'
import type { Schemas } from '@/api/types'

export type Renewal = Schemas['lease.RenewalView']
export type RenewalLetter = Schemas['lease.RenewalLetter']
export type RenewalTerms = Schemas['lease.ReevaluationTerms']
export type Reference = Schemas['lease.Reference']
export type StepsResult = Schemas['lease.StepsResult']
export type LetterInput = Schemas['lease.RenewalLetterInput']

export async function getRenewals(lease: string): Promise<Renewal[]> {
  return (await api.get<Renewal[]>(`/leases/${lease}/renewals`)).data
}
export async function prepareRenewal(lease: string, input: LetterInput): Promise<RenewalLetter> {
  return (await api.post<RenewalLetter>(`/leases/${lease}/renewal/letter`, input)).data
}
export async function recordReception(lease: string, r: Renewal, input: { received_on: string; delivery: string; tracking_ref?: string }): Promise<Renewal> {
  return (await api.post<Renewal>(`/leases/${lease}/renewals/${r.id}/reception`, { ...input, version: r.version })).data
}
export async function recordAnswer(lease: string, r: Renewal, input: { answer: string; answered_on: string }): Promise<Renewal> {
  return (await api.post<Renewal>(`/leases/${lease}/renewals/${r.id}/answer`, { ...input, version: r.version })).data
}
export async function applySteps(lease: string, r: Renewal): Promise<StepsResult> {
  return (await api.post<StepsResult>(`/leases/${lease}/renewals/${r.id}/steps`, { version: r.version })).data
}

// mayReevaluate says a lease's rent may be re-evaluated at renewal: an
// unfurnished lease, active, with no end set.
export function mayReevaluate(l: { kind?: string; state?: string; end_on?: string }): boolean {
  return l.kind === 'unfurnished' && l.state === 'active' && !l.end_on
}

// A reference row as typed: the rent in cents, or null while empty.
export interface ReferenceRow { address: string; description: string; rentCents: number | null | undefined }

// references keeps the rows the owner filled in, trimmed; a row with only
// one of its address and rent is incomplete.
export function references(rows: ReferenceRow[]): { refs: Reference[]; incomplete: boolean } {
  const refs: Reference[] = []
  let incomplete = false
  for (const r of rows) {
    const address = r.address.trim()
    const rent = r.rentCents ?? 0
    if (!address && !rent) continue
    if (!address || rent <= 0) {
      incomplete = true
      continue
    }
    const d = r.description.trim()
    refs.push(d ? { address, description: d, rent_cents: rent } : { address, rent_cents: rent })
  }
  return { refs, incomplete }
}

// stepState marks each step of a schedule applied, due or upcoming, from
// the count applied and how many are due.
export function stepState(r: Pick<Renewal, 'steps_applied' | 'steps_due'>, i: number): 'applied' | 'due' | 'upcoming' {
  const applied = r.steps_applied ?? 0
  if (i < applied) return 'applied'
  return i < applied + (r.steps_due ?? 0) ? 'due' : 'upcoming'
}
