// A small model of tenure-api's charge rules (internal/charge): enough for the
// screens' paths of RENT-FE-001 flow 3, not a second implementation.
//   import     the uploaded CSV cannot be read here, so a mapping naming the
//              usual French columns turns state.syndicRows into draft charges;
//              any other mapping is « cannot be read »
//   allocate   the recoverable total shared by days of each lease of the asset
//              over the exercise; provisions = monthly provision × months
//   lines      If-Match on the line's version; editable only when allocated
//   issue      one RG statement per line; an applied provision updates the lease
//   cancel     a reason, a cancelling number per statement, charges released

export function chargeRoutes(ctx) {
  const { state, json, invalid, uuid } = ctx
  state.charges ??= []
  state.recons ??= []
  state.syndicRows ??= []

  const day = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / 86400000
  const lastOfMonth = (s) => new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)), 0)).getUTCDate() === Number(s.slice(8, 10))
  const ceilEuro = (c) => Math.ceil(c / 100) * 100
  const conflict = (res, type, title) => json(res, 409, { type, status: 409, title })
  const totalsOf = (r) => {
    const cs = state.charges.filter((c) => c.asset_id === r.asset_id && c.exercise_year === r.exercise_year && c.status === 'confirmed')
    const total = cs.reduce((s, c) => s + c.amount_cents, 0)
    const recoverable = cs.reduce((s, c) => s + c.recoverable_cents, 0)
    return { cs, total, recoverable }
  }

  function allocate(r) {
    const { cs, total, recoverable } = totalsOf(r)
    const exDays = day(r.exercise_end) - day(r.exercise_start) + 1
    const leases = state.leases.filter((l) => l.asset_ids.includes(r.asset_id) && l.state !== 'draft')
    let used = 0
    r.lines = leases.map((l) => {
      const from = Math.max(day(r.exercise_start), day(l.start_on))
      const to = Math.min(day(r.exercise_end), l.end_on ? day(l.end_on) : Infinity)
      const days = Math.max(0, to - from + 1)
      used += days
      const allocated = Math.floor((recoverable * days) / exDays)
      const months = Math.round(days / (exDays / 12))
      const provisions = (l.provision_cents ?? 0) * months
      const old = (r.lines ?? []).find((x) => x.lease_id === l.id)
      // As tenure-api: the new provision starts at the proposal.
      const proposed = ceilEuro(Math.ceil(allocated / 12))
      return {
        id: old?.id ?? uuid(), lease_id: l.id, days, allocated_cents: allocated, provisions_cents: provisions, balance_cents: allocated - provisions,
        spread: false, instalments: [], proposed_provision_cents: proposed, new_provision_cents: old?.new_provision_cents ?? proposed,
        apply_provision: old?.apply_provision ?? false, settlement: old?.settlement ?? (l.state === 'active' || l.state === 'notice' ? 'fee' : 'deposit'), version: (old?.version ?? 0) + 1,
      }
    })
    const vacancyDays = Math.max(0, exDays - used)
    r.charge_ids = cs.map((c) => c.id)
    r.totals = { exercise_days: exDays, total_cents: total, recoverable_cents: recoverable, non_recoverable_cents: total - recoverable, vacancy_days: vacancyDays, vacancy_cents: Math.floor((recoverable * vacancyDays) / exDays), cancellations: [] }
    r.state = 'allocated'
  }

  return function route(req, res, path, entry) {
    if (!path.startsWith('/charges') && !path.startsWith('/reconciliations')) return null
    const b = entry.body
    const q = new URL(req.url, 'http://x').searchParams
    if (req.method !== 'GET' && state.role !== 'owner') return json(res, 403, { type: 'auth/forbidden', status: 403, title: 'Accès refusé.' })

    if (path === '/charges') {
      if (req.method === 'GET') {
        const items = state.charges.filter((c) => (!q.get('asset_id') || c.asset_id === q.get('asset_id')) && (!q.get('year') || c.exercise_year === Number(q.get('year'))) && (!q.get('status') || c.status === q.get('status')))
        return json(res, 200, { items, total: items.length, page: 1, size: 100 })
      }
      const errors = []
      if (!b?.asset_id) errors.push({ field: 'asset_id', message: 'Le bien est obligatoire.' })
      if (!b?.label?.trim()) errors.push({ field: 'label', message: 'Le libellé est obligatoire.' })
      if (!(b?.amount_cents > 0)) errors.push({ field: 'amount_cents', message: 'Le montant doit être positif.' })
      if (b?.recoverable_cents < 0 || b?.recoverable_cents > b?.amount_cents) errors.push({ field: 'recoverable_cents', message: 'La part récupérable va de 0 au montant.' })
      if (errors.length) return invalid(res, errors)
      const c = { ...b, id: uuid(), source: 'manual', status: b.status ?? 'confirmed', exercise_year: b.exercise_year ?? Number(b.charged_on.slice(0, 4)), version: 1 }
      state.charges.push(c)
      return json(res, 201, c)
    }
    if (path === '/charges/import/syndic') {
      const m = b?.mapping ?? {}
      if (m.label !== 'Libellé' || m.amount !== 'Montant') return json(res, 422, { type: 'charge/import-invalid', status: 422, title: 'Le relevé du syndic ne peut pas être lu avec ce paramétrage.' })
      const rows = state.syndicRows.map((r) => ({ id: uuid(), asset_id: b.asset_id, category: 'copro_statement', label: r.label, amount_cents: r.amount, recoverable_cents: m.recoverable ? r.recoverable : 0,
        syndic_recoverable_cents: r.recoverable, charged_on: b.charged_on, exercise_year: b.exercise_year, document_id: b.statement_document_id, source: 'syndic', status: 'draft', version: 1 }))
      state.charges.push(...rows)
      return json(res, 201, rows)
    }
    let m = /^\/charges\/([^/]+)$/.exec(path)
    if (m) {
      const c = state.charges.find((x) => x.id === m[1])
      if (!c) return json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
      if (req.method === 'GET') return json(res, 200, c)
      if (entry.ifMatch !== `W/"${c.version}"`) return json(res, 412, { type: 'http/stale', status: 412, title: 'Version périmée.' })
      if (c.reconciliation_id) return conflict(res, 'charge/reconciled', 'Cette charge figure dans une régularisation émise ; elle ne se modifie plus.')
      if (b.recoverable_cents < 0 || b.recoverable_cents > b.amount_cents) return invalid(res, [{ field: 'recoverable_cents', message: 'La part récupérable va de 0 au montant.' }])
      Object.assign(c, b, { version: c.version + 1 })
      return json(res, 200, c)
    }
    if (path === '/reconciliations') {
      if (req.method === 'GET') {
        const items = state.recons.filter((r) => (!q.get('asset_id') || r.asset_id === q.get('asset_id')) && (!q.get('year') || r.exercise_year === Number(q.get('year'))))
        return json(res, 200, { items, total: items.length, page: 1, size: 100 })
      }
      if (!b?.exercise_start?.endsWith('-01') || !lastOfMonth(b?.exercise_end ?? '0000-01-01'))
        return json(res, 422, { type: 'reconciliation/exercise-invalid', status: 422, title: 'L’exercice commence un 1er du mois et finit un dernier jour du mois.' })
      const year = Number(b.exercise_end.slice(0, 4))
      if (state.recons.some((r) => r.asset_id === b.asset_id && r.exercise_year === year && r.state !== 'cancelled'))
        return conflict(res, 'reconciliation/exists', 'Une régularisation existe déjà pour ce bien et cet exercice.')
      const r = { id: uuid(), asset_id: b.asset_id, exercise_start: b.exercise_start, exercise_end: b.exercise_end, exercise_year: year, state: 'draft', lines: [], totals: {}, version: 1 }
      state.recons.push(r)
      return json(res, 201, r)
    }
    m = /^\/reconciliations\/([^/]+)(?:\/(transitions|lines\/([^/]+)))?$/.exec(path)
    if (m) {
      const r = state.recons.find((x) => x.id === m[1])
      if (!r) return json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
      if (!m[2]) return json(res, 200, r)
      if (m[3]) {
        const l = r.lines.find((x) => x.id === m[3])
        if (!l) return json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
        if (r.state !== 'allocated') return conflict(res, 'reconciliation/line-not-editable', 'Une ligne ne se modifie que sur une régularisation répartie, avant émission.')
        if (entry.ifMatch !== `W/"${l.version}"`) return json(res, 412, { type: 'http/stale', status: 412, title: 'Version périmée.' })
        const lease = state.leases.find((x) => x.id === l.lease_id)
        if (b.settlement === 'deposit' && (lease?.state === 'active' || lease?.state === 'notice'))
          return json(res, 422, { type: 'reconciliation/settlement-invalid', status: 422, title: 'Ce mode de règlement n’est pas possible pour ce bail.' })
        Object.assign(l, { apply_provision: !!b.apply_provision, new_provision_cents: b.new_provision_cents ?? l.new_provision_cents, settlement: b.settlement ?? l.settlement, version: l.version + 1 })
        return json(res, 200, l)
      }
      const action = b?.action
      const bad = () => conflict(res, 'reconciliation/invalid-transition', 'Cette étape n’est pas possible dans l’état actuel de la régularisation.')
      if (action === 'allocate') {
        if (!['draft', 'allocated'].includes(r.state)) return bad()
        if (state.charges.some((c) => c.asset_id === r.asset_id && c.exercise_year === r.exercise_year && c.status === 'draft'))
          return conflict(res, 'reconciliation/draft-charges', 'Des charges importées restent à valider pour cet exercice.')
        allocate(r)
      } else if (action === 'issue') {
        if (r.state !== 'allocated') return bad()
        r.lines.forEach((l, i) => Object.assign(l, { number: `RG-00000001-${r.exercise_year + 1}-${String(i + 1).padStart(4, '0')}`, document_id: uuid() }))
        for (const l of r.lines) {
          const lease = state.leases.find((x) => x.id === l.lease_id)
          if (l.apply_provision && lease) lease.provision_cents = l.new_provision_cents
        }
        for (const c of state.charges) if (r.charge_ids.includes(c.id)) c.reconciliation_id = r.id
        Object.assign(r, { state: 'issued', issued_at: new Date().toISOString() })
      } else if (action === 'settle') {
        if (r.state !== 'issued') return bad()
        r.state = 'settled'
      } else if (action === 'cancel') {
        if (!['issued', 'settled'].includes(r.state)) return bad()
        if (!b.reason?.trim()) return json(res, 422, { type: 'billing/reason-required', status: 422, title: 'Le motif de l’annulation est obligatoire.' })
        r.totals.cancellations = r.lines.map((l, i) => `AN-00000001-${r.exercise_year + 1}-${String(i + 1).padStart(4, '0')}`)
        for (const c of state.charges) if (c.reconciliation_id === r.id) delete c.reconciliation_id
        r.state = 'cancelled'
      } else return bad()
      r.version += 1
      return json(res, 200, r)
    }
    return json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
  }
}
