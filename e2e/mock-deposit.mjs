// The deposit routes of tenure-api (Q-115), a small model: wear grids and
// their annex, deductions on the exit's flagged items and missing keys with
// the grid share, the first RD statement (holdback in a collective building
// whose accounts are not approved) and the release.
import { compare } from './mock-inventory.mjs'

export function depositRoutes(ctx) {
  const { state, json, invalid, uuid, record } = ctx
  const forbidden = (res) => json(res, 403, { type: 'auth/forbidden', status: 403, title: 'Accès refusé.' })
  const notFound = (res) => json(res, 404, { type: 'http/not-found', status: 404, title: 'Ressource introuvable.' })
  const settledP = (res) => json(res, 409, { type: 'inventory/deposit-settled', status: 409, title: 'Le dépôt de garantie de ce bail est déjà réglé.' })
  const addMonths = (day, n) => {
    const [y, m, d] = day.split('-').map(Number)
    const t = new Date(Date.UTC(y, m - 1 + n, 1))
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
    t.setUTCDate(Math.min(d, last))
    return t.toISOString().slice(0, 10)
  }
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())

  function facts(l) {
    state.grids ??= []
    state.deposits ??= {}
    const d = (state.deposits[l.id] ??= { deductions: [], statements: [], grid_id: undefined })
    const exit = Object.values(state.captures ?? {}).find((c) => c.lease_id === l.id && c.kind === 'exit')
    const cmp = exit && exit.state === 'issued' ? compare(state, exit) : undefined
    const collective = (l.asset_ids ?? []).some((id) => state.assets.find((a) => a.id === id)?.collective_building)
    return { d, exit, cmp, collective, grid: state.grids.find((g) => g.id === d.grid_id) }
  }
  function statement(l, f, b) {
    if (!f.exit || f.exit.state !== 'issued' || !f.exit.keys_returned_on)
      return { error: { type: 'inventory/settlement-unavailable', status: 409, title: 'La restitution suit l’état des lieux de sortie émis, avec la date de remise des clés.' } }
    const deposit = l.deposit_cents ?? 0
    if (b.release) {
      const first = f.d.statements.find((s) => s.kind === 'initial')
      if (!first?.holdback_cents) return { error: { type: 'inventory/settlement-unavailable', status: 409, title: 'Aucune provision à libérer.' } }
      const reg = b.regularisation_cents ?? 0
      const total = first.holdback_cents - reg
      return { st: { kind: 'release', settled_on: today(), deadline: addMonths(b.accounts_approved_on ?? today(), 1), deposit_cents: first.holdback_cents,
        lines: [], regularisation_cents: reg, balance_cents: total, penalty_months: 0, penalty_cents: 0, total_cents: total, new_address_given: true } }
    }
    const deductions = f.d.deductions.reduce((s, x) => s + x.amount_cents, 0)
    const arrears = state.depositArrears?.[l.id] ?? 0
    const holdback = f.collective && !b.accounts_approved_on ? Math.floor((deposit * 2000) / 10000) : 0
    const reg = holdback ? 0 : (b.regularisation_cents ?? 0)
    const total = deposit - deductions - arrears - holdback - reg
    return { st: { kind: 'initial', settled_on: today(), keys_returned_on: f.exit.keys_returned_on, deadline: addMonths(f.exit.keys_returned_on, f.d.deductions.length ? 2 : 1),
      deposit_cents: deposit, lines: f.d.deductions, deductions_cents: deductions, arrears_cents: arrears, regularisation_cents: reg, holdback_cents: holdback,
      balance_cents: total, penalty_months: 0, penalty_cents: 0, total_cents: total, new_address_given: true } }
  }
  function view(l) {
    const f = facts(l)
    const first = f.d.statements.find((s) => s.kind === 'initial')
    const next = !first ? (f.exit?.state === 'issued' && f.exit.keys_returned_on ? 'initial' : 'wait_exit')
      : first.holdback_cents && !f.d.statements.some((s) => s.kind === 'release') ? 'release' : 'done'
    const v = { lease_id: l.id, deposit_cents: l.deposit_cents ?? 0, rent_cents: l.rent_cents, collective_building: f.collective, grid: f.grid,
      exit_inventory_id: f.exit?.id, flagged: (f.cmp?.items ?? []).filter((r) => r.result === 'worse' || r.result === 'missing'),
      missing_keys: (f.cmp?.keys ?? []).filter((k) => k.result === 'missing'), deductions: f.d.deductions, next, statements: f.d.statements }
    if (next === 'initial' || next === 'release') v.preview = statement(l, f, { release: next === 'release' }).st
    return v
  }

  return function route(req, res, path, entry) {
    const g = /^\/vetuste-grids(?:\/([^/]+))?$/.exec(path)
    const m = /^\/leases\/([^/]+)\/(deposit|deposit-deductions|deposit-settlement|vetuste-grid)$/.exec(path)
    const del = /^\/deposit-deductions\/([^/]+)$/.exec(path)
    if (!g && !m && !del) return false
    if (state.role === 'accountant') return forbidden(res)
    const b = entry.body ?? {}
    state.grids ??= []
    if (g) {
      if (req.method === 'GET' && !g[1]) return json(res, 200, state.grids)
      if (state.role !== 'owner') return forbidden(res)
      if (req.method === 'POST') {
        if (!b.name || !b.source) return invalid(res, [...(!b.name ? [{ field: 'name', message: 'Le nom de la grille est obligatoire.' }] : []), ...(!b.source ? [{ field: 'source', message: 'La source de la grille est obligatoire (accord collectif, accord des parties).' }] : [])])
        const x = { id: uuid(), name: b.name, source: b.source, lines: b.lines ?? [], version: 1 }
        state.grids.push(x)
        record('inventory.grid.create', 'vetuste_grid', x.id, null, x)
        return json(res, 201, x, { ETag: 'W/"1"' })
      }
      return json(res, 405, { status: 405 })
    }
    if (del) {
      if (state.role !== 'owner') return forbidden(res)
      for (const [lid, d] of Object.entries(state.deposits ?? {})) {
        const i = d.deductions.findIndex((x) => x.id === del[1])
        if (i < 0) continue
        if (d.statements.length) return settledP(res)
        d.deductions.splice(i, 1)
        record('deposit.deduction.delete', 'deposit_deduction', del[1], null, { lease_id: lid })
        res.writeHead(204)
        res.end()
        return true
      }
      return notFound(res)
    }
    const l = state.leases.find((x) => x.id === m[1])
    if (!l) return notFound(res)
    const f = facts(l)
    if (m[2] === 'deposit' && req.method === 'GET') return json(res, 200, view(l))
    if (m[2] === 'deposit-deductions' && req.method === 'GET') return json(res, 200, f.d.deductions)
    if (state.role !== 'owner') return forbidden(res)
    if (m[2] === 'vetuste-grid' && req.method === 'PUT') {
      if (f.d.statements.length) return settledP(res)
      f.d.grid_id = b.vetuste_grid_id ?? undefined
      record('lease.vetuste_grid', 'lease', l.id, null, b)
      return json(res, 200, view(l))
    }
    if (m[2] === 'deposit-deductions' && req.method === 'POST') {
      if (f.d.statements.length) return settledP(res)
      const errs = []
      if (!b.cost_cents) errs.push({ field: 'cost_cents', message: 'Le coût du devis ou de la facture est obligatoire.' })
      if (!b.document_id) errs.push({ field: 'document_id', message: 'Le devis ou la facture est obligatoire.' })
      if (errs.length) return invalid(res, errs)
      let share = 10000
      if (b.exit_item_id) {
        const r = (f.cmp?.items ?? []).find((x) => x.exit_item_id === b.exit_item_id && (x.result === 'worse' || x.result === 'missing'))
        if (!r) return json(res, 409, { type: 'inventory/deduction-unjustified', status: 409, title: 'Une retenue porte sur un élément dégradé ou manquant à la sortie, ou une clé manquante.' })
        const line = f.grid?.lines.find((x) => x.category === r.category)
        if (f.grid && !line) return json(res, 422, { type: 'inventory/grid-line-missing', status: 422, title: 'La grille de vétusté du bail n’a pas de ligne pour cette catégorie : la retenue n’est pas calculée.' })
        if (line) {
          const [sy, sm, sd] = l.start_on.split('-').map(Number)
          const [ey, em, ed] = (f.exit.done_on ?? today()).split('-').map(Number)
          const age = Math.max(0, ey - sy - (em < sm || (em === sm && ed < sd) ? 1 : 0))
          share = line.lifetime_years && age >= line.lifetime_years ? line.floor_bp : Math.max(line.floor_bp, 10000 - line.yearly_rate_bp * Math.max(0, age - line.franchise_years))
        }
      }
      const x = { id: uuid(), exit_item_id: b.exit_item_id, description: b.description, cost_cents: b.cost_cents, tenant_share_bp: share,
        amount_cents: Math.floor((b.cost_cents * share + 5000) / 10000), basis: b.basis, document_id: b.document_id }
      f.d.deductions.push(x)
      record('deposit.deduction.create', 'deposit_deduction', x.id, null, x)
      return json(res, 201, x)
    }
    if (m[2] === 'deposit-settlement' && req.method === 'POST') {
      if (!b.release && f.d.statements.some((s) => s.kind === 'initial')) return settledP(res)
      if (b.release && !b.accounts_approved_on && !b.dry_run) return invalid(res, [{ field: 'accounts_approved_on', message: 'La date d’approbation des comptes est obligatoire pour libérer la provision.' }])
      const { st, error } = statement(l, f, b)
      if (error) return json(res, error.status, error)
      if (b.dry_run) return json(res, 200, st)
      st.document_id = uuid()
      f.d.statements.push(st)
      record('deposit.settle', 'lease', l.id, null, st)
      return json(res, 201, st)
    }
    return json(res, 405, { status: 405 })
  }
}
