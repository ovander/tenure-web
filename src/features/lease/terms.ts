// A lease's terms and an asset's vacancy (RENT-SPEC-010; tenure-api Q-119;
// Q-W34), both computed by the API from the leases' dates.
import { api } from '@/api/client'
import type { Schemas } from '@/api/types'

export type TermsView = Schemas['lease.TermsView']
export type VacancyView = Schemas['lease.VacancyView']

export async function getTerms(lease: string): Promise<TermsView> {
  return (await api.get<TermsView>(`/leases/${lease}/terms`)).data
}
export async function getVacancies(asset: string): Promise<VacancyView> {
  return (await api.get<VacancyView>(`/assets/${asset}/vacancies`)).data
}

// yearsOf lists the years of the vacant days, latest first, each with its
// count; a year without vacant days is left out.
export function yearsOf(v: Pick<VacancyView, 'days_by_year'>): { year: number; days: number }[] {
  return Object.entries(v.days_by_year ?? {})
    .map(([y, d]) => ({ year: Number(y), days: Number(d) }))
    .filter((x) => x.days > 0)
    .sort((a, b) => b.year - a.year)
}
