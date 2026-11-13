// The dashboard (RENT-SPEC-016; tenure-api Q-129; Q-W39): the portfolio's
// performance per asset and in all, from the owner's journal, so the same
// figures as the tax summary. The CSV export is a step_up route; the caller
// wraps it in withStepUp. Pure helpers are exported for the tests.
import { api } from '@/api/client'
import type { Schemas } from '@/api/types'

export type Dashboard = Schemas['dashboard.View']
export type AssetRow = Schemas['dashboard.Asset']
export type Bucket = Schemas['dashboard.Bucket']
export type Month = Schemas['dashboard.Month']

export async function dashboard(year: number): Promise<Dashboard> {
  return (await api.get<Dashboard>('/dashboard', { query: { year } })).data
}

// downloadCSV fetches the assets CSV and hands it to the browser to save,
// through a Blob and a temporary link (the CSP refuses inline scripts and
// data: URLs).
export async function downloadCSV(year: number): Promise<void> {
  const b = await api.blob(`/dashboard/assets.csv?year=${year}`)
  const url = URL.createObjectURL(b)
  const a = document.createElement('a')
  a.href = url
  a.download = `tableau-de-bord-${year}.csv`
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// occupancyBP is the share of the days held the asset was let, in basis
// points, rounded down; null when it was not held. Pure, in integers.
export function occupancyBP(a: AssetRow): number | null {
  const days = a.days ?? 0
  if (days <= 0) return null
  return Math.floor(((a.occupied_days ?? 0) * 10_000) / days)
}

// bucketKey names an arrears bucket for its label: « 1-30 », « 91+ ».
export function bucketKey(b: Bucket): string {
  return b.to_days == null ? `${b.from_days ?? 0}+` : `${b.from_days ?? 0}-${b.to_days}`
}

// change is the variation from previous to current in basis points,
// rounded toward zero; null when previous is zero. Pure, in integers.
export function change(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.trunc(((current - previous) * 10_000) / Math.abs(previous))
}

// barWidths scales each month's money in and out against the largest of
// them, as whole percents for the CSS bars. Pure.
export function barWidths(months: Month[]): { in: number; out: number }[] {
  const max = Math.max(1, ...months.flatMap((m) => [m.in_cents ?? 0, m.out_cents ?? 0]))
  return months.map((m) => ({ in: Math.round(((m.in_cents ?? 0) * 100) / max), out: Math.round(((m.out_cents ?? 0) * 100) / max) }))
}
