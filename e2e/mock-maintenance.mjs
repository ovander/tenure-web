// A small model of tenure-api's maintenance module (internal/maintenance;
// Q-130, Q-131): enough for the screen's paths, not a second implementation.
//   contractors   state.contractors
//   incidents     state.incidents; transitions follow the API's machine; the
//                 invoice of a repair, or of an improvement of an asset whose
//                 kind state.extraParams['tax.improvement_deductible'] lists, adds a
//                 charge to state.charges (Q-130)
//   contracts     state.contracts with their visits; the legal rhythm by kind
//                 is state.maintenanceRules (made up, as the params are); a
//                 chimney's by fuel is state.maintenanceChimney (Q-131)
const next = { new: { quote: 'quoted', schedule: 'scheduled', cancel: 'cancelled' }, quoted: { quote: 'quoted', schedule: 'scheduled', cancel: 'cancelled' },
  scheduled: { schedule: 'scheduled', done: 'done', cancel: 'cancelled' }, done: { invoice: 'invoiced' } }

const addMonths = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  t.setUTCDate(Math.min(d, last))
  return t.toISOString().slice(0, 10)
}

export function maintenanceRoutes(ctx) {
  const { state, json, invalid, uuid, record } = ctx
  const notFound = (res) => json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
  const stale = (res) => json(res, 412, { type: 'http/stale', status: 412, title: 'Version périmée.' })
  const etag = (v) => ({ ETag: `W/"${v}"` })
  const view = (c) => {
    const last = c.visits.map((v) => v.done_on).sort().at(-1)
    const due = last ? addMonths(last, c.interval_months) : c.first_due_on
    const { visits, ...rest } = c
    return { ...rest, last_done_on: last, next_due_on: c.end_on && c.end_on < due ? undefined : due, visits: [...visits].sort((a, b) => b.done_on.localeCompare(a.done_on)) }
  }
  // rhythm is the legal rhythm of a kind, a chimney's by its fuel.
  const rhythm = (b) => {
    const rule = state.maintenanceRules?.[b?.kind]
    const ch = state.maintenanceChimney
    if (b?.kind === 'chimney' && rule && ch) return { ...rule, interval_months: ch.fuels?.[b.fuel] ?? ch.default_months }
    return rule
  }
  return function route(req, res, path, entry) {
    const b = entry.body
    const q = new URL(req.url, 'http://x').searchParams
    if (!/^\/(contractors|incidents|maintenance-contracts)/.test(path)) return false
    state.contractors ??= []
    state.incidents ??= []
    state.contracts ??= []
    if (path === '/contractors') {
      if (req.method === 'GET') return json(res, 200, [...state.contractors].sort((a, b) => a.name.localeCompare(b.name)))
      if (!b?.name?.trim()) return invalid(res, [{ field: 'name', message: 'Un nom de 1 à 120 caractères est obligatoire.' }])
      const c = { id: uuid(), ...b, version: 1 }
      state.contractors.push(c)
      record('maintenance.contractor', 'contractor', c.id, null, c)
      return json(res, 201, c, etag(1))
    }
    let m = /^\/contractors\/([^/]+)$/.exec(path)
    if (m) {
      const c = state.contractors.find((x) => x.id === m[1])
      if (!c) return notFound(res)
      if (entry.ifMatch !== `W/"${c.version}"`) return stale(res)
      Object.assign(c, b, { version: c.version + 1 })
      return json(res, 200, c, etag(c.version))
    }
    if (path === '/incidents') {
      if (req.method === 'GET') {
        const open = q.get('open') === 'true'
        const rows = state.incidents.filter((i) => (!open || !['invoiced', 'cancelled'].includes(i.status)) && (!q.get('asset_id') || i.asset_id === q.get('asset_id')))
        return json(res, 200, [...rows].sort((a, b) => b.reported_on.localeCompare(a.reported_on)))
      }
      if (!b?.title?.trim()) return invalid(res, [{ field: 'title', message: 'Un intitulé de 1 à 200 caractères est obligatoire.' }])
      const i = { id: uuid(), photo_document_ids: [], ...b, status: 'new', version: 1 }
      state.incidents.push(i)
      record('maintenance.incident', 'incident', i.id, null, i)
      return json(res, 201, i, etag(1))
    }
    m = /^\/incidents\/([^/]+)(\/transitions)?$/.exec(path)
    if (m) {
      const i = state.incidents.find((x) => x.id === m[1])
      if (!i) return notFound(res)
      if (req.method === 'GET') return json(res, 200, i, etag(i.version))
      if (entry.ifMatch !== `W/"${i.version}"`) return stale(res)
      if (!m[2]) {
        Object.assign(i, b, { version: i.version + 1 })
        return json(res, 200, i, etag(i.version))
      }
      const to = next[i.status]?.[b.action]
      if (!to) return json(res, 409, { type: 'maintenance/transition', status: 409, title: 'Cette étape n’est pas possible depuis ce statut.' })
      if (b.action === 'quote' && !(b.quote_cents > 0)) return invalid(res, [{ field: 'quote_cents', message: 'Le montant du devis doit être positif.' }])
      if (b.action === 'done' && !b.done_on) return invalid(res, [{ field: 'done_on', message: 'La date de fin des travaux est obligatoire.' }])
      if (b.action === 'invoice' && !['repair', 'improvement', 'construction'].includes(b.treatment)) return invalid(res, [{ field: 'treatment', message: 'Attendu : repair ou improvement.' }])
      const { action, reason, ...fields } = b
      Object.assign(i, fields, { status: to, version: i.version + 1 })
      if (action === 'cancel') i.cancel_reason = reason ?? ''
      const kind = state.assets?.find((a) => a.id === i.asset_id)?.kind
      const deductible = b.treatment === 'repair' || (b.treatment === 'improvement' && (state.extraParams?.['tax.improvement_deductible']?.asset_kinds ?? []).includes(kind))
      if (action === 'invoice' && deductible) {
        const ch = { id: uuid(), asset_id: i.asset_id, category: 'repairs', source: 'invoice', label: `Travaux : ${i.title}`, amount_cents: b.invoice_cents, recoverable_cents: 0,
          charged_on: i.done_on, paid_on: b.paid_on, status: 'confirmed', document_id: b.invoice_document_id, version: 1 }
        state.charges ??= []
        state.charges.push(ch)
        i.charge_id = ch.id
      }
      return json(res, 200, i, etag(i.version))
    }
    if (path === '/maintenance-contracts') {
      if (req.method === 'GET') return json(res, 200, state.contracts.filter((c) => !q.get('asset_id') || c.asset_id === q.get('asset_id')).map((c) => ({ ...view(c), visits: undefined })))
      if (b?.kind === 'chimney' && !b.fuel) return invalid(res, [{ field: 'fuel', message: 'Le combustible est obligatoire pour un ramonage.' }])
      const rule = rhythm(b)
      const interval = b?.interval_months ?? rule?.interval_months
      if (rule && interval > rule.interval_months) return invalid(res, [{ field: 'interval_months', message: `La loi impose une visite tous les ${rule.interval_months} mois au plus.` }])
      if (!interval) return invalid(res, [{ field: 'interval_months', message: 'Un intervalle de 1 à 120 mois est obligatoire.' }])
      const c = { id: uuid(), ...b, interval_months: interval, responsible: b.responsible ?? rule?.responsible, visits: [], version: 1 }
      state.contracts.push(c)
      return json(res, 201, view(c), etag(1))
    }
    m = /^\/maintenance-contracts\/([^/]+)(\/visits)?$/.exec(path)
    if (m) {
      const c = state.contracts.find((x) => x.id === m[1])
      if (!c) return notFound(res)
      if (req.method === 'GET') return json(res, 200, view(c), etag(c.version))
      if (entry.ifMatch !== `W/"${c.version}"`) return stale(res)
      if (m[2]) {
        if (!b?.done_on) return invalid(res, [{ field: 'done_on', message: 'La date de la visite est obligatoire.' }])
        c.visits.push({ id: uuid(), done_on: b.done_on, document_id: b.document_id, notes: b.notes })
        record('maintenance.visit', 'maintenance_contract', c.id, null, {})
      } else {
        const rule = rhythm(b)
        if (rule && b.interval_months > rule.interval_months) return invalid(res, [{ field: 'interval_months', message: `La loi impose une visite tous les ${rule.interval_months} mois au plus.` }])
        Object.assign(c, b, { interval_months: b.interval_months ?? rule?.interval_months ?? c.interval_months, responsible: b.responsible ?? rule?.responsible ?? c.responsible })
      }
      c.version += 1
      return json(res, 200, view(c), etag(c.version))
    }
    return false
  }
}
