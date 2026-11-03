// A small model of tenure-api's billing and payment rules (internal/billing,
// internal/payment): enough for the screens' paths of RENT-FE-001 flow 2, not
// a second implementation.
//   run       rent + provision of every active or notice lease not yet billed
//             for the period, prorated by days when it starts or ends in it
//   cancel    a cancelling document and a reissued rent call; refused with a
//             receipt, or without a reason
//   arrears   live rent calls minus what payments applied to them
//   receipts  one per live rent call paid in full (billing.receipts)

export function billingRoutes(ctx) {
  const { state, json, invalid, uuid, record } = ctx
  state.billingDocs ??= []
  state.payments ??= []

  const daysIn = (period) => {
    const [y, m] = period.split('-').map(Number)
    return new Date(Date.UTC(y, m, 0)).getUTCDate()
  }
  const halfUp = (base, days, dim) => Math.floor((base * days * 2 + dim) / (2 * dim))
  const liveCall = (lease, period) => state.billingDocs.find((d) => d.lease_id === lease && d.period === period && d.kind === 'rent_call' && !d.cancelled_by)
  const paidOn = (docId) => state.payments.flatMap((p) => p.matches).filter((m) => m.billing_document_id === docId).reduce((s, m) => s + m.amount_cents, 0)
  const number = (prefix) => `${prefix}-00000001-2026-${String(state.billingDocs.filter((d) => d.number.startsWith(prefix)).length + 1).padStart(4, '0')}`

  function fee(l, period) {
    const dim = daysIn(period)
    const first = `${period}-01`
    const last = `${period}-${String(dim).padStart(2, '0')}`
    const from = l.start_on > first ? Number(l.start_on.slice(8)) : 1
    const to = l.end_on && l.end_on < last ? Number(l.end_on.slice(8)) : dim
    const days = Math.max(0, to - from + 1)
    const prorated = days < dim
    const lines = [
      { kind: 'rent', base_cents: l.rent_cents, amount_cents: prorated ? halfUp(l.rent_cents, days, dim) : l.rent_cents },
      { kind: 'provision', base_cents: l.provision_cents, amount_cents: prorated ? halfUp(l.provision_cents, days, dim) : l.provision_cents },
    ]
    return { lease_id: l.id, period, days_in_period: dim, occupied_days: days, prorated, carry_over_cents: 0, lines, total_cents: lines.reduce((s, x) => s + x.amount_cents, 0) }
  }
  function due(period) {
    const last = `${period}-${String(daysIn(period)).padStart(2, '0')}`
    return state.leases.filter((l) => (l.state === 'active' || l.state === 'notice') && l.start_on <= last && (!l.end_on || l.end_on >= `${period}-01`) && !liveCall(l.id, period))
  }
  function issueCall(f, generation = 1) {
    const d = { id: uuid(), kind: 'rent_call', lease_id: f.lease_id, period: f.period, number: number('AL'), generation, total_cents: f.total_cents,
      document_id: uuid(), issued_at: new Date().toISOString(), lines: f.lines.map((x) => ({ kind: x.kind, label: x.kind, amount_cents: x.amount_cents })) }
    state.billingDocs.push(d)
    record('billing.issue', 'billing_document', d.id, null, d)
    return d
  }
  function arrears(leaseId) {
    const items = state.billingDocs
      .filter((d) => d.lease_id === leaseId && d.kind === 'rent_call' && !d.cancelled_by)
      .map((d) => {
        const paid = paidOn(d.id)
        const l = state.leases.find((x) => x.id === leaseId)
        const dueOn = `${d.period}-${String(l?.due_day ?? 5).padStart(2, '0')}`
        return { billing_document_id: d.id, number: d.number, period: d.period, due_on: dueOn, total_cents: d.total_cents, paid_cents: paid, outstanding_cents: d.total_cents - paid, overdue: false, days_late: 0 }
      })
      .filter((x) => x.outstanding_cents > 0)
      .sort((a, b) => a.period.localeCompare(b.period))
    const out = items.reduce((s, x) => s + x.outstanding_cents, 0)
    return { lease_id: leaseId, items, outstanding_cents: out, overdue_cents: 0 }
  }
  function apply(p, lines) {
    const left = p.amount_cents - p.matches.reduce((s, m) => s + m.amount_cents, 0)
    const total = lines.reduce((s, m) => s + m.amount_cents, 0)
    if (total > left) return { type: 'payment/over-matched', title: 'Le total affecté dépasse le montant du paiement.' }
    for (const m of lines) {
      const it = arrears(p.lease_id).items.find((x) => x.billing_document_id === m.billing_document_id)
      if (!it) return { type: 'payment/not-a-rent-call', title: 'Un paiement ne s’affecte qu’à un appel de loyer en vigueur du même bail.' }
      if (m.amount_cents > it.outstanding_cents) return { type: 'payment/over-paid', title: 'Le montant affecté dépasse le reste dû de l’appel de loyer.' }
    }
    for (const m of lines) p.matches.push({ id: uuid(), billing_document_id: m.billing_document_id, amount_cents: m.amount_cents, created_at: new Date().toISOString() })
    return null
  }
  const auto = (p) => {
    let left = p.amount_cents - p.matches.reduce((s, m) => s + m.amount_cents, 0)
    const lines = []
    for (const it of arrears(p.lease_id).items) {
      if (left <= 0) break
      const part = Math.min(left, it.outstanding_cents)
      lines.push({ billing_document_id: it.billing_document_id, amount_cents: part })
      left -= part
    }
    return lines
  }
  const view = (p) => {
    const matched = p.matches.reduce((s, m) => s + m.amount_cents, 0)
    return { ...p, matched_cents: matched, unmatched_cents: p.amount_cents - matched }
  }

  return function route(req, res, path, entry) {
    const b = entry.body
    const q = new URL(req.url, 'http://x').searchParams
    const write = req.method !== 'GET'
    const owned = path.startsWith('/billing') || path.startsWith('/payments') || /^\/leases\/[^/]+\/arrears$/.test(path) || path === '/jobs/billing.receipts/trigger'
    if (!owned) return null
    if (write && state.role !== 'owner') return json(res, 403, { type: 'auth/forbidden', status: 403, title: 'Accès refusé.' })

    if (path === '/billing/runs') {
      if (!/^\d{4}-\d{2}$/.test(b?.period ?? '')) return invalid(res, [{ field: 'period', message: 'Période attendue au format AAAA-MM.' }])
      const fees = due(b.period).map((l) => fee(l, b.period))
      if (b.dry_run) return json(res, 200, { dry_run: true, fees })
      fees.forEach((f) => issueCall(f))
      return json(res, 201, { dry_run: false, fees, run: { id: uuid(), job: 'billing.monthly', period: b.period, status: 'succeeded' } })
    }
    if (path === '/billing/documents') {
      const items = state.billingDocs.filter((d) => (!q.get('period') || d.period === q.get('period')) && (!q.get('lease_id') || d.lease_id === q.get('lease_id')))
      return json(res, 200, { items, total: items.length, page: 1, size: 100 })
    }
    let m = /^\/billing\/documents\/([^/]+)\/cancel$/.exec(path)
    if (m) {
      const d = state.billingDocs.find((x) => x.id === m[1])
      if (!d) return json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
      if (!b?.reason?.trim()) return json(res, 422, { type: 'billing/reason-required', status: 422, title: 'Le motif de l’annulation est obligatoire.' })
      if (d.cancelled_by) return json(res, 409, { type: 'billing/already-cancelled', status: 409, title: 'Ce document est déjà annulé.' })
      if (state.billingDocs.some((x) => x.kind === 'receipt' && x.cancels_id === undefined && x.receipt_for === d.id))
        return json(res, 409, { type: 'billing/receipt-issued', status: 409, title: 'Une quittance a été délivrée pour cet appel de loyer ; il ne peut plus être annulé.' })
      const c = { id: uuid(), kind: 'cancellation', lease_id: d.lease_id, period: d.period, number: number('AN'), generation: d.generation, total_cents: -d.total_cents, cancels_id: d.id, document_id: uuid(), issued_at: new Date().toISOString(), reason: b.reason }
      state.billingDocs.push(c)
      d.cancelled_by = c.id
      const l = state.leases.find((x) => x.id === d.lease_id)
      const again = l ? issueCall(fee(l, d.period), d.generation + 1) : undefined
      return json(res, 201, { cancellation: { ...c, billing_document_id: c.id }, reissued: again ? { ...again, billing_document_id: again.id } : undefined })
    }
    m = /^\/leases\/([^/]+)\/arrears$/.exec(path)
    if (m) return json(res, 200, arrears(m[1]))
    if (path === '/payments') {
      if (req.method === 'GET') {
        const items = state.payments.map(view).filter((p) => (!q.get('lease_id') || p.lease_id === q.get('lease_id')) && (q.get('unmatched') !== 'true' || p.unmatched_cents > 0))
        return json(res, 200, { items, total: items.length, page: 1, size: 50 })
      }
      const errors = []
      const l = state.leases.find((x) => x.id === b?.lease_id)
      if (!l) errors.push({ field: 'lease_id', message: 'Le bail est obligatoire.' })
      if (!(b?.amount_cents > 0)) errors.push({ field: 'amount_cents', message: 'Le montant doit être positif.' })
      if (!b?.paid_on) errors.push({ field: 'paid_on', message: 'La date du paiement est obligatoire.' })
      if (errors.length) return invalid(res, errors)
      if (l.state === 'draft') return json(res, 409, { type: 'payment/lease-draft', status: 409, title: 'Un bail en brouillon ne reçoit pas de paiement.' })
      const p = { id: uuid(), lease_id: b.lease_id, amount_cents: b.amount_cents, paid_on: b.paid_on, method: b.method, reference: b.reference, version: 1, matches: [] }
      state.payments.push(p)
      if (b.auto_match) apply(p, auto(p))
      return json(res, 201, view(p))
    }
    m = /^\/payments\/([^/]+)\/matches$/.exec(path)
    if (m) {
      const p = state.payments.find((x) => x.id === m[1])
      if (!p) return json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
      const lines = b?.auto ? auto(p) : b?.matches ?? []
      if (!lines.length) return json(res, 409, { type: 'payment/nothing-to-match', status: 409, title: 'Aucun appel de loyer n’attend de paiement sur ce bail.' })
      const err = apply(p, lines)
      if (err) return json(res, 422, { ...err, status: 422 })
      return json(res, 200, view(p))
    }
    if (path === '/jobs/billing.receipts/trigger') {
      for (const d of state.billingDocs.filter((x) => x.kind === 'rent_call' && !x.cancelled_by)) {
        if (paidOn(d.id) >= d.total_cents && !state.billingDocs.some((x) => x.receipt_for === d.id)) {
          const r = { id: uuid(), kind: 'receipt', lease_id: d.lease_id, period: d.period, number: number('QL'), generation: 1, total_cents: d.total_cents, receipt_for: d.id, document_id: uuid(), issued_at: new Date().toISOString() }
          state.billingDocs.push(r)
        }
      }
      return json(res, 201, { id: uuid(), job: 'billing.receipts', status: 'succeeded' })
    }
    return json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
  }
}
