// Defaults of a new lease (owner feedback, RENT-FE-001 §1): each proposed
// value follows its source until the user changes the field. Legal values
// (terms, deposit caps, the IRL) come from the API's parameters; without one
// there is no default.
import type { LeaseKind } from './store'
import type { LeaseTerms, Range } from '@/features/params/store'

// firstOfNextMonth is the 1st of the month after now, in Europe/Paris.
export function firstOfNextMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'Europe/Paris' }).formatToParts(now)
  const y = Number(parts.find((p) => p.type === 'year')?.value)
  const m = Number(parts.find((p) => p.type === 'month')?.value)
  const [ny, nm] = m === 12 ? [y + 1, 1] : [y, m + 1]
  return `${ny}-${String(nm).padStart(2, '0')}-01`
}

// monthOf is the month (1–12) of a YYYY-MM-DD day.
export function monthOf(iso: string | null | undefined): number | undefined {
  const m = iso ? /^\d{4}-(\d{2})-\d{2}$/.exec(iso) : null
  return m ? Number(m[1]) : undefined
}

// termFor is the standard term of a lease kind: the legal parameter's
// unfurnished or furnished term, the longest mobility term, none for a box
// (no statutory term).
export function termFor(kind: LeaseKind | undefined, terms?: LeaseTerms, mobility?: Range): number | undefined {
  switch (kind) {
    case 'unfurnished':
      return terms?.unfurnished
    case 'furnished':
      return terms?.furnished
    case 'mobility':
      return mobility?.max
    default:
      return undefined
  }
}

// depositFor is the rent times the deposit cap of the kind (none for a box,
// whose deposit is a free agreement), or undefined without a rent or a cap.
export function depositFor(kind: LeaseKind | undefined, rentCents: number | null | undefined, capMonths?: number): number | undefined {
  if (kind === 'box' || rentCents == null || capMonths == null) return undefined
  return rentCents * capMonths
}

// Suggestions remembers the value last proposed for each field: a new
// proposal replaces the field only while it is empty or still holds the last
// proposal, so the user's own value is never overwritten.
export class Suggestions<T extends object> {
  private last = new Map<keyof T, unknown>()

  propose<K extends keyof T>(form: T, field: K, value: T[K] | undefined): void {
    const current = form[field]
    const untouched = current === undefined || current === null || current === '' || current === this.last.get(field)
    if (!untouched) return
    if (value === undefined) {
      if (this.last.has(field)) {
        form[field] = undefined as T[K]
        this.last.delete(field)
      }
      return
    }
    form[field] = value
    this.last.set(field, value)
  }
}
