// The owner's journal (RENT-SPEC-014; tenure-api Q-127, Q-128; Q-W38): the
// year's entries in double entry on a cash basis, each account's movements,
// whether the year is closed, and the year-end exports. The exports are
// step_up routes; the callers wrap them in withStepUp.
import { api } from '@/api/client'
import type { Schemas } from '@/api/types'

export type Journal = Schemas['ledger.View']
export type Entry = Schemas['ledger.Entry']
export type Balance = Schemas['ledger.Balance']
export type ExportKind = 'journal' | 'fec' | 'pack'

export async function journal(year: number): Promise<Journal> {
  return (await api.get<Journal>('/ledger', { query: { year } })).data
}

// exportPath is the route of an export of a year.
export function exportPath(kind: ExportKind, year: number): string {
  const file = { journal: 'journal.csv', fec: 'fec.txt', pack: 'pack.zip' }[kind]
  return `/ledger/${file}?year=${year}`
}

// exportName is the file name the browser saves an export under, the
// API's own (Content-Disposition) not being readable from a blob.
export function exportName(kind: ExportKind, year: number): string {
  return { journal: `journal-${year}.csv`, fec: `FEC${year}1231.txt`, pack: `cloture-${year}.zip` }[kind]
}

// download fetches an export and hands it to the browser to save, through a
// Blob and a temporary link (the CSP refuses inline scripts and data: URLs).
export async function download(kind: ExportKind, year: number): Promise<void> {
  const b = await api.blob(exportPath(kind, year))
  const url = URL.createObjectURL(b)
  const a = document.createElement('a')
  a.href = url
  a.download = exportName(kind, year)
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// entryTotals returns an entry's debits and credits, which the API keeps
// equal. Pure.
export function entryTotals(e: Entry): { debit: number; credit: number } {
  let debit = 0
  let credit = 0
  for (const l of e.lines ?? []) {
    debit += l.debit_cents ?? 0
    credit += l.credit_cents ?? 0
  }
  return { debit, credit }
}

// byClass sorts the balances into the chart's classes: 1 (capital and debts),
// 4 (third parties), 5 (bank), 6 (expenses), 7 (income). Pure.
export function byClass(balances: Balance[]): { cls: string; items: Balance[] }[] {
  const out: { cls: string; items: Balance[] }[] = []
  for (const b of balances) {
    const cls = (b.account ?? '?').slice(0, 1)
    let g = out.find((x) => x.cls === cls)
    if (!g) out.push((g = { cls, items: [] }))
    g.items.push(b)
  }
  return out.sort((a, b) => a.cls.localeCompare(b.cls))
}
