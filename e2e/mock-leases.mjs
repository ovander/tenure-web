// A small model of tenure-api's lease rules (internal/lease): enough for the
// screens' paths of RENT-FE-001 flow 1, not a second implementation.
//   generation blocker  a dwelling without a DPE diagnostic
//   activation blockers no generated contract, no signed copy, no entry inventory
//   close               refused while a deposit is still held
//   warnings            state.leaseWarnings[lease id], as set by the test
//   amendments          a current lease only; a rent, a tenant or a box added (Q-71)
//   revision            state.revisions[lease id], as set by the test; none ⇒ 409
const transitions = { draft: { activate: 'active' }, active: { notice: 'notice' }, notice: { end: 'ended' }, ended: { close: 'closed' } }

import { draftCapture, draftExit } from './mock-inventory.mjs'
export function leaseRoutes(ctx) {
  const { state, json, invalid, uuid, record } = ctx

  function blockers(l) {
    const generation = []
    for (const id of l.asset_ids) {
      const a = state.assets.find((x) => x.id === id)
      if (a && a.kind !== 'box' && !state.diagnostics.some((d) => d.asset_id === id && d.kind === 'dpe'))
        generation.push({ type: 'lease/diagnostic-missing', title: 'Le diagnostic de performance énergétique (DPE) manque.', detail: `asset ${a.id}: dpe`, asset_id: a.id, diagnostic: 'dpe' })
    }
    const contract = state.leaseDocs.filter((d) => d.lease_id === l.id && d.kind === 'contract').at(-1)
    const activation = []
    if (!contract) activation.push({ type: 'lease/contract-missing', title: 'Le contrat n’a pas été généré.' })
    else if (!state.uploads.some((u) => u.signs_document_id === contract.document_id))
      activation.push({ type: 'lease/contract-not-signed', title: 'L’exemplaire signé du contrat n’a pas été déposé.' })
    if (!state.inventories.some((i) => i.lease_id === l.id && i.kind === 'entry'))
      activation.push({ type: 'lease/entry-inventory-missing', title: 'L’état des lieux d’entrée manque.' })
    const warnings = [...(state.leaseWarnings?.[l.id] ?? [])]
    if (Object.values(state.captures ?? {}).some((c) => c.lease_id === l.id && (c.completions ?? []).some((x) => x.decision === 'pending')))
      warnings.push({ type: 'inventory/completion-pending', title: 'Une demande de complément de l’état des lieux d’entrée attend votre décision.' })
    return l.state === 'draft' ? { generation, activation, warnings } : { generation: [], activation: [], warnings }
  }
  const stale = (res) => json(res, 412, { type: 'http/stale', status: 412, title: 'Version périmée.' })
  const conflict = (res, type, title) => json(res, 409, { type, status: 409, title })

  return function route(req, res, path, entry) {
    const b = entry.body
    const q = new URL(req.url, 'http://x').searchParams
    const write = req.method !== 'GET'
    if (write && state.role !== 'owner') return json(res, 403, { type: 'auth/forbidden', status: 403, title: 'Accès refusé.' })

    if (path === '/tenants') {
      if (req.method === 'GET') return json(res, 200, { items: state.tenants, total: state.tenants.length, page: 1, size: 100 })
      if (!b?.names?.length) return invalid(res, [{ field: 'names', message: 'Au moins un nom est obligatoire.' }])
      const x = { ...b, id: uuid(), version: 1 }
      state.tenants.push(x)
      return json(res, 201, x)
    }
    let tm = /^\/tenants\/([^/]+)$/.exec(path)
    if (tm) {
      const x = state.tenants.find((y) => y.id === tm[1])
      if (!x) return json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
      if (req.method === 'GET') return json(res, 200, x)
      if (entry.ifMatch !== `W/"${x.version}"`) return stale(res)
      if (!b?.names?.length) return invalid(res, [{ field: 'names', message: 'Au moins un nom est obligatoire.' }])
      Object.assign(x, b, { version: x.version + 1 })
      return json(res, 200, x)
    }
    if (path === '/leases') {
      if (req.method === 'GET') {
        const items = state.leases.filter((l) => !q.get('asset_id') || l.asset_ids.includes(q.get('asset_id')))
        return json(res, 200, { items, total: items.length, page: 1, size: 50 })
      }
      const errors = []
      if (!b?.asset_ids?.length) errors.push({ field: 'asset_ids', message: 'Au moins un bien est obligatoire.' })
      if (!b?.tenants?.length) errors.push({ field: 'tenants', message: 'Au moins un locataire est obligatoire.' })
      if (!b?.start_on) errors.push({ field: 'start_on', message: 'La date de début est obligatoire.' })
      if (b?.irl_ref_quarter && !/^\d{4}-Q[1-4]$/.test(b.irl_ref_quarter)) errors.push({ field: 'irl_ref_quarter', message: 'Trimestre attendu au format AAAA-Qn (2025-Q2).' })
      if (errors.length) return invalid(res, errors)
      const l = { ...b, id: uuid(), state: 'draft', version: 1 }
      state.leases.push(l)
      record('lease.create', 'lease', l.id, null, l)
      return json(res, 201, l)
    }
    // An asset's vacancy (tenure-api Q-119): state.vacancies[asset id], as set
    // by the test; none ⇒ nothing known.
    const vm = /^\/assets\/([^/]+)\/vacancies$/.exec(path)
    if (vm && req.method === 'GET') return json(res, 200, state.vacancies?.[vm[1]] ?? { asset_id: vm[1], since: '', periods: [], days_by_year: {} })
    // The rent re-evaluation at renewal (tenure-api Q-120), modelled on
    // internal/lease/reevaluation.go: three references, the lead time of six
    // months, thirds (sixths above 10 %), the zone tendue cap at half the gap.
    const rm = /^\/leases\/([^/]+)\/(?:renewals|renewal\/letter|renewals\/([^/]+)\/(reception|answer|steps))$/.exec(path)
    if (rm) {
      const l = state.leases.find((x) => x.id === rm[1])
      if (!l) return json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
      state.renewals ??= {}
      const list = (state.renewals[l.id] ??= [])
      if (req.method === 'GET') return json(res, 200, list)
      const bad = (type, title) => json(res, 422, { type, status: 422, title })
      const iso = (d) => d.toISOString().slice(0, 10)
      const at = (ymd) => new Date(`${ymd}T00:00:00Z`)
      const addMonths = (ymd, n) => {
        const d = at(ymd)
        const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
        t.setUTCDate(Math.min(d.getUTCDate(), new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()))
        return iso(t)
      }
      const addDays = (ymd, n) => iso(new Date(at(ymd).getTime() + n * 86400000))
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
      if (!rm[2]) {
        if (l.kind !== 'unfurnished' || l.state !== 'active') return bad('lease/reevaluation-not-allowed', 'Ce bail ne permet pas de réévaluer le loyer à son renouvellement.')
        const refs = b.references ?? []
        if (refs.length < (b.large_agglomeration ? 6 : 3) || refs.some((r) => !r.address || !(r.rent_cents > 0)) || !(b.proposed_rent_cents > l.rent_cents))
          return bad('lease/reevaluation-invalid', 'La proposition de nouveau loyer est incomplète.')
        let renewal
        for (let k = 1; k < 200; k++) {
          renewal = addMonths(l.start_on, l.term_months * k)
          if (addDays(addMonths(renewal, -6), -1) >= today) break
        }
        const mean = Math.floor(refs.reduce((x, r) => x + r.rent_cents, 0) / refs.length)
        const tense = l.asset_ids.some((id) => state.assets.find((a) => a.id === id)?.tense_zone)
        const terms = { renewal_on: renewal, latest_receipt_on: addDays(addMonths(renewal, -6), -1), current_rent_cents: l.rent_cents, references_mean_cents: mean }
        if (tense) {
          terms.cap_cents = l.rent_cents + Math.floor((mean - l.rent_cents) / 2)
          if (b.proposed_rent_cents > terms.cap_cents) return bad('lease/reevaluation-above-cap', 'Le loyer proposé dépasse la hausse autorisée en zone tendue.')
        }
        terms.increase_cents = b.proposed_rent_cents - l.rent_cents
        terms.increase_bp = Math.floor((terms.increase_cents * 10000) / l.rent_cents)
        const n = terms.increase_bp > 1000 || l.term_months >= 72 ? 6 : 3
        terms.steps = Array.from({ length: n }, (_, i) => ({ from: addMonths(renewal, 12 * i), rent_cents: l.rent_cents + Math.floor((terms.increase_cents * (i + 1)) / n) }))
        const prev = list.find((r) => r.renewal_on === renewal)
        if (prev && prev.status !== 'prepared') return conflict(res, 'lease/reevaluation-exists', 'Une proposition de nouveau loyer a déjà été remise pour ce renouvellement.')
        if (b.dry_run) return json(res, 200, { terms })
        const doc = { id: uuid(), lease_id: l.id, kind: 'renewal_proposal', number: `PR-00000001-2026-${String(state.leaseDocs.filter((d) => d.kind === 'renewal_proposal').length + 1).padStart(4, '0')}`, document_id: uuid(), issued_at: new Date().toISOString(), sha256: 'e'.repeat(64), lease_version: l.version }
        state.leaseDocs.push(doc)
        const proposal = { ...b }
        delete proposal.dry_run
        const r = { id: prev?.id ?? uuid(), lease_id: l.id, renewal_on: renewal, status: 'prepared', proposal, terms, document_id: doc.document_id, steps_applied: 0, steps_due: 0, version: (prev?.version ?? 0) + 1 }
        if (prev) Object.assign(prev, r)
        else list.unshift(r)
        record('lease.renewal_letter', 'lease_renewal', r.id, null, r)
        return json(res, 200, { terms, letter: doc, renewal: r })
      }
      const r = list.find((x) => x.id === rm[2])
      if (!r) return json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
      if (b.version !== r.version) return stale(res)
      const notAt = () => conflict(res, 'lease/reevaluation-state', 'Cette proposition n’en est pas à cette étape.')
      if (rm[3] === 'reception') {
        if (r.status !== 'prepared') return notAt()
        if (!b.received_on) return invalid(res, [{ field: 'received_on', message: 'La date de réception est obligatoire.' }])
        if (b.received_on > r.terms.latest_receipt_on) return bad('lease/reevaluation-too-late', 'La proposition arrive trop tard pour ce renouvellement.')
        Object.assign(r, { status: 'received', received_on: b.received_on, delivery: b.delivery, tracking_ref: b.tracking_ref, version: r.version + 1 })
        return json(res, 200, r)
      }
      if (rm[3] === 'answer') {
        if (r.status !== 'received') return notAt()
        Object.assign(r, { status: b.answer, answered_on: b.answered_on, version: r.version + 1 })
        r.steps_due = b.answer === 'accepted' ? r.terms.steps.filter((x) => x.from <= today).length : 0
        return json(res, 200, r)
      }
      if (r.status !== 'accepted') return notAt()
      if (!r.steps_due) return bad('lease/reevaluation-no-step-due', 'Aucun palier de hausse n’est échu.')
      const due = r.terms.steps.slice(r.steps_applied, r.steps_applied + r.steps_due)
      let prevRent = r.steps_applied ? r.terms.steps[r.steps_applied - 1].rent_cents : r.terms.current_rent_cents
      for (const d of due) { l.rent_cents += d.rent_cents - prevRent; prevRent = d.rent_cents }
      l.version += 1
      Object.assign(r, { steps_applied: r.steps_applied + due.length, steps_due: 0, version: r.version + 1 })
      record('lease.renewal_steps', 'lease', l.id, null, { rent_cents: l.rent_cents })
      return json(res, 200, { applied: due, rent_cents: l.rent_cents, renewal: r, lease: l })
    }
    // The notice (tenure-api Q-118), modelled on internal/lease/notice.go.
    let nm = /^\/leases\/([^/]+)\/notice(\/letter)?$/.exec(path)
    if (nm) {
      const l = state.leases.find((x) => x.id === nm[1])
      if (!l) return json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
      state.notices ??= {}
      if (req.method === 'GET') {
        if (state.role === 'accountant') return json(res, 403, { type: 'auth/forbidden', status: 403, title: 'Accès refusé.' })
        return state.notices[l.id] ? json(res, 200, state.notices[l.id]) : json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
      }
      const bad = (type, title) => json(res, 422, { type, status: 422, title })
      const iso = (d) => d.toISOString().slice(0, 10)
      const at = (ymd) => new Date(`${ymd}T00:00:00Z`)
      const addMonths = (ymd, n) => {
        const d = at(ymd)
        const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
        t.setUTCDate(Math.min(d.getUTCDate(), new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()))
        return iso(t)
      }
      const addDays = (ymd, n) => iso(new Date(at(ymd).getTime() + n * 86400000))
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
      const termEnd = (on) => { for (let k = 1; k < 200; k++) { const e = addDays(addMonths(l.start_on, l.term_months * k), -1); if (e >= on) return e } }
      const ownerTerms = (on) => {
        const months = l.kind === 'furnished' ? 3 : 6
        let end = termEnd(on)
        let latest = addDays(addMonths(addDays(end, 1), -months), -1)
        if (on > latest) {
          end = termEnd(addDays(end, 1))
          latest = addDays(addMonths(addDays(end, 1), -months), -1)
          return { months, end_on: end, latest_receipt_on: latest, warnings: [], late: true }
        }
        return { months, end_on: end, latest_receipt_on: latest, warnings: [] }
      }
      if (nm[2]) {
        if (l.state !== 'active') return conflict(res, 'lease/invalid-transition', 'Cette transition n’est pas possible dans l’état actuel du bail.')
        if (!['unfurnished', 'furnished'].includes(l.kind)) return bad('lease/notice-not-allowed', 'Ce bail ne permet pas ce congé.')
        if (b.protected_tenant === 'yes') return bad('lease/notice-protected-tenant', 'Un locataire protégé ne peut recevoir congé sans offre de relogement.')
        const ok = ['no', 'rehousing_offered'].includes(b.protected_tenant) && (b.reason !== 'sale' || b.price_cents > 0) &&
          (b.reason !== 'repossession' || (b.beneficiary?.name && b.beneficiary?.address && b.beneficiary?.relationship)) && (b.reason !== 'legitimate' || b.grounds)
        if (!ok) return bad('lease/notice-invalid', 'Le congé est incomplet ou son motif n’est pas reconnu.')
        const { late, ...terms } = ownerTerms(today)
        void late
        if (b.dry_run) return json(res, 200, { terms })
        const n = state.leaseDocs.filter((d) => d.kind === 'owner_notice').length + 1
        const doc = { id: uuid(), lease_id: l.id, kind: 'owner_notice', number: `CG-00000001-2026-${String(n).padStart(4, '0')}`, document_id: uuid(), issued_at: new Date().toISOString(), sha256: 'f'.repeat(64), lease_version: l.version, ground: { ...b, dry_run: undefined } }
        state.leaseDocs.push(doc)
        record('lease.notice_letter', 'lease', l.id, null, doc)
        return json(res, 200, { terms, letter: doc })
      }
      if (l.state !== 'active') return conflict(res, 'lease/invalid-transition', 'Cette transition n’est pas possible dans l’état actuel du bail.')
      if (state.notices[l.id]) return conflict(res, 'lease/notice-exists', 'Un congé est déjà enregistré pour ce bail.')
      if (!b.received_on) return invalid(res, [{ field: 'received_on', message: 'La date de réception est obligatoire.' }])
      let terms, ground
      if (b.given_by === 'owner') {
        const letter = state.leaseDocs.find((d) => d.kind === 'owner_notice' && d.document_id === b.document_id && d.lease_id === l.id)
        if (!letter) return bad('lease/notice-letter-missing', 'Le congé du bailleur doit reprendre une lettre de congé générée pour ce bail.')
        const { late, ...t } = ownerTerms(b.received_on)
        if (late) return bad('lease/notice-too-late', 'Le congé du bailleur arrive trop tard pour ce terme.')
        terms = t
        ground = letter.ground
      } else {
        const tense = l.asset_ids.some((id) => state.assets.find((a) => a.id === id)?.tense_zone)
        const reduced = l.kind === 'unfurnished' && (!!b.reason || tense)
        const months = l.kind === 'unfurnished' && !reduced ? 3 : 1
        const same = addMonths(b.received_on, months)
        terms = { months, end_on: same.slice(8) !== b.received_on.slice(8) ? same : addDays(same, -1), reduced: reduced || undefined, warnings: b.reason === 'tense_zone' && !tense ? ['tense_zone_not_flagged'] : [] }
        ground = { reason: b.reason }
      }
      if (b.dry_run) return json(res, 200, { terms })
      const before = { ...l }
      const notice = { id: uuid(), lease_id: l.id, given_by: b.given_by, ground, received_on: b.received_on, months: terms.months, end_on: terms.end_on,
        delivery: b.delivery, sent_on: b.sent_on, tracking_ref: b.tracking_ref, document_id: b.document_id }
      state.notices[l.id] = notice
      Object.assign(l, { state: 'notice', end_on: terms.end_on, version: l.version + 1 })
      record('lease.notice', 'lease', l.id, before, { ...l })
      return json(res, 200, { terms, notice, lease: l })
    }
    let m = /^\/leases\/([^/]+)(?:\/([a-z]+))?$/.exec(path)
    if (m) {
      const l = state.leases.find((x) => x.id === m[1])
      if (!l) return json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
      switch (m[2]) {
        case undefined:
          if (req.method === 'GET') return json(res, 200, l)
          if (l.state !== 'draft') return conflict(res, 'lease/not-editable', 'Seul un bail en brouillon peut être modifié ; utilisez un avenant.')
          if (entry.ifMatch !== `W/"${l.version}"`) return stale(res)
          {
            const before = { ...l }
            Object.assign(l, b, { version: l.version + 1 })
            record('lease.update', 'lease', l.id, before, { ...l })
          }
          return json(res, 200, l)
        case 'blockers':
          return json(res, 200, blockers(l))
        case 'terms':
          // The terms (tenure-api Q-119): state.terms[lease id], as set by the test.
          return json(res, 200, state.terms?.[l.id] ?? { terms: [], renews: true })
        case 'documents':
          return json(res, 200, state.leaseDocs.filter((d) => d.lease_id === l.id))
        case 'contract': {
          const bl = blockers(l)
          if (bl.generation.length) return json(res, 422, { type: bl.generation[0].type, status: 422, title: bl.generation[0].title })
          const doc = { id: uuid(), lease_id: l.id, kind: 'contract', number: `CT-00000001-2026-${String(state.leaseDocs.length + 1).padStart(4, '0')}`, document_id: uuid(), issued_at: new Date().toISOString(), sha256: 'a'.repeat(64), lease_version: l.version }
          state.leaseDocs.push(doc)
          return json(res, 201, doc)
        }
        case 'guarantees':
          if (req.method === 'GET') return json(res, 200, state.guarantees.filter((g) => g.lease_id === l.id))
          if (b.kind === 'surety' && (!b.guarantor?.name || !b.guarantor?.address)) return invalid(res, [{ field: 'guarantor', message: 'Une caution doit avoir un nom et une adresse.' }])
          {
            const g = { ...b, id: uuid(), lease_id: l.id, version: 1 }
            state.guarantees.push(g)
            return json(res, 201, g)
          }
        case 'inventories':
          if (req.method === 'GET') return json(res, 200, state.inventories.filter((i) => i.lease_id === l.id))
          if (b.mode === 'amicable' && b.kind === 'exit') {
            if (state.inventories.some((i) => i.lease_id === l.id && i.kind === 'exit')) return json(res, 409, { type: 'inventory/already-recorded', status: 409, title: 'Cet état des lieux est déjà enregistré.' })
            const entry = state.inventories.find((i) => i.lease_id === l.id && i.kind === 'entry' && i.state === 'issued')
            if (!entry) return json(res, 409, { type: 'inventory/exit-without-entry', status: 409, title: 'L’état des lieux de sortie part de celui d’entrée : il faut d’abord un état des lieux d’entrée émis.' })
            const i = { id: uuid(), lease_id: l.id, kind: 'exit', mode: 'amicable', state: 'draft' }
            draftExit(state, i, entry, uuid)
            state.inventories.push(i)
            return json(res, 201, i)
          }
          if (b.mode === 'amicable') {
            if (state.inventories.some((i) => i.lease_id === l.id && i.kind === 'entry')) return json(res, 409, { type: 'inventory/already-recorded', status: 409, title: 'Cet état des lieux est déjà enregistré.' })
            const i = { id: uuid(), lease_id: l.id, kind: 'entry', mode: 'amicable', state: 'draft' }
            if (!draftCapture(state, i, l, uuid)) return json(res, 422, { type: 'inventory/layout-missing', status: 422, title: 'Un bien du bail n’a pas encore de plan de pièces : créez-le avant l’état des lieux.' })
            state.inventories.push(i)
            return json(res, 201, i)
          }
          if (!b.done_on) return invalid(res, [{ field: 'done_on', message: 'La date de l’état des lieux est obligatoire.' }])
          {
            const i = { ...b, mode: 'upload', state: 'issued', id: uuid(), lease_id: l.id }
            state.inventories.push(i)
            return json(res, 201, i)
          }
        case 'amendments': {
          if (l.state !== 'active' && l.state !== 'notice') return conflict(res, 'lease/amendment-not-current', 'Un avenant ne concerne qu’un bail en cours.')
          const errors = []
          if (!b?.effective_on) errors.push({ field: 'effective_on', message: 'La date d’effet est obligatoire.' })
          if (b?.kind === 'rent' && b.rent_cents == null) errors.push({ field: 'rent_cents', message: 'Le nouveau loyer est obligatoire.' })
          if (b?.kind === 'tenant_add' && !b.tenant) errors.push({ field: 'tenant', message: 'Le locataire ajouté est obligatoire.' })
          if (b?.kind === 'asset_add' && !b.asset_id) errors.push({ field: 'asset_id', message: 'Le box ajouté est obligatoire.' })
          if (errors.length) return invalid(res, errors)
          const refused = (detail) => json(res, 422, { type: 'lease/amendment-invalid', status: 422, title: 'L’avenant demandé n’est pas valide.', detail })
          if (b.effective_on < l.start_on) return refused('effective_on before the lease start')
          const before = { ...l }
          if (b.kind === 'rent') {
            if (b.rent_cents === l.rent_cents) return refused('same rent')
            l.rent_cents = b.rent_cents
          } else if (b.kind === 'tenant_add') {
            if (l.tenants.some((x) => x.tenant_id === b.tenant.tenant_id)) return refused('tenant already on the lease')
            l.tenants = [...l.tenants, { solidary: true, ...b.tenant }]
          } else {
            const box = state.assets.find((a) => a.id === b.asset_id)
            if (!box || box.kind !== 'box' || l.asset_ids.includes(b.asset_id)) return refused('only a box of the portfolio can be added')
            l.asset_ids = [...l.asset_ids, b.asset_id]
            if (b.rent_cents != null) l.rent_cents = b.rent_cents
          }
          l.version += 1
          const n = state.leaseDocs.filter((d) => d.kind === 'amendment').length + 1
          const doc = { id: uuid(), lease_id: l.id, kind: 'amendment', number: `AV-00000001-2026-${String(n).padStart(4, '0')}`, document_id: uuid(), issued_at: new Date().toISOString(), sha256: 'd'.repeat(64), lease_version: l.version }
          state.leaseDocs.push(doc)
          record('lease.amend', 'lease', l.id, before, { ...l })
          return json(res, 201, { lease: l, amendment: doc })
        }
        case 'revision': {
          const r = state.revisions?.[l.id]
          if (!r) return conflict(res, 'billing/no-revision-due', 'Aucune révision de loyer n’est due pour ce bail.')
          const due = { anniversary: r.anniversary, from: r.effective_from, index: { quarter: r.new_ref_quarter, value: r.new_ref_value } }
          if (b?.dry_run) return json(res, 200, { revision: { lease_id: l.id, applied: false, due, revision: r } })
          const before = { ...l }
          Object.assign(l, { rent_cents: r.new_rent_cents, irl_ref_quarter: r.new_ref_quarter, irl_ref_value: r.new_ref_value, version: l.version + 1 })
          delete state.revisions[l.id]
          record('lease.revise', 'lease', l.id, before, { ...l })
          const notice = { kind: 'revision_notice', lease_id: l.id, number: 'RV-00000001-2026-0001', period: r.effective_from, document_id: uuid(), sha256: 'e'.repeat(64) }
          return json(res, 200, { revision: { lease_id: l.id, applied: true, due, revision: r }, notice })
        }
        case 'transitions': {
          const to = transitions[l.state]?.[b.action]
          if (!to) return conflict(res, 'lease/invalid-transition', 'Cette transition n’est pas possible dans l’état actuel du bail.')
          if (b.action === 'activate' && blockers(l).activation.length) return conflict(res, blockers(l).activation[0].type, blockers(l).activation[0].title)
          if (b.action === 'notice' && !b.end_on) return json(res, 422, { type: 'lease/notice-end-date-required', status: 422, title: 'La date de fin est obligatoire pour un congé.' })
          if (b.action === 'close' && state.guarantees.some((g) => g.lease_id === l.id && g.kind === 'deposit' && g.status !== 'settled'))
            return conflict(res, 'lease/deposit-not-settled', 'Le dépôt de garantie doit être soldé avant la clôture.')
          const before = { ...l }
          Object.assign(l, { state: to, end_on: b.end_on ?? l.end_on, version: l.version + 1 })
          record(`lease.${b.action}`, 'lease', l.id, before, { ...l })
          return json(res, 200, l)
        }
      }
    }
    m = /^\/guarantees\/([^/]+)(\/document)?$/.exec(path)
    if (m) {
      const g = state.guarantees.find((x) => x.id === m[1])
      if (!g) return json(res, 404, { status: 404 })
      if (m[2]) {
        const doc = { id: uuid(), lease_id: g.lease_id, guarantee_id: g.id, kind: g.kind === 'deposit' ? 'deposit_receipt' : 'surety_act', number: `${g.kind === 'deposit' ? 'DG' : 'CA'}-00000001-2026-0001`, document_id: uuid(), issued_at: new Date().toISOString(), sha256: 'b'.repeat(64) }
        state.leaseDocs.push(doc)
        g.document_id = doc.document_id
        return json(res, 201, doc)
      }
      if (entry.ifMatch !== `W/"${g.version}"`) return stale(res)
      Object.assign(g, b, { version: g.version + 1 })
      return json(res, 200, g)
    }
    if (path === '/documents') {
      if (req.method === 'GET') {
        const items = state.uploads.filter((u) => !q.get('lease_id') || u.lease_id === q.get('lease_id'))
        return json(res, 200, { items, total: items.length, page: 1, size: 100 })
      }
      if (!b?.file) return invalid(res, [{ field: 'file', message: 'Le fichier est obligatoire.' }])
      const u = { id: uuid(), class: b.class, lease_id: b.lease_id, asset_id: b.asset_id, signs_document_id: b.signs_document_id, original_name: b.file, source: 'upload', content_type: 'application/pdf', issued_at: new Date().toISOString(), sha256: 'c'.repeat(64), size_bytes: 8 }
      state.uploads.push(u)
      return json(res, 201, u)
    }
    m = /^\/documents\/([^/]+)\/content$/.exec(path)
    if (m) return json(res, 200, { url: `/__mock/file/${m[1]}`, expires_at: new Date(Date.now() + 600000).toISOString() })
    return false
  }
}
