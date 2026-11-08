// The documents store (RENT-FE-001 §7): the archive of the scope filtered by
// asset, year, class and number; the year or asset ZIP export (a step_up
// route, built after the request and polled); the RGPD export of the caller.
import { defineStore } from 'pinia'
import { api } from '@/api/client'
import type { Page, Schemas } from '@/api/types'

export type ArchiveDoc = Schemas['document.View']
export type DocClass = NonNullable<ArchiveDoc['class']>
export type ExportView = Schemas['document.ExportView']
export type DataExport = Schemas['portfolio.DataExport']

export const classes: DocClass[] = [
  'rent_call', 'receipt', 'cancellation', 'revision_notice', 'regularisation', 'tax_summary',
  'contract', 'amendment', 'deposit', 'surety', 'inventory', 'restitution', 'notice', 'renewal', 'supporting', 'other',
]

export interface DocQuery { asset_id?: string; year?: number; class?: string; number?: string; page?: number; size?: number }

export const useDocuments = defineStore('documents', () => {
  async function list(q: DocQuery): Promise<Page<ArchiveDoc>> {
    return (await api.get<Page<ArchiveDoc>>('/documents', { query: { page: 1, size: 50, ...q, number: q.number?.trim() || undefined } })).data
  }
  async function startExport(input: { year?: number; asset_id?: string }): Promise<ExportView> {
    return (await api.post<ExportView>('/documents/export', input)).data
  }
  async function exportState(id: string): Promise<ExportView> {
    return (await api.get<ExportView>(`/documents/exports/${id}`)).data
  }
  async function myData(): Promise<DataExport> {
    return (await api.get<DataExport>('/me/export')).data
  }
  return { list, startExport, exportState, myData }
})

// waitExport polls an export until it is ready or failed, every `every` ms,
// giving up after `tries` attempts (it then resolves the last state seen).
export async function waitExport(get: () => Promise<ExportView>, every = 1500, tries = 40, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<ExportView> {
  let v = await get()
  for (let i = 1; i < tries && v.state === 'pending'; i++) {
    await sleep(every)
    v = await get()
  }
  return v
}

// saveJSON hands the browser a JSON file to save, without an inline script
// or a data: URL (both refused by the CSP): a Blob and a temporary link.
export function saveJSON(name: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
