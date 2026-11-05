// An asset's layout, its rooms and their elements (RENT-INV-001 §4, S15a;
// tenure-api Q-109): read, seeded once from a template, then edited as a
// whole and saved with If-Match on its own version. Every inventory starts
// from it, so ids are kept across edits.
import { api } from '@/api/client'
import type { Schemas } from '@/api/types'

export type Layout = Schemas['inventory.LayoutView']
export type LayoutInput = Schemas['inventory.LayoutInput']
export type SeedInput = Schemas['inventory.SeedInput']
export type RoomKind = NonNullable<Schemas['inventory.RoomView']['kind']>
export type Category = NonNullable<Schemas['inventory.ElementView']['category']>

export const roomKinds: RoomKind[] = ['entry', 'living', 'kitchen', 'bedroom', 'bathroom', 'wc', 'storage', 'outside', 'garage', 'box', 'other']
export const categories: Category[] = ['floor', 'walls', 'ceiling', 'joinery', 'electrical', 'plumbing', 'heating', 'appliance', 'furniture', 'other']
export const features = ['cellar', 'garage', 'garden'] as const

// EditElement and EditRoom are what the screen edits: an id for what exists,
// a local key for the list.
export interface EditElement { key: string; id?: string; category: Category; label: string; quantity: number; installed_on: string | null }
export interface EditRoom { key: string; id?: string; kind: RoomKind; label: string; elements: EditElement[] }

let seq = 0
const key = () => `k${++seq}`

export async function getLayout(assetId: string): Promise<Layout> {
  return (await api.get<Layout>(`/assets/${assetId}/layout`)).data
}
export async function saveLayout(assetId: string, version: number, rooms: EditRoom[]): Promise<Layout> {
  return (await api.put<Layout>(`/assets/${assetId}/layout`, toInput(rooms), { ifMatch: version })).data
}
export async function seedLayout(assetId: string, input: SeedInput): Promise<Layout> {
  return (await api.post<Layout>(`/assets/${assetId}/layout/seed`, input)).data
}

// toEdit turns a layout into the rooms the screen edits.
export function toEdit(l: Layout): EditRoom[] {
  return (l.rooms ?? []).map((r) => ({
    key: key(), id: r.id, kind: (r.kind ?? 'other') as RoomKind, label: r.label ?? '',
    elements: (r.elements ?? []).map((e) => ({ key: key(), id: e.id, category: (e.category ?? 'other') as Category, label: e.label ?? '', quantity: e.quantity ?? 0, installed_on: e.installed_on ?? null })),
  }))
}

// toInput is the PUT body: the rooms in their order, ids where they exist.
export function toInput(rooms: EditRoom[]): LayoutInput {
  return {
    rooms: rooms.map((r) => ({
      id: r.id, kind: r.kind, label: r.label.trim(),
      elements: r.elements.map((e) => ({ id: e.id, category: e.category, label: e.label.trim(), quantity: e.quantity, installed_on: e.installed_on || undefined })),
    })),
  }
}

export function newRoom(): EditRoom {
  return { key: key(), kind: 'other', label: '', elements: [] }
}
export function newElement(): EditElement {
  return { key: key(), category: 'other', label: '', quantity: 0, installed_on: null }
}

// move returns list with the item at i moved by d places (bounded).
export function move<T>(list: T[], i: number, d: number): T[] {
  const j = i + d
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list
  const out = [...list]
  const [x] = out.splice(i, 1)
  out.splice(j, 0, x as T)
  return out
}

// elementCount is the number of elements across rooms.
export function elementCount(rooms: Pick<EditRoom, 'elements'>[]): number {
  return rooms.reduce((n, r) => n + r.elements.length, 0)
}
