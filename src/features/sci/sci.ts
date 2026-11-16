// The SCI at the income tax (RENT-SPEC-019, part 19; tenure-api Q-133;
// Q-W42): the SCI is an owner scope of its own, run by its managers; its
// register of associates and their dated holdings of parts, the movements
// that open and close them, and its 2072, the year's result split by the
// parts held on 31 December. A person's side: their shares of the SCIs'
// issued 2072s. The rules (the split, the blockers) are the API's; pure
// helpers are exported for the tests.
import { api } from '@/api/client'
import type { Schemas } from '@/api/types'

export type Entity = Schemas['portfolio.EntityView']
export type EntityInput = Schemas['portfolio.EntityInput']
export type Register = Schemas['sci.Register']
export type Associate = Schemas['sci.AssociateView']
export type AssociateInput = Schemas['sci.AssociateInput']
export type Holding = Schemas['sci.HoldingView']
export type Movement = Schemas['sci.MovementView']
export type MovementInput = Schemas['sci.MovementInput']
export type Year2072 = Schemas['sci.YearView']
export type Shares = Schemas['sci.SharesView']
export type Reason = NonNullable<MovementInput['reason']>
export type Blocker = 'year_open' | 'furnished_receipts' | 'register_incomplete' | 'declared'

export async function createEntity(input: EntityInput): Promise<Entity> {
  return (await api.post<Entity>('/entities', input)).data
}
export async function entity(): Promise<Entity> {
  return (await api.get<Entity>('/entity')).data
}
export async function saveEntity(version: number, input: EntityInput): Promise<Entity> {
  return (await api.put<Entity>('/entity', input, { ifMatch: version })).data
}
export async function register(on?: string): Promise<Register> {
  return (await api.get<Register>('/associates', on ? { query: { on } } : {})).data
}
export async function saveAssociate(input: AssociateInput, current?: Associate | null): Promise<Associate> {
  return current?.id
    ? (await api.put<Associate>(`/associates/${current.id}`, input, { ifMatch: current.version ?? 0 })).data
    : (await api.post<Associate>('/associates', input)).data
}
export async function movements(): Promise<Movement[]> {
  return (await api.get<Movement[]>('/sci/movements')).data
}
export async function recordMovement(input: MovementInput): Promise<Movement> {
  return (await api.post<Movement>('/sci/movements', input)).data
}
export async function year2072(year: number): Promise<Year2072> {
  return (await api.get<Year2072>('/sci/result', { query: { year } })).data
}
export async function issue2072(year: number): Promise<Year2072> {
  return (await api.post<Year2072>('/sci/declarations', { year })).data
}
export async function shares(year: number): Promise<Shares> {
  return (await api.get<Shares>('/sci/shares', { query: { year } })).data
}

// openHoldings are the holdings still held, those a transfer starts from.
export function openHoldings(associates: Associate[]): { associate: Associate; holding: Holding }[] {
  const out: { associate: Associate; holding: Holding }[] = []
  for (const a of associates) for (const h of a.holdings ?? []) if (!h.closed_on) out.push({ associate: a, holding: h })
  return out
}

// sharePercent is an associate's parts over the parts held, as « 40 % » or
// « 33,33 % », computed on integers (basis points, truncated), never through a
// float; '—' when nobody holds a part.
export function sharePercent(parts: number | undefined, total: number | undefined): string {
  if (!parts || !total) return '—'
  const bp = Math.trunc((parts * 10_000) / total)
  const int = Math.trunc(bp / 100)
  const dec = String(bp % 100).padStart(2, '0').replace(/0+$/, '')
  return `${int}${dec ? `,${dec}` : ''} %`
}

// nineDigits checks a SIREN's form (nine digits, spaces allowed), the API
// checking it again.
export function nineDigits(siren: string): boolean {
  return /^\d{9}$/.test(siren.replace(/\s/g, ''))
}
