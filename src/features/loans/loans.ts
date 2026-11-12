// Loans of an asset and their amortisation table (RENT-SPEC-014; tenure-api
// Q-126; Q-W38): computed from a fixed rate, or the bank's table typed in.
// Each instalment due in an income year puts its interest and insurance on
// line 250 of the tax summary. Pure helpers are exported for the tests.
import { api } from '@/api/client'
import type { Schemas } from '@/api/types'

export type Loan = Schemas['loan.View']
export type Input = Schemas['loan.Input']
export type Instalment = Schemas['loan.Instalment']
export type TypedRow = Schemas['loan.InstalmentInput']

export async function list(assetId: string): Promise<Loan[]> {
  return (await api.get<Loan[]>('/loans', { query: { asset_id: assetId } })).data
}
export async function get(id: string): Promise<Loan> {
  return (await api.get<Loan>(`/loans/${id}`)).data
}
export async function create(input: Input): Promise<Loan> {
  return (await api.post<Loan>('/loans', input)).data
}
export async function update(id: string, version: number, input: Input): Promise<Loan> {
  return (await api.put<Loan>(`/loans/${id}`, input, { ifMatch: version })).data
}
export async function preview(q: { principal_cents: number; annual_rate_ppm: number; term_months: number; first_due_on: string; insurance_cents?: number }): Promise<Loan> {
  return (await api.get<Loan>('/loans/schedule', { query: q })).data
}

// RATE_SCALE is the API's scale of a rate: parts per million a year.
export const RATE_SCALE = 1_000_000

// parseRate reads a rate in percent, « 3,45 » or « 3.45 % », up to four
// decimals, as parts per million (34 500). It returns null for an empty
// field and NaN for anything else or a rate of 100 % or more. Pure, by
// string, never through a float.
export function parseRate(text: string): number | null {
  const s = text.replace(/[\s %]/g, '')
  if (s === '') return null
  const m = /^(\d{1,2})(?:[.,](\d{1,4}))?$/.exec(s)
  if (!m) return Number.NaN
  return Number(m[1]) * 10_000 + Number((m[2] ?? '').padEnd(4, '0'))
}

// rate formats parts per million as « 3,45 % », without trailing zeros.
export function rate(ppm: number | null | undefined): string {
  if (ppm == null) return '—'
  const int = Math.trunc(ppm / 10_000)
  const dec = String(ppm % 10_000).padStart(4, '0').replace(/0+$/, '')
  return `${int}${dec ? `,${dec}` : ''} %`
}

const cents = (s: string): number | null => {
  const t = s.replace(/[\s  €]/g, '').replace('−', '-')
  if (t === '') return 0
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(t)
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : null
}

const day = (s: string): string | null => {
  const t = s.trim()
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  return m ? t : null
}

// ParsedTable is a bank table read from pasted text: its rows, and the
// lines that could not be read (1-based).
export interface ParsedTable {
  rows: TypedRow[]
  bad: number[]
}

// parseTable reads an amortisation table pasted from a spreadsheet or the
// bank's export: one instalment a line, its columns separated by tabs or
// semicolons: the due day (JJ/MM/AAAA or AAAA-MM-JJ), the principal, the
// interest and, optionally, the insurance, in euros. A line whose first
// column is no date (a header, a total) is skipped; a dated line that does
// not read is reported. Pure.
export function parseTable(text: string): ParsedTable {
  const out: ParsedTable = { rows: [], bad: [] }
  text.replace(/^﻿/, '').split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return
    const cols = raw.split(/\t|;/).map((c) => c.trim().replace(/^"(.*)"$/, '$1'))
    const due = day(cols[0] ?? '')
    if (!due) return
    const p = cents(cols[1] ?? ''), n = cents(cols[2] ?? ''), a = cents(cols[3] ?? '')
    if (p === null || n === null || a === null || cols.length < 3) {
      out.bad.push(i + 1)
      return
    }
    out.rows.push({ due_on: due, principal_cents: p, interest_cents: n, insurance_cents: a })
  })
  return out
}

// LoanSource is what a tax line's source « loan:<id>:<seq>[:insurance] »
// names; null for any other source.
export interface LoanSource {
  loanId: string
  seq: number
  insurance: boolean
}

export function loanSource(src: string): LoanSource | null {
  const m = /^loan:([^:]+):(\d+)(:insurance)?$/.exec(src)
  return m ? { loanId: m[1]!, seq: Number(m[2]), insurance: !!m[3] } : null
}
