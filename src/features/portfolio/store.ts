// The portfolio store (RENT-FE-001 §7): assets of the active scope by id, and
// their diagnostics. Server data only; every write goes through the API and
// replaces the cached row with the answer.
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api/client'
import type { Page, Schemas } from '@/api/types'

export type Asset = Schemas['portfolio.AssetView']
export type AssetInput = Schemas['portfolio.AssetInput']
export type AssetKind = Schemas['portfolio.AssetKind']
export type Diagnostic = Schemas['portfolio.DiagnosticView']
export type DiagnosticInput = Schemas['portfolio.DiagnosticInput']
export type AuditEvent = Schemas['audit.Event']

export const dwellingKinds: AssetKind[] = ['house', 'apartment']

export const useAssets = defineStore('assets', () => {
  const byId = ref<Record<string, Asset>>({})
  const diagnostics = ref<Record<string, Diagnostic[]>>({})

  function keep(a: Asset): Asset {
    if (a.id) byId.value[a.id] = a
    return a
  }

  async function list(page = 1, size = 20): Promise<Page<Asset>> {
    const p = (await api.get<Page<Asset>>('/assets', { query: { page, size } })).data
    p.items.forEach(keep)
    return p
  }

  // dwellings lists the houses and apartments a box can be attached to
  // (a handful per owner: the first 100 assets, Q-W7).
  async function dwellings(): Promise<Asset[]> {
    const p = await list(1, 100)
    return p.items.filter((a) => a.kind && dwellingKinds.includes(a.kind))
  }

  async function get(id: string): Promise<Asset> {
    return keep((await api.get<Asset>(`/assets/${id}`)).data)
  }

  async function create(input: AssetInput): Promise<Asset> {
    return keep((await api.post<Asset>('/assets', input)).data)
  }

  async function update(id: string, input: AssetInput, version: number): Promise<Asset> {
    return keep((await api.put<Asset>(`/assets/${id}`, input, { ifMatch: version })).data)
  }

  async function loadDiagnostics(assetId: string): Promise<Diagnostic[]> {
    const d = (await api.get<Diagnostic[]>(`/assets/${assetId}/diagnostics`)).data
    diagnostics.value[assetId] = d
    return d
  }

  async function saveDiagnostic(assetId: string, input: DiagnosticInput, existing?: Diagnostic): Promise<void> {
    if (existing?.id) await api.put(`/diagnostics/${existing.id}`, input, { ifMatch: existing.version })
    else await api.post(`/assets/${assetId}/diagnostics`, input)
    await loadDiagnostics(assetId)
  }

  async function activity(assetId: string): Promise<AuditEvent[]> {
    const q = { entity_type: 'asset', entity_id: assetId, page: 1, size: 50 }
    return (await api.get<Page<AuditEvent>>('/audit/events', { query: q })).data.items
  }

  return { byId, diagnostics, list, dwellings, get, create, update, loadDiagnostics, saveDiagnostic, activity }
})

// toInput turns an asset into the body of PUT /assets/{id}, shares included,
// so that saving the form never changes them (Q-W6).
export function toInput(a: Asset): AssetInput {
  return {
    kind: a.kind,
    address: a.address ?? '',
    lot: a.lot ?? '',
    surface_hundredths_m2: a.surface_hundredths_m2 ?? undefined,
    furnished: a.furnished ?? false,
    dpe_class: a.dpe_class || undefined,
    controlled_zone: a.controlled_zone ?? false,
    rent_control_zone: a.rent_control_zone ?? '',
    rent_control_category: a.rent_control_category ?? '',
    acquired_on: a.acquired_on || undefined,
    acquisition_cents: a.acquisition_cents ?? undefined,
    parent_asset_id: a.parent_asset_id || undefined,
    shares: a.shares,
  }
}

// assetLabel is how an asset is named in lists and breadcrumbs.
export function assetLabel(a: Pick<Asset, 'address' | 'lot'>): string {
  return [a.address, a.lot].filter(Boolean).join(' · ')
}
