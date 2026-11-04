// The lease store (RENT-FE-001 §7): leases of the scope by id, their
// blockers, guarantees, generated documents and inventories, and the
// tenants they name. Server data only; each write replaces the cached rows
// with the API's answer.
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api/client'
import type { Page, Schemas } from '@/api/types'

export type Lease = Schemas['lease.View']
export type LeaseInput = Schemas['lease.Input']
export type LeaseKind = Schemas['lease.Kind']
export type LeaseState = Schemas['lease.State']
export type Action = Schemas['lease.Action']
export type Blockers = Schemas['lease.BlockersView']
export type Blocker = Schemas['lease.Blocker']
export type Guarantee = Schemas['lease.GuaranteeView']
export type GuaranteeInput = Schemas['lease.GuaranteeInput']
export type GuaranteeKind = Schemas['lease.GuaranteeKind']
export type LeaseDocument = Schemas['lease.DocumentView']
export type Inventory = Schemas['lease.InventoryView']
export type InventoryInput = Schemas['lease.InventoryInput']
export type Tenant = Schemas['portfolio.TenantView']
export type TenantInput = Schemas['portfolio.TenantInput']
export type DocumentMeta = Schemas['document.View']
export type DocumentLink = Schemas['document.Link']

// Guarantor is the guarantor object of a guarantee (tenure-api
// lease.Guarantor): who stands behind a surety, Visale's visa, the insurer.
export interface Guarantor {
  name?: string
  address?: string
  legal_person?: boolean
  solidary?: boolean
  visa_number?: string
  insurer?: string
  policy?: string
}

// The special clauses a contract may carry (tenure-api lease.VettedClauses);
// their French text is in the contract template.
export const vettedClauses = ['boiler_servicing', 'chimney_sweeping', 'garden_upkeep', 'insurance_certificate'] as const

export const mobilityReasons = [
  'vocational_training', 'higher_education', 'apprenticeship', 'internship', 'civic_service', 'job_transfer', 'temporary_assignment',
] as const

// nextActions is the lifecycle of tenure-api internal/lease/state.go.
export const nextActions: Record<LeaseState, Action[]> = {
  draft: ['activate'],
  active: ['notice'],
  notice: ['end'],
  ended: ['close'],
  closed: [],
}

export const useLeases = defineStore('leases', () => {
  const byId = ref<Record<string, Lease>>({})
  const tenants = ref<Record<string, Tenant>>({})

  function keep(l: Lease): Lease {
    if (l.id) byId.value[l.id] = l
    return l
  }

  async function list(query: { asset_id?: string; state?: string; page?: number; size?: number } = {}): Promise<Page<Lease>> {
    const p = (await api.get<Page<Lease>>('/leases', { query: { page: 1, size: 50, ...query } })).data
    p.items.forEach(keep)
    return p
  }
  async function get(id: string): Promise<Lease> {
    return keep((await api.get<Lease>(`/leases/${id}`)).data)
  }
  async function create(input: LeaseInput): Promise<Lease> {
    return keep((await api.post<Lease>('/leases', input)).data)
  }
  async function update(id: string, input: LeaseInput, version: number): Promise<Lease> {
    return keep((await api.put<Lease>(`/leases/${id}`, input, { ifMatch: version })).data)
  }
  async function transition(id: string, action: Action, endOn?: string): Promise<Lease> {
    return keep((await api.post<Lease>(`/leases/${id}/transitions`, { action, end_on: endOn })).data)
  }
  async function blockers(id: string): Promise<Blockers> {
    return (await api.get<Blockers>(`/leases/${id}/blockers`)).data
  }
  async function generateContract(id: string): Promise<LeaseDocument> {
    return (await api.post<LeaseDocument>(`/leases/${id}/contract`)).data
  }
  async function documents(id: string): Promise<LeaseDocument[]> {
    return (await api.get<LeaseDocument[]>(`/leases/${id}/documents`)).data
  }
  async function guarantees(id: string): Promise<Guarantee[]> {
    return (await api.get<Guarantee[]>(`/leases/${id}/guarantees`)).data
  }
  async function saveGuarantee(leaseId: string, input: GuaranteeInput, existing?: Guarantee): Promise<Guarantee> {
    if (existing?.id) return (await api.put<Guarantee>(`/guarantees/${existing.id}`, input, { ifMatch: existing.version })).data
    return (await api.post<Guarantee>(`/leases/${leaseId}/guarantees`, input)).data
  }
  async function guaranteeDocument(id: string): Promise<LeaseDocument> {
    return (await api.post<LeaseDocument>(`/guarantees/${id}/document`)).data
  }
  async function inventories(id: string): Promise<Inventory[]> {
    return (await api.get<Inventory[]>(`/leases/${id}/inventories`)).data
  }
  async function recordInventory(id: string, input: InventoryInput): Promise<Inventory> {
    return (await api.post<Inventory>(`/leases/${id}/inventories`, input)).data
  }

  // upload sends a file to the archive (scanned, sniffed, 25 MB) linked to
  // the lease; signs names the generated document it is the signed copy of.
  async function upload(leaseClass: string, lease: Lease, file: File, signs?: string): Promise<DocumentMeta> {
    return (
      await api.upload<DocumentMeta>('/documents', { class: leaseClass, lease_id: lease.id, asset_id: lease.asset_ids?.[0], signs_document_id: signs }, file)
    ).data
  }
  async function uploads(leaseId: string): Promise<DocumentMeta[]> {
    return (await api.get<Page<DocumentMeta>>('/documents', { query: { lease_id: leaseId, page: 1, size: 100 } })).data.items
  }

  async function loadTenants(): Promise<Tenant[]> {
    const p = (await api.get<Page<Tenant>>('/tenants', { query: { page: 1, size: 100 } })).data
    for (const x of p.items) if (x.id) tenants.value[x.id] = x
    return p.items
  }
  // updateTenant corrects a tenant (names, contact, language, occupation)
  // with If-Match on its version.
  async function updateTenant(id: string, input: TenantInput, version: number): Promise<Tenant> {
    const x = (await api.put<Tenant>(`/tenants/${id}`, input, { ifMatch: version })).data
    if (x.id) tenants.value[x.id] = x
    return x
  }
  async function createTenant(input: TenantInput): Promise<Tenant> {
    const x = (await api.post<Tenant>('/tenants', input)).data
    if (x.id) tenants.value[x.id] = x
    return x
  }

  return {
    byId, tenants, list, get, create, update, transition, blockers, generateContract, documents, guarantees, saveGuarantee,
    guaranteeDocument, inventories, recordInventory, upload, uploads, loadTenants, createTenant, updateTenant,
  }
})

// download opens a document through its 10-minute signed link (the download
// is recorded server-side as document.download).
export async function download(documentId: string): Promise<void> {
  const link = (await api.get<DocumentLink>(`/documents/${documentId}/content`)).data
  if (link.url) window.open(link.url, '_blank', 'noopener')
}

// toLeaseInput turns a lease into the body of PUT /leases/{id}.
export function toLeaseInput(l: Lease): LeaseInput {
  return {
    kind: l.kind, asset_ids: l.asset_ids ?? [], tenants: l.tenants ?? [], start_on: l.start_on, end_on: l.end_on || undefined,
    term_months: l.term_months, rent_cents: l.rent_cents, provision_cents: l.provision_cents, deposit_cents: l.deposit_cents,
    due_day: l.due_day, irl_ref_quarter: l.irl_ref_quarter, irl_ref_value: l.irl_ref_value, revision_month: l.revision_month,
    mobility_reason: l.mobility_reason || undefined, rent_breakdown: l.rent_breakdown?.length ? l.rent_breakdown : undefined,
    rent_exemption: l.rent_exemption || undefined, clauses: l.clauses ?? [],
  }
}

// tenantName is how a tenant is named: their names joined.
export function tenantName(t: Pick<Tenant, 'names'> | undefined): string {
  return (t?.names ?? []).join(', ')
}

// guarantorOf reads a guarantee's guarantor object.
export function guarantorOf(g: Pick<Guarantee, 'guarantor'>): Guarantor {
  return (g.guarantor ?? {}) as Guarantor
}
