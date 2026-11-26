// The charges store (RENT-FE-001 §7): the charges ledger of the scope, the
// syndic statement import, and reconciliations with their lines per lease.
// Server data only; each write returns the API's answer.
import { defineStore } from 'pinia'
import { api } from '@/api/client'
import { onceFor } from '@/lib/async'
import type { Page, Schemas } from '@/api/types'

export type Charge = Schemas['charge.View']
export type ChargeInput = Schemas['charge.Input']
export type Category = NonNullable<ChargeInput['category']>
export type ImportInput = Schemas['charge.ImportInput']
export type Mapping = Schemas['charge.Mapping']
export type Recon = Schemas['charge.ReconView']
export type ReconLine = Schemas['charge.LineView']
export type LineInput = Schemas['charge.LineInput']
export type ReconState = NonNullable<Recon['state']>
export type ReconAction = Schemas['charge.Action']
export type Settlement = NonNullable<LineInput['settlement']>
export type DocumentMeta = Schemas['document.View']

// The categories of tenure-api charge.Category, in the order the form offers
// them: what the syndic and the tax office bill first.
export const categories: Category[] = [
  'copro_statement', 'copro_provision', 'copro_regularisation_prior', 'property_tax', 'teom', 'insurance', 'repairs',
  'management', 'recoverable_utilities', 'loan_interest', 'loan_insurance', 'indemnity', 'owner_expense_charged_to_tenant', 'unrecovered_at_close',
]
export const settlements: Settlement[] = ['fee', 'deposit', 'direct']

// The French syndic export the import proposes by default; the owner changes
// any column name that differs (Q-W16).
export const defaultMapping: Mapping = { label: 'Libellé', amount: 'Montant', recoverable: 'Récupérable', delimiter: ';', decimal_point: false }

export const useCharges = defineStore('charges', () => {
  async function list(query: { asset_id?: string; year?: number; status?: string; category?: string; page?: number; size?: number } = {}): Promise<Page<Charge>> {
    return (await api.get<Page<Charge>>('/charges', { query: { page: 1, size: 100, ...query } })).data
  }
  async function create(input: ChargeInput): Promise<Charge> {
    return (await api.post<Charge>('/charges', input)).data
  }
  async function update(id: string, input: ChargeInput, version: number): Promise<Charge> {
    return (await api.put<Charge>(`/charges/${id}`, input, { ifMatch: version })).data
  }
  // upload archives a statement file (CSV or PDF, scanned) as a supporting
  // document of the asset, for the import to read. A file is archived once
  // per asset: when the import fails, its retry reuses it (onceFor).
  const uploaded = onceFor<DocumentMeta>()
  function upload(assetId: string, file: File): Promise<DocumentMeta> {
    return uploaded(file, assetId, async () => (await api.upload<DocumentMeta>('/documents', { class: 'supporting', asset_id: assetId }, file)).data)
  }
  async function importSyndic(input: ImportInput): Promise<Charge[]> {
    return (await api.post<Charge[]>('/charges/import/syndic', input)).data
  }
  async function recons(query: { asset_id?: string; lease_id?: string; year?: number } = {}): Promise<Page<Recon>> {
    return (await api.get<Page<Recon>>('/reconciliations', { query: { page: 1, size: 100, ...query } })).data
  }
  async function recon(id: string): Promise<Recon> {
    return (await api.get<Recon>(`/reconciliations/${id}`)).data
  }
  async function startRecon(assetId: string, start: string, end: string): Promise<Recon> {
    return (await api.post<Recon>('/reconciliations', { asset_id: assetId, exercise_start: start, exercise_end: end })).data
  }
  async function transition(id: string, action: ReconAction, reason?: string): Promise<Recon> {
    return (await api.post<Recon>(`/reconciliations/${id}/transitions`, { action, reason })).data
  }
  async function saveLine(reconId: string, line: ReconLine, input: LineInput): Promise<ReconLine> {
    return (await api.put<ReconLine>(`/reconciliations/${reconId}/lines/${line.id}`, input, { ifMatch: line.version ?? 0 })).data
  }
  return { list, create, update, upload, importSyndic, recons, recon, startRecon, transition, saveLine }
})

// toChargeInput turns a charge into the body of PUT /charges/{id}.
export function toChargeInput(c: Charge): ChargeInput {
  return {
    asset_id: c.asset_id, category: c.category, label: c.label, amount_cents: c.amount_cents, recoverable_cents: c.recoverable_cents,
    charged_on: c.charged_on, paid_on: c.paid_on || undefined, exercise_year: c.exercise_year, document_id: c.document_id || undefined, status: c.status,
  }
}

// exercise is the calendar year as a reconciliation exercise (1 January to
// 31 December), the usual syndic exercise; the owner may change both days.
export function exercise(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` }
}

// totals sums the ledger's amounts, in cents.
export function totals(rows: Charge[]): { amount: number; recoverable: number; drafts: number } {
  return rows.reduce(
    (s, c) => ({ amount: s.amount + (c.amount_cents ?? 0), recoverable: s.recoverable + (c.recoverable_cents ?? 0), drafts: s.drafts + (c.status === 'draft' ? 1 : 0) }),
    { amount: 0, recoverable: 0, drafts: 0 },
  )
}

// The wizard's steps (RENT-FE-001 §4 flow 3).
export const steps = ['charges', 'allocation', 'balances', 'provisions', 'issue'] as const
export type Step = (typeof steps)[number]
