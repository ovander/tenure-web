// A small model of tenure-api's loans and journal (internal/loan,
// internal/ledger; Q-126 to Q-128): enough for the screens' paths, not a
// second implementation.
//   loans        state.loans, each with its instalments
//   preview      state.loanPreview, the table GET /loans/schedule returns
//   closed       state.closedYears: a loan with an instalment due in one is
//                refused (ledger/period-locked)
//   journal      state.journals[year]
//   exports      step_up: 401 until state.stepUpFresh; the FEC of an open
//                year is a 409
//   dashboard    state.dashboards[year]; its CSV is step_up too
export function ledgerRoutes(ctx) {
  const { state, json, invalid, uuid, record } = ctx
  const notFound = (res) => json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
  const years = (rows) => {
    const out = []
    for (const r of rows) {
      const y = Number(r.due_on.slice(0, 4))
      let g = out.find((x) => x.year === y)
      if (!g) out.push((g = { year: y, instalments: 0, principal_cents: 0, interest_cents: 0, insurance_cents: 0, remaining_cents: 0 }))
      g.instalments += 1
      g.principal_cents += r.principal_cents
      g.interest_cents += r.interest_cents
      g.insurance_cents += r.insurance_cents
      g.remaining_cents = r.remaining_cents
    }
    return out
  }
  const view = (l, rows) => {
    const v = { ...l, years: years(l.instalments), interest_cents: l.instalments.reduce((s, i) => s + i.interest_cents, 0),
      insurance_total_cents: l.instalments.reduce((s, i) => s + i.insurance_cents, 0), last_due_on: l.instalments.at(-1)?.due_on }
    if (!rows) delete v.instalments
    return v
  }
  const table = (b) => {
    if (b.instalments?.length) {
      let left = b.principal_cents
      const rows = b.instalments.map((i, n) => {
        left -= i.principal_cents
        return { seq: n + 1, ...i, remaining_cents: left }
      })
      return left === 0 ? rows : null
    }
    return (state.loanPreview?.instalments ?? []).map((i) => ({ ...i }))
  }
  return function route(req, res, path, entry) {
    const b = entry.body
    const q = new URL(req.url, 'http://x').searchParams
    if (!path.startsWith('/loans') && !path.startsWith('/ledger') && !path.startsWith('/dashboard')) return false
    if (path === '/dashboard') {
      const y = Number(q.get('year'))
      return json(res, 200, state.dashboards?.[y] ?? { year: y, as_of: `${y}-12-31`, partial: false, assets: [], portfolio: {}, months: [], year_to_date: {}, previous_year: {}, tax: { available: false, reason: 'tax/line-map-missing' } })
    }
    if (path === '/dashboard/assets.csv') {
      if (!state.stepUpFresh) return json(res, 401, { type: 'auth/step-up-required', status: 401, title: 'Une authentification forte récente est nécessaire.' })
      record('dashboard.export', 'dashboard', q.get('year'), null, {})
      res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="tableau-de-bord.csv"' })
      res.end('year,as_of,asset_id\n')
      return true
    }
    state.loans ??= []
    if (req.method !== 'GET' && state.role !== 'owner') return json(res, 403, { type: 'auth/forbidden', status: 403, title: 'Accès refusé.' })
    if (path === '/loans/schedule') return json(res, 200, view({ ...state.loanPreview, instalments: state.loanPreview?.instalments ?? [] }, true))
    if (path === '/loans') {
      if (req.method === 'GET') return json(res, 200, state.loans.filter((l) => !q.get('asset_id') || l.asset_id === q.get('asset_id')).map((l) => view(l, false)))
      if (!b?.label) return invalid(res, [{ field: 'label', message: 'Un libellé de 1 à 100 caractères est obligatoire.' }])
      const rows = table(b)
      if (!rows) return json(res, 422, { type: 'loan/schedule-invalid', status: 422, title: 'Le tableau d’amortissement de cet emprunt est incohérent.' })
      const l = { id: uuid(), asset_id: b.asset_id, label: b.label, lender: b.lender, principal_cents: b.principal_cents, annual_rate_ppm: b.annual_rate_ppm ?? null,
        term_months: rows.length, first_due_on: rows[0]?.due_on, insurance_cents: rows[0]?.insurance_cents ?? 0, source: b.instalments?.length ? 'imported' : 'computed', instalments: rows, version: 1 }
      state.loans.push(l)
      record('loan.create', 'loan', l.id, null, view(l, false))
      return json(res, 201, view(l, true))
    }
    let m = /^\/loans\/([^/]+)$/.exec(path)
    if (m) {
      const l = state.loans.find((x) => x.id === m[1])
      if (!l) return notFound(res)
      if (req.method === 'GET') return json(res, 200, view(l, true))
      if (entry.ifMatch !== `W/"${l.version}"`) return json(res, 412, { type: 'http/stale', status: 412, title: 'Version périmée.' })
      const rows = table(b)
      if (!rows) return json(res, 422, { type: 'loan/schedule-invalid', status: 422, title: 'Le tableau d’amortissement de cet emprunt est incohérent.' })
      const touched = [...l.instalments, ...rows].map((i) => Number(i.due_on.slice(0, 4)))
      const closed = touched.find((y) => (state.closedYears ?? []).includes(y))
      if (closed) return json(res, 409, { type: 'ledger/period-locked', status: 409, title: 'Cette année est close : son récapitulatif fiscal est émis, ses chiffres ne changent plus.', detail: `the year ${closed} is closed by its issued tax summary` })
      Object.assign(l, { label: b.label, lender: b.lender, principal_cents: b.principal_cents, annual_rate_ppm: b.annual_rate_ppm ?? null, instalments: rows,
        term_months: rows.length, first_due_on: rows[0]?.due_on, source: b.instalments?.length ? 'imported' : 'computed', version: l.version + 1 })
      record('loan.update', 'loan', l.id, null, view(l, false))
      return json(res, 200, view(l, true))
    }
    const year = Number(q.get('year'))
    if (path === '/ledger') return json(res, 200, state.journals?.[year] ?? { year, closed: false, entries: [], balances: [] })
    m = /^\/ledger\/(journal\.csv|fec\.txt|pack\.zip)$/.exec(path)
    if (m) {
      if (!state.stepUpFresh) return json(res, 401, { type: 'auth/step-up-required', status: 401, title: 'Une authentification forte récente est nécessaire.' })
      const closed = !!state.journals?.[year]?.closed
      if (m[1] === 'fec.txt' && !closed) return json(res, 409, { type: 'ledger/year-open', status: 409, title: 'Le FEC n’est produit que pour une année close.' })
      record('ledger.export', 'ledger', String(year), null, { kind: m[1] })
      res.writeHead(200, { 'Content-Type': m[1].endsWith('.zip') ? 'application/zip' : 'text/plain', 'Content-Disposition': `attachment; filename="${m[1]}"` })
      res.end(`export ${m[1]} ${year}`)
      return true
    }
    return notFound(res)
  }
}
