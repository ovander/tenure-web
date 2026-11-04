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

// parisToday is the Europe/Paris calendar day of now, as YYYY-MM-DD.
export function parisToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Paris' }).format(now)
}

// Two-decimal quantities kept as integers: euros in cents, surfaces in
// hundredths of m². They are typed and shown the French way, « 1 234,56 »,
// and converted by string, never through a float (CLAUDE.md money rule).

// hundredths formats an integer count of hundredths as « 1 234,56 ».
export function hundredths(v: number | bigint): string {
  const c = BigInt(v)
  const neg = c < 0n
  const abs = neg ? -c : c
  const int = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const text = `${int},${(abs % 100n).toString().padStart(2, '0')}`
  return neg ? `−${text}` : text
}

// parseHundredths reads « 1 234,5 », « 1234.50 » or « 12 » as hundredths
// (123450, 123450, 1200). It returns null for an empty field and NaN for text
// that is not such a number or has more than two decimals.
export function parseHundredths(text: string): number | null {
  const s = text.replace(/[\s  €m²]/g, '').replace('−', '-')
  if (s === '') return null
  const m = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/.exec(s)
  if (!m) return Number.NaN
  const cents = BigInt(m[2]!) * 100n + BigInt((m[3] ?? '').padEnd(2, '0') || '0')
  const v = m[1] ? -cents : cents
  return v > BigInt(Number.MAX_SAFE_INTEGER) || v < -BigInt(Number.MAX_SAFE_INTEGER) ? Number.NaN : Number(v)
}

// surface formats hundredths of m² as « 45,50 m² ».
export function surface(h: number | null | undefined): string {
  return h == null ? '' : `${hundredths(h)} m²`
}

// basisPoints formats a share in basis points as « 50 % » or « 33,33 % ».
export function basisPoints(bp: number): string {
  const text = hundredths(bp)
  return `${text.endsWith(',00') ? text.slice(0, -3) : text} %`
}

// isoDay turns a picked local calendar day into YYYY-MM-DD, without the UTC
// shift toISOString would add.
export function isoDay(d: Date | null | undefined): string | undefined {
  if (!d || Number.isNaN(d.getTime())) return undefined
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// localDay is the inverse of isoDay: midnight local time of a YYYY-MM-DD day.
export function localDay(iso: string | null | undefined): Date | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}
