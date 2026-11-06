// The tenant's completion requests on an issued entry (RENT-INV-001 §5 step 5,
// slice 7; tenure-api Q-114; Q-W29): the windows the law opens, the requests
// recorded as the owner received them, and the owner's decision per line,
// which issues the EC document. Pure helpers are exported for the tests.
import { api } from '@/api/client'
import type { Schemas } from '@/api/types'

export type Completions = Schemas['inventory.CompletionsView']
export type Completion = Schemas['inventory.CompletionView']
export type CompletionInput = Schemas['inventory.CompletionInput']
export type CompletionLineInput = Schemas['inventory.CompletionLineInput']
export type DecisionLine = Schemas['inventory.DecisionLineInput']
export type Reason = 'ten_day' | 'heating'

export async function getCompletions(id: string): Promise<Completions> {
  return (await api.get<Completions>(`/inventories/${id}/completions`)).data
}
export async function requestCompletion(id: string, input: CompletionInput): Promise<Completion> {
  return (await api.post<Completion>(`/inventories/${id}/completions`, input)).data
}
export async function decideCompletion(c: Completion, lines: DecisionLine[], decidedOn?: string): Promise<Completion> {
  return (await api.put<Completion>(`/completions/${c.id}`, { lines, decided_on: decidedOn || undefined }, { ifMatch: c.version ?? 0 })).data
}

// eligible lists the entry items a request may name: every item for the
// ten-day window, the heating items only for the heating window.
export function eligible<T extends { category?: string }>(items: T[], reason: Reason): T[] {
  return reason === 'heating' ? items.filter((it) => it.category === 'heating') : items
}

// asked reports whether a line asks for something: a condition, whether it
// works, or a comment.
export function asked(l: Pick<CompletionLineInput, 'condition' | 'works' | 'comment'>): boolean {
  return !!l.condition || !!l.works || !!l.comment?.trim()
}

// pending counts the requests still to decide.
export function pending(v: Pick<Completions, 'completions'> | null | undefined): number {
  return (v?.completions ?? []).filter((c) => c.decision === 'pending').length
}

// outcome is what a decision will be, from the lines decided so far:
// undefined until every line is.
export function outcome(lines: string[], decided: Record<string, boolean | undefined>): 'accepted' | 'refused' | 'partial' | undefined {
  if (!lines.length || lines.some((l) => decided[l] === undefined)) return undefined
  const n = lines.filter((l) => decided[l]).length
  return n === lines.length ? 'accepted' : n === 0 ? 'refused' : 'partial'
}
