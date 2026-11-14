// Maintenance and incidents (RENT-SPEC-015; tenure-api Q-130, Q-131;
// Q-W40): the owner's contractors, the incidents followed from report to
// invoice, and the recurring maintenance (boiler, chimney) with its visits.
// A repair's invoice becomes a deductible repairs charge; an improvement's
// is capitalised on the asset and never deducted. Pure helpers are exported
// for the tests.
import { api } from '@/api/client'
import type { Schemas } from '@/api/types'
import type { DocumentMeta } from '@/features/lease/store'

export type Contractor = Schemas['maintenance.Contractor']
export type ContractorInput = Schemas['maintenance.ContractorInput']
export type Incident = Schemas['maintenance.Incident']
export type IncidentInput = Schemas['maintenance.IncidentInput']
export type Transition = Schemas['maintenance.TransitionInput']
export type Action = NonNullable<Transition['action']>
export type Status = NonNullable<Incident['status']>
export type Contract = Schemas['maintenance.Contract']
export type ContractInput = Schemas['maintenance.ContractInput']
export type VisitInput = Schemas['maintenance.VisitInput']

export async function contractors(): Promise<Contractor[]> {
  return (await api.get<Contractor[]>('/contractors')).data
}
export async function saveContractor(input: ContractorInput, current?: Contractor | null): Promise<Contractor> {
  return current?.id
    ? (await api.put<Contractor>(`/contractors/${current.id}`, input, { ifMatch: current.version ?? 0 })).data
    : (await api.post<Contractor>('/contractors', input)).data
}

export async function incidents(query: { asset_id?: string; status?: Status; open?: boolean } = {}): Promise<Incident[]> {
  return (await api.get<Incident[]>('/incidents', { query: { ...query, open: query.open ? 'true' : undefined } })).data
}
export async function saveIncident(input: IncidentInput, current?: Incident | null): Promise<Incident> {
  return current?.id
    ? (await api.put<Incident>(`/incidents/${current.id}`, input, { ifMatch: current.version ?? 0 })).data
    : (await api.post<Incident>('/incidents', input)).data
}
export async function transition(i: Incident, body: Transition): Promise<Incident> {
  return (await api.post<Incident>(`/incidents/${i.id}/transitions`, body, { ifMatch: i.version ?? 0 })).data
}

export async function contracts(assetId?: string): Promise<Contract[]> {
  return (await api.get<Contract[]>('/maintenance-contracts', { query: { asset_id: assetId } })).data
}
export async function contract(id: string): Promise<Contract> {
  return (await api.get<Contract>(`/maintenance-contracts/${id}`)).data
}
export async function saveContract(input: ContractInput, current?: Contract | null): Promise<Contract> {
  return current?.id
    ? (await api.put<Contract>(`/maintenance-contracts/${current.id}`, input, { ifMatch: current.version ?? 0 })).data
    : (await api.post<Contract>('/maintenance-contracts', input)).data
}
export async function recordVisit(c: Contract, body: VisitInput): Promise<Contract> {
  return (await api.post<Contract>(`/maintenance-contracts/${c.id}/visits`, body, { ifMatch: c.version ?? 0 })).data
}

// uploadSupporting files a quote, an invoice, a photo or a certificate as a
// supporting document of the asset, scanned by the API.
export async function uploadSupporting(assetId: string, file: File): Promise<string> {
  return (await api.upload<DocumentMeta>('/documents', { class: 'supporting', asset_id: assetId }, file)).data.id ?? ''
}

// actions lists what an incident in a status can do next, as the API's
// machine allows (tenure-api internal/maintenance/machine.go).
export function actions(s: Status | undefined): Action[] {
  switch (s) {
    case 'new':
    case 'quoted':
      return ['quote', 'schedule', 'cancel']
    case 'scheduled':
      return ['schedule', 'done', 'cancel']
    case 'done':
      return ['invoice']
    default:
      return []
  }
}

// editable says the report can still change: the works are not done.
export function editable(s: Status | undefined): boolean {
  return s === 'new' || s === 'quoted' || s === 'scheduled'
}

// open says the incident still needs something: neither invoiced nor
// cancelled.
export function isOpen(s: Status | undefined): boolean {
  return s !== 'invoiced' && s !== 'cancelled'
}

// statusSeverity is the tag colour of a status.
export function statusSeverity(s: Status | undefined): 'secondary' | 'info' | 'warn' | 'success' | 'danger' {
  switch (s) {
    case 'new':
      return 'warn'
    case 'quoted':
    case 'scheduled':
      return 'info'
    case 'done':
      return 'warn'
    case 'invoiced':
      return 'success'
    default:
      return 'secondary'
  }
}

// dueState says where a contract's next visit stands against today (ISO
// days compare as strings): overdue, due within the next 30 days, later, or
// none once the contract has ended.
export function dueState(c: Pick<Contract, 'next_due_on'>, today: string): 'overdue' | 'soon' | 'later' | 'none' {
  const d = c.next_due_on
  if (!d) return 'none'
  if (d < today) return 'overdue'
  const soon = new Date(`${today}T00:00:00Z`)
  soon.setUTCDate(soon.getUTCDate() + 30)
  return d <= soon.toISOString().slice(0, 10) ? 'soon' : 'later'
}
