// Furnished letting under the réel (LMNP; RENT-SPEC-019; tenure-api Q-132;
// Q-W41): an asset's component grid and its furniture and works, their
// depreciation, the owner's BIC result and the declaration of a year. The
// defaults (grid, durations, threshold, micro-BIC) are the API's legal
// parameters: the screen holds none. Pure helpers are exported for the tests.
import { api } from '@/api/client'
import type { Schemas } from '@/api/types'

export type Grid = Schemas['bic.GridView']
export type GridInput = Schemas['bic.GridInput']
export type Line = Schemas['bic.Line']
export type Item = Schemas['bic.ItemView']
export type ItemInput = Schemas['bic.ItemInput']
export type Depreciation = Schemas['bic.DepreciationView']
export type Result = Schemas['bic.ResultView']
export type YearResult = Schemas['bic.YearResult']
export type Declaration = Schemas['bic.Declaration']
export type Regime = 'reel' | 'micro'

export async function grid(assetId: string): Promise<Grid> {
  return (await api.get<Grid>(`/assets/${assetId}/bic-grid`)).data
}
export async function saveGrid(assetId: string, version: number, input: GridInput): Promise<Grid> {
  return (await api.put<Grid>(`/assets/${assetId}/bic-grid`, input, { ifMatch: version })).data
}
export async function items(assetId: string): Promise<Item[]> {
  return (await api.get<Item[]>(`/assets/${assetId}/fixed-assets`)).data
}
export async function saveItem(assetId: string, input: ItemInput, current?: Item | null): Promise<Item> {
  return current?.id
    ? (await api.put<Item>(`/fixed-assets/${current.id}`, input, { ifMatch: current.version ?? 0 })).data
    : (await api.post<Item>(`/assets/${assetId}/fixed-assets`, input)).data
}
export async function depreciation(assetId: string, year: number): Promise<Depreciation> {
  return (await api.get<Depreciation>(`/assets/${assetId}/depreciation`, { query: { year } })).data
}
export async function result(year: number): Promise<Result> {
  return (await api.get<Result>('/bic/result', { query: { year } })).data
}
export async function declarations(): Promise<Declaration[]> {
  return (await api.get<Declaration[]>('/bic/declarations')).data
}
export async function issue(year: number, regime: Regime): Promise<Declaration> {
  return (await api.post<Declaration>('/bic/declarations', { year, regime })).data
}

// FULL is the sum of a grid's shares, in basis points.
export const FULL = 10_000

// percent formats basis points as « 15 % » or « 12,5 % ».
export function percent(bp: number | null | undefined): string {
  if (bp == null) return '—'
  const int = Math.trunc(bp / 100)
  const dec = String(Math.abs(bp % 100)).padStart(2, '0').replace(/0+$/, '')
  return `${int}${dec ? `,${dec}` : ''} %`
}

// parsePercent reads « 15 », « 12,5 » or « 12.5 % » as basis points, up to
// two decimals, by string, never through a float; null for anything else.
export function parsePercent(text: string): number | null {
  const m = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(text.replace(/[\s %]/g, ''))
  if (!m) return null
  const bp = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return bp <= FULL ? bp : null
}

// shareTotal adds up a grid's shares.
export function shareTotal(lines: Pick<Line, 'share_bp'>[]): number {
  return lines.reduce((s, l) => s + (l.share_bp ?? 0), 0)
}

// basisOf is the depreciable basis a grid input gives: the price, with the
// acquisition costs unless they are expensed.
export function basisOf(g: Pick<GridInput, 'price_cents' | 'acquisition_costs_cents' | 'costs_expensed'>): number {
  return (g.price_cents ?? 0) + (g.costs_expensed ? 0 : (g.acquisition_costs_cents ?? 0))
}

// duration names months as years when they make whole years.
export function duration(months: number | null | undefined): { years: number } | { months: number } | null {
  if (!months) return null
  return months % 12 === 0 ? { years: months / 12 } : { months }
}
