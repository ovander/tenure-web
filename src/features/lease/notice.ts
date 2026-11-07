// The notice ending a lease (RENT-SPEC-010; tenure-api Q-118; Q-W33): the
// tenant's, received on a date, from which tenure computes the end; or the
// owner's, prepared as a CG letter for the end of the term, then recorded on
// its reception. Pure helpers are exported for the tests.
import { api, ApiError } from '@/api/client'
import type { Schemas } from '@/api/types'

export type Notice = Schemas['lease.NoticeView']
export type NoticeInput = Schemas['lease.NoticeInput']
export type NoticeResult = Schemas['lease.NoticeResult']
export type NoticeTerms = Schemas['lease.NoticeTerms']
export type LetterInput = Schemas['lease.NoticeLetterInput']
export type Letter = Schemas['lease.NoticeLetter']

// The legal lists of tenure-api's notice.reasons (loi 89-462 art. 15 I); the
// API checks them against its parameters.
export const tenantReasons = ['tense_zone', 'first_job', 'job_transfer', 'job_loss', 'new_job_after_loss', 'health', 'rsa', 'aah', 'social_housing'] as const
export const ownerReasons = ['sale', 'repossession', 'legitimate'] as const
export const relationships = ['owner', 'spouse', 'pacs_partner', 'concubin', 'ascendant', 'descendant', 'spouse_ascendant', 'spouse_descendant'] as const
export const deliveries = ['registered_letter', 'bailiff', 'hand_delivery'] as const
export const protectedAnswers = ['no', 'rehousing_offered', 'yes'] as const
export type OwnerReason = (typeof ownerReasons)[number]

// getNotice returns the lease's recorded notice, or null when none is.
export async function getNotice(lease: string): Promise<Notice | null> {
  try {
    return (await api.get<Notice>(`/leases/${lease}/notice`)).data
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}
export async function giveNotice(lease: string, input: NoticeInput): Promise<NoticeResult> {
  return (await api.post<NoticeResult>(`/leases/${lease}/notice`, input)).data
}
export async function prepareLetter(lease: string, input: LetterInput): Promise<Letter> {
  return (await api.post<Letter>(`/leases/${lease}/notice/letter`, input)).data
}

// computedNotice says the API computes the notice of a lease kind; a box,
// not under loi 89-462, keeps its end date typed by hand.
export function computedNotice(kind: string | undefined): boolean {
  return kind === 'unfurnished' || kind === 'furnished' || kind === 'mobility'
}

// ownerMayGive says the owner may give notice on a lease kind (not on a
// mobility lease, which ends at its term).
export function ownerMayGive(kind: string | undefined): boolean {
  return kind === 'unfurnished' || kind === 'furnished'
}

// letterInput is the owner's ground as the API takes it: only the fields of
// the ground chosen, trimmed.
export function letterInput(reason: OwnerReason, f: {
  priceCents?: number | null; conditions?: string; name?: string; relationship?: string; address?: string; grounds?: string; protectedTenant?: string
}, dryRun: boolean): LetterInput {
  const out: LetterInput = { reason, protected_tenant: f.protectedTenant || undefined, dry_run: dryRun }
  if (reason === 'sale') {
    out.price_cents = f.priceCents ?? undefined
    if (f.conditions?.trim()) out.conditions = f.conditions.trim()
  } else if (reason === 'repossession') {
    out.beneficiary = { name: (f.name ?? '').trim(), relationship: f.relationship ?? '', address: (f.address ?? '').trim() }
  } else {
    out.grounds = (f.grounds ?? '').trim()
  }
  return out
}
