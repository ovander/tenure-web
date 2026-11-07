// The obligations calendar (RENT-SPEC-012 computed base; tenure-api Q-116;
// Q-W32): the API derives every dated obligation, this module names each
// item and says where it is cleared. Pure helpers are exported for the tests.
import { api } from '@/api/client'
import type { Schemas } from '@/api/types'
import type { Key } from '@/i18n'

export type CalendarView = Schemas['calendar.View']
export type CalendarItem = Schemas['calendar.Item']

export async function getCalendar(query: { from?: string; to?: string; asset_id?: string } = {}): Promise<CalendarView> {
  return (await api.get<CalendarView>('/calendar', { query })).data
}

// itemKey is the item's French label key, with its subject: the diagnostic
// kind or the completion window.
export function itemKey(it: Pick<CalendarItem, 'kind' | 'ref'>): { key: Key; params: Record<string, string> } {
  switch (it.kind) {
    case 'diagnostic_expiry':
      return { key: 'calendar.kind.diagnostic_expiry', params: { what: it.ref ?? '' } }
    case 'completion_window':
      return { key: it.ref === 'heating' ? 'calendar.kind.completion_heating' : 'calendar.kind.completion_ten_day', params: {} }
    default:
      return { key: `calendar.kind.${it.kind ?? 'term_end'}` as Key, params: {} }
  }
}

// itemLink is where the obligation is dealt with.
export function itemLink(it: Pick<CalendarItem, 'kind' | 'lease_id' | 'asset_id'>): string {
  const lease = it.lease_id ? `/leases/${it.lease_id}` : ''
  switch (it.kind) {
    case 'diagnostic_expiry':
      return `/assets/${it.asset_id}/overview`
    case 'completion_window':
      return `${lease}/inventories`
    case 'deposit_deadline':
      return `${lease}/deposit`
    case 'insurance_certificate':
      return `${lease}/guarantees`
    default:
      return `${lease}/overview`
  }
}

// overdue counts the items past their date and still to do.
export function overdue(items: Pick<CalendarItem, 'status'>[]): number {
  return items.filter((x) => x.status === 'overdue').length
}
