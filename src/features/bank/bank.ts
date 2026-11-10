// Bank reconciliation (RENT-SPEC-013; tenure-api Q-123, Q-124, Q-125;
// Q-W37): accounts, statements imported as CSV or OFX, the lines and their
// matching, credits to rent and debits to charges. Pure helpers are
// exported for the tests.
import { api } from '@/api/client'
import type { Schemas } from '@/api/types'

export type Account = Schemas['payment.AccountView']
export type Line = Schemas['payment.LineView']
export type Mapping = Schemas['payment.CSVMapping']
export type ImportResult = Schemas['payment.ImportResult']
export type RentSuggestion = Schemas['payment.Suggestion']
export type ChargeSuggestion = Schemas['charge.Suggestion']
export type AutoResult = Schemas['payment.AutoMatchResult']
export type Allocation = Schemas['payment.Allocation']
interface Page<T> { items?: T[]; total?: number }

export async function accounts(): Promise<Account[]> {
  return (await api.get<Account[]>('/bank-accounts')).data
}
export async function createAccount(label: string, ibanLast4: string): Promise<Account> {
  return (await api.post<Account>('/bank-accounts', { label, iban_last4: ibanLast4 || undefined })).data
}
export async function uploadStatement(file: File): Promise<{ id?: string }> {
  return (await api.upload<{ id?: string }>('/documents', { class: 'supporting' }, file)).data
}
export async function importStatement(input: { account_id: string; document_id: string; format: 'csv' | 'ofx'; mapping?: Mapping; dry_run: boolean }): Promise<ImportResult> {
  return (await api.post<ImportResult>('/payments/import', input)).data
}
export async function lines(query: { account_id?: string; status?: string; page?: number; size?: number }): Promise<Page<Line>> {
  return (await api.get<Page<Line>>('/bank-lines', { query })).data
}
export async function rentSuggestions(line: string): Promise<RentSuggestion[]> {
  return (await api.get<RentSuggestion[]>(`/bank-lines/${line}/suggestions`)).data
}
export async function chargeSuggestions(line: string): Promise<ChargeSuggestion[]> {
  return (await api.get<ChargeSuggestion[]>(`/bank-lines/${line}/charge-suggestions`)).data
}
export async function matchRent(l: Line, allocations: Allocation[]): Promise<unknown> {
  return (await api.post(`/bank-lines/${l.id}/match`, { allocations, version: l.version })).data
}
export async function matchCharges(l: Line, chargeIds: string[]): Promise<unknown> {
  return (await api.post(`/bank-lines/${l.id}/charges`, { charge_ids: chargeIds, version: l.version })).data
}
export async function autoMatch(accountId: string | undefined, dryRun: boolean): Promise<AutoResult> {
  return (await api.post<AutoResult>('/bank-lines/auto', { account_id: accountId || undefined, dry_run: dryRun })).data
}
export async function setStatus(l: Line, status: 'ignored' | 'unmatched', note: string): Promise<Line> {
  return (await api.post<Line>(`/bank-lines/${l.id}/status`, { status, note: note || undefined, version: l.version })).data
}

// formatOf tells a statement's format from its file name.
export function formatOf(name: string): 'csv' | 'ofx' | null {
  const n = name.toLowerCase()
  if (n.endsWith('.ofx') || n.endsWith('.qfx')) return 'ofx'
  if (n.endsWith('.csv') || n.endsWith('.txt')) return 'csv'
  return null
}

// header reads the column names of a CSV statement's header row: the first
// line holding the delimiter, quotes dropped. Pure.
export function header(text: string, delimiter = ';'): string[] {
  const first = text.replace(/^﻿/, '').split(/\r?\n/).find((l) => l.includes(delimiter)) ?? ''
  return first.split(delimiter).map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim()).filter(Boolean)
}

// guessDelimiter picks ; , or tab, whichever the first line holds most.
export function guessDelimiter(text: string): string {
  const first = text.replace(/^﻿/, '').split(/\r?\n/)[0] ?? ''
  const counts = [';', ',', '\t'].map((d) => [d, first.split(d).length - 1] as const)
  counts.sort((a, b) => b[1] - a[1])
  return counts[0]![1] > 0 ? counts[0]![0] : ';'
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase()

// guessMapping proposes the columns of a French bank export from its
// header: the date, the label, a signed amount or a debit and a credit, a
// reference. The owner checks it before importing. Pure.
export function guessMapping(cols: string[], delimiter: string): Mapping {
  const find = (...words: string[]) => cols.find((c) => words.some((w) => fold(c).includes(w))) ?? ''
  const debit = find('debit')
  const credit = find('credit')
  const m: Mapping = {
    delimiter, date: find('date'), label: find('libelle', 'label', 'intitule', 'description'),
    reference: find('reference', 'ref') || undefined,
  }
  if (debit && credit) {
    m.debit = debit
    m.credit = credit
  } else m.amount = find('montant', 'amount', 'somme')
  return m
}

// oneLease turns a rent suggestion into the allocation that records the
// whole line on its lease.
export function oneLease(l: Line, s: RentSuggestion): Allocation[] {
  return [{ lease_id: s.lease_id ?? '', amount_cents: l.amount_cents ?? 0, method: s.method ?? 'transfer' }]
}
