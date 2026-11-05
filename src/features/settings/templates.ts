// The document templates of S14 (tenure-api GET /templates, Q-106, Q-W24):
// each template embedded in tenure's release with its versions, the current
// one, and how many of the scope's documents each version rendered.
import { api } from '@/api/client'
import type { Schemas } from '@/api/types'

export type Template = Schemas['document.TemplateView']
export type TemplateVersion = Schemas['document.TemplateVersionView']

export async function listTemplates(): Promise<Template[]> {
  return (await api.get<Template[]>('/templates')).data
}

// current is the version new documents are rendered with.
export function current(t: Pick<Template, 'versions'>): TemplateVersion | undefined {
  return (t.versions ?? []).find((v) => v.current)
}

// rendered is how many of the scope's documents the template's versions
// rendered, all versions together.
export function rendered(t: Pick<Template, 'versions'>): number {
  return (t.versions ?? []).reduce((n, v) => n + (v.documents ?? 0), 0)
}

// shortHash is the head of a SHA-256, for display; the full one is in the title.
export function shortHash(h: string | undefined): string {
  return (h ?? '').slice(0, 12)
}
