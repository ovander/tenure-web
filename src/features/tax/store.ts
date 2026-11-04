// The tax store (RENT-FE-001 §7): an income year's summary, micro-foncier and
// régime réel side by side, its 2044 lines and their sources. Computing and
// issuing are step_up routes; the callers wrap them in withStepUp.
import { defineStore } from 'pinia'
import { api } from '@/api/client'
import type { Page, Schemas } from '@/api/types'
import { param } from '@/features/params/store'

export type TaxView = Schemas['tax.View']
export type TaxSummary = Schemas['tax.Summary']
export type OwnerSummary = Schemas['tax.OwnerSummary']
export type LineAmount = Schemas['tax.LineAmount']
export type TaxFlag = Schemas['tax.Flag']
export type Regime = 'micro' | 'reel'

// LineMap is the legal parameter form_2044_line_map: which 2044 line each
// income or charge category goes to for a tax year, and how lines count.
// No line number is written in the app.
export interface LineMap {
  tax_year?: number
  millesime?: number
  lines?: Record<string, string>
  income_lines?: string[]
  interest_lines?: string[]
  subtracted_lines?: string[]
}

export const useTax = defineStore('tax', () => {
  async function forYear(year: number): Promise<TaxView | undefined> {
    const p = (await api.get<Page<TaxView>>('/tax/summaries', { query: { year, page: 1, size: 10 } })).data
    return p.items.find((s) => s.state === 'issued') ?? p.items[0]
  }
  // compute drafts (or recomputes) the year: both regimes side by side.
  async function compute(year: number): Promise<TaxView> {
    return (await api.post<TaxView>('/tax/summaries', { year })).data
  }
  // issue freezes the year under regime: RF-… PDF and the CSV of the lines.
  async function issue(year: number, regime: Regime): Promise<TaxView> {
    return (await api.post<TaxView>('/tax/summaries', { year, regime })).data
  }
  async function lineMap(year: number): Promise<LineMap | undefined> {
    const m = await param<LineMap>('form_2044_line_map', `${year}-12-31`)
    return m && (!m.tax_year || m.tax_year === year) ? m : undefined
  }
  async function lockYears(year: number): Promise<number | undefined> {
    return param<number>('reel_option_lock_years', `${year}-12-31`)
  }
  return { forYear, compute, issue, lineMap, lockYears }
})

// categoriesOf lists the categories that go to line, as the line map says.
export function categoriesOf(line: string, map: LineMap | undefined): string[] {
  return Object.entries(map?.lines ?? {}).filter(([, l]) => l === line).map(([c]) => c).sort()
}

// lineKind says how a line counts in the réel: income, interest, subtracted
// from the expenses, or an expense.
export function lineKind(line: string, map: LineMap | undefined): 'income' | 'interest' | 'subtracted' | 'expense' {
  if (map?.income_lines?.includes(line)) return 'income'
  if (map?.interest_lines?.includes(line)) return 'interest'
  if (map?.subtracted_lines?.includes(line)) return 'subtracted'
  return 'expense'
}

// lower names the regime with the lower taxable base, for display only; it
// is '' when they are equal or micro-foncier is not open.
export function lower(o: OwnerSummary): Regime | '' {
  const micro = o.micro?.eligible ? (o.micro.taxable_cents ?? 0) : undefined
  const reel = o.reel?.taxable_cents ?? 0
  if (micro === undefined || micro === reel) return ''
  return micro < reel ? 'micro' : 'reel'
}

// flagsBySource indexes the flags by the id they point at.
export function flagsBySource(flags: TaxFlag[] | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const f of flags ?? []) if (f.id && f.kind) (out[f.id] ??= []).push(f.kind)
  return out
}
