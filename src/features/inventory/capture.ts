// An inventory captured in Tenure (RENT-INV-001 §5, §8, S15b; tenure-api
// Q-111): read as a whole, each item saved on its own with If-Match on its
// version, the header, meters and keys with If-Match on the inventory's
// version, transitions with a dry run, photos uploaded one by one after a
// resize on the device.
import { api } from '@/api/client'
import type { Schemas } from '@/api/types'

export type Capture = Schemas['inventory.CaptureView']
export type CaptureRoom = Schemas['inventory.CaptureRoom']
export type Item = Schemas['inventory.ItemView']
export type ItemInput = Schemas['inventory.ItemInput']
export type HeaderInput = Schemas['inventory.HeaderInput']
export type MeterInput = Schemas['inventory.MeterInput']
export type KeyLine = Schemas['inventory.KeyView']
export type Check = Schemas['inventory.Check']
export type Condition = Schemas['inventory.Condition']
export type Works = Schemas['inventory.Works']
export type Photo = Schemas['inventory.PhotoView']
export type Action = 'schedule' | 'start' | 'complete' | 'reopen' | 'issue'
export interface TransitionResult {
  action: Action
  allowed: boolean
  checks: Schemas['inventory.Checks']
}

// The scale, best first (INV-OD-04), and what works applies to.
export const conditions: Condition[] = ['new', 'good', 'fair', 'poor', 'broken']
export const worksValues: Works[] = ['ok', 'ko', 'n/a']
export const meterKinds = ['elec_base', 'elec_peak', 'elec_offpeak', 'gas', 'water_cold', 'water_hot', 'heating_energy'] as const
export const keyKinds = ['key', 'badge', 'remote', 'card', 'code'] as const
export function hasWorks(category: string | undefined): boolean {
  return category === 'appliance' || category === 'electrical' || category === 'plumbing'
}

export async function getCapture(id: string): Promise<Capture> {
  return (await api.get<Capture>(`/inventories/${id}`)).data
}
export async function saveHeader(id: string, version: number, input: HeaderInput): Promise<Capture> {
  return (await api.put<Capture>(`/inventories/${id}`, input, { ifMatch: version })).data
}
export async function saveItem(id: string, item: Item, input: ItemInput): Promise<Item> {
  return (await api.put<Item>(`/inventories/${id}/items/${item.id}`, input, { ifMatch: item.version ?? 0 })).data
}
export async function addItem(id: string, input: Schemas['inventory.NewItemInput']): Promise<Item> {
  return (await api.post<Item>(`/inventories/${id}/items`, input)).data
}
export async function saveMeters(id: string, version: number, meters: MeterInput[]): Promise<Capture> {
  return (await api.put<Capture>(`/inventories/${id}/meters`, { meters }, { ifMatch: version })).data
}
export async function saveKeys(id: string, version: number, keys: KeyLine[]): Promise<Capture> {
  return (await api.put<Capture>(`/inventories/${id}/keys`, { keys }, { ifMatch: version })).data
}
export async function transition(id: string, action: Action, extra: { scheduled_at?: string; place?: string } = {}): Promise<Capture> {
  return (await api.post<Capture>(`/inventories/${id}/transitions`, { action, ...extra })).data
}
export async function dryRun(id: string, action: Action): Promise<TransitionResult> {
  return (await api.post<TransitionResult>(`/inventories/${id}/transitions`, { action, dry_run: true })).data
}
export async function uploadPhoto(id: string, target: { item_id?: string; meter_id?: string }, file: File): Promise<Photo> {
  return (await api.upload<Photo>(`/inventories/${id}/photos`, target, file)).data
}
// photoLink is a 10-minute signed link to a photo, shown inline.
export async function photoLink(id: string, photo: string): Promise<{ url: string; expires_at: string }> {
  return (await api.get<{ url: string; expires_at: string }>(`/inventories/${id}/photos/${photo}/content`)).data
}

// What each state lets the owner change (tenure-api Q-111).
export function headerEditable(state: Capture['state']): boolean {
  return state === 'draft' || state === 'scheduled' || state === 'in_progress'
}
export function itemsEditable(state: Capture['state']): boolean {
  return state === 'draft' || state === 'in_progress'
}

// progress is how many items of a room are assessed on the scale.
export function progress(room: Pick<CaptureRoom, 'items'>): { done: number; total: number } {
  const items = room.items ?? []
  return { done: items.filter((i) => !!i.condition).length, total: items.length }
}

// blocking lists the checks of a stage that block it.
// fresher says a capture read back from the server may replace what the
// screen holds: not when a save answered with a newer version meanwhile (a
// checks refresh that started before the save committed). Versions only grow.
export function fresher(held: Pick<Capture, 'version'>, read: Pick<Capture, 'version'>): boolean {
  return (read.version ?? 0) >= (held.version ?? 0)
}

export function blocking(c: Pick<Capture, 'checks'>, stage: 'complete' | 'issue'): Check[] {
  return (c.checks?.blocking ?? []).filter((x) => stage === 'issue' || x.stage === stage)
}

// fitSize is the size of a w×h image whose long side is at most max.
export function fitSize(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h }
  const r = max / Math.max(w, h)
  return { width: Math.max(1, Math.round(w * r)), height: Math.max(1, Math.round(h * r)) }
}

// Photos are resized on the device before upload (RENT-INV-001 §8).
export const PHOTO_SIDE = 2048
export const PHOTO_QUALITY = 0.8

// resize draws an image file at most PHOTO_SIDE on its long side and returns
// it as a JPEG; the server strips what metadata is left and keeps the pixels.
export async function resize(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const { width, height } = fitSize(bitmap.width, bitmap.height, PHOTO_SIDE)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', PHOTO_QUALITY))
  if (!blob) throw new Error('resize failed')
  return new File([blob], file.name.replace(/\.[^.]*$/, '') + '.jpg', { type: 'image/jpeg' })
}

// A queued photo: what it shows, its local preview, and where it stands.
export interface QueuedPhoto {
  key: string
  target: { item_id?: string; meter_id?: string }
  preview: string
  state: 'waiting' | 'sending' | 'failed'
  error?: string
}

// PhotoQueue uploads photos one at a time in the background; a failure stays
// in the list to be retried, so nothing is lost silently.
export class PhotoQueue {
  readonly items: QueuedPhoto[] = []
  private files = new Map<string, File>()
  private running = false
  private seq = 0
  constructor(
    private readonly send: (target: QueuedPhoto['target'], file: File) => Promise<Photo>,
    private readonly done: (photo: Photo, queued: QueuedPhoto) => void,
    private readonly failed: (queued: QueuedPhoto, e: unknown) => string,
    private readonly changed: () => void = () => {},
  ) {}

  add(target: QueuedPhoto['target'], file: File, preview: string): QueuedPhoto {
    const q: QueuedPhoto = { key: `p${++this.seq}`, target, preview, state: 'waiting' }
    this.items.push(q)
    this.files.set(q.key, file)
    this.changed()
    void this.run()
    return q
  }
  retry(key: string): void {
    const q = this.items.find((x) => x.key === key)
    if (q && q.state === 'failed') {
      q.state = 'waiting'
      q.error = undefined
      this.changed()
      void this.run()
    }
  }
  get pending(): number {
    return this.items.length
  }
  private async run(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      for (;;) {
        const q = this.items.find((x) => x.state === 'waiting')
        if (!q) return
        q.state = 'sending'
        this.changed()
        const file = this.files.get(q.key)
        try {
          if (!file) throw new Error('lost file')
          const photo = await this.send(q.target, file)
          this.items.splice(this.items.indexOf(q), 1)
          this.files.delete(q.key)
          this.done(photo, q)
        } catch (e) {
          q.state = 'failed'
          q.error = this.failed(q, e)
        }
        this.changed()
      }
    } finally {
      this.running = false
    }
  }
}

// Signatures (RENT-INV-001 §5, S15c; tenure-api Q-112).
export type Signatures = Schemas['inventory.SignaturesView']
export type SignInput = Schemas['inventory.SignInput']
export type SignerInput = Schemas['inventory.SignerInput']

export async function getSignatures(id: string): Promise<Signatures> {
  return (await api.get<Signatures>(`/inventories/${id}/signatures`)).data
}
export async function sign(id: string, input: SignInput): Promise<Signatures> {
  return (await api.post<Signatures>(`/inventories/${id}/signatures`, input)).data
}
export async function refreshSignatures(id: string): Promise<Signatures> {
  return (await api.post<Signatures>(`/inventories/${id}/signatures/refresh`)).data
}
export async function cancelSignatures(id: string): Promise<Signatures> {
  return (await api.post<Signatures>(`/inventories/${id}/signatures/cancel`)).data
}
// preview is the PDF to sign, kept in the browser as a blob: link.
export async function preview(id: string): Promise<Blob> {
  return api.blob(`/inventories/${id}/preview`)
}

// unsigned lists the parties still to sign.
export function unsigned(s: Pick<Signatures, 'parties'>): NonNullable<Signatures['parties']> {
  return (s.parties ?? []).filter((p) => !p.signed)
}
// partyKey names a party in a form (party and name).
export function partyKey(p: { party?: string; name?: string; signer_name?: string }): string {
  return `${p.party ?? ''}:${p.name ?? p.signer_name ?? ''}`
}

// The comparison of an exit with its entry (S15d; tenure-api Q-113).
export type Comparison = Schemas['inventory.ComparisonView']
export type ItemState = Schemas['inventory.State']
export async function comparison(id: string): Promise<Comparison> {
  return (await api.get<Comparison>(`/inventories/${id}/comparison`)).data
}
// changed reports whether a result is one the owner looks at: anything but
// the same.
export function changed(result: string | undefined): boolean {
  return !!result && result !== 'same'
}
