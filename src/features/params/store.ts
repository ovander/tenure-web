// Legal parameters read from the API (GET /params, /params/irl), as of a
// date. The app writes no legal value: a default that depends on the law is
// proposed only when the API has the parameter.
import { api } from '@/api/client'
import type { Schemas } from '@/api/types'

export type ParamEntry = Schemas['params.Entry']
export type IRL = Schemas['params.IRL']

// param returns the value of key in force on asOf (YYYY-MM-DD), or undefined
// when the API has none.
export async function param<T>(key: string, asOf?: string): Promise<T | undefined> {
  try {
    const rows = (await api.get<ParamEntry[]>('/params', { query: { key, as_of: asOf } })).data
    const inForce = rows.filter((r) => !asOf || !r.effective_from || r.effective_from <= asOf).sort((a, b) => (a.effective_from ?? '').localeCompare(b.effective_from ?? ''))
    return inForce.at(-1)?.value as T | undefined
  } catch {
    return undefined
  }
}

// latestIRL is the most recent published IRL quarter, or undefined.
export async function latestIRL(): Promise<IRL | undefined> {
  try {
    const rows = (await api.get<IRL[]>('/params/irl')).data
    return [...rows].sort((a, b) => (a.quarter ?? '').localeCompare(b.quarter ?? '')).at(-1)
  } catch {
    return undefined
  }
}

export interface LeaseTerms {
  unfurnished?: number
  unfurnished_legal_owner?: number
  furnished?: number
  furnished_student?: number
}
export interface Range {
  min?: number
  max?: number
}
