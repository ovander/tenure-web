// Amounts and dates are formatted the French way in both languages
// (RENT-FE-001 §1): « 1 234,56 € », « 01/11/2026 ». Amounts are integer cents;
// they are formatted from an exact decimal string, never through a float.

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
const day = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' })
const dayTime = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
})

// money formats cents as euros, with a true minus sign (U+2212) when negative.
export function money(cents: number | bigint): string {
  const c = BigInt(cents)
  const neg = c < 0n
  const abs = neg ? -c : c
  const decimal = `${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`
  const text = euro.format(decimal as unknown as number) // Intl accepts an exact decimal string
  return neg ? `−${text}` : text
}

// date formats a YYYY-MM-DD date (a calendar day, no time zone) as DD/MM/YYYY.
export function date(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

// timestamp formats an RFC 3339 instant in Europe/Paris.
export function timestamp(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : dayTime.format(d)
}

// dayOf formats an instant as its Europe/Paris calendar day.
export function dayOf(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : day.format(d)
}

// currentPeriod is the Europe/Paris month of now, as YYYY-MM.
export function currentPeriod(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'Europe/Paris' }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  return `${y}-${m}`
}
