// A small model of tenure-api's archive, grants and parameter routes: enough
// for the screen paths of RENT-FE-001 slice 6, not a second implementation.
//   GET /documents   state.archive filtered by asset, year, class and number
//                    (a lease filter is left to the lease model's uploads)
//   export           step_up; pending on creation, ready on the next read
//   grants           step_up to give or revoke; a grant is revoked, never deleted
//   params PUT       admin and step_up; appended, never in the past
//   /me/export       step_up
//   GET /templates   state.templates (default: two made-up templates); an
//                    accountant gets the financial ones (tenure-api Q-106)

export function docRoutes(ctx) {
  const { state, json, invalid, uuid } = ctx
  state.archive ??= []
  state.exports ??= []
  state.grants ??= []
  state.templates ??= [
    { name: 'contract', class: 'contract', versions: [
      { version: 'v1', current: false, sha256: '1'.repeat(64), documents: 2, first_issued_at: '2026-01-10T09:00:00Z', last_issued_at: '2026-03-02T09:00:00Z' },
      { version: 'v2', current: true, sha256: '2'.repeat(64), documents: 1, first_issued_at: '2026-11-03T09:00:00Z', last_issued_at: '2026-11-03T09:00:00Z' },
    ] },
    { name: 'rent_call', class: 'rent_call', versions: [{ version: 'v1', current: true, sha256: '3'.repeat(64), documents: 0 }] },
  ]
  const financial = new Set(['rent_call', 'receipt', 'regularisation', 'revision_notice', 'tax_summary', 'cancellation'])

  const stepUp = (res) => json(res, 401, { type: 'auth/step-up-required', status: 401, title: 'Une authentification forte récente est nécessaire.' })
  const forbidden = (res) => json(res, 403, { type: 'auth/forbidden', status: 403, title: 'Accès refusé.' })

  return function route(req, res, path, entry) {
    const b = entry.body
    const q = new URL(req.url, 'http://x').searchParams
    if (path === '/templates' && req.method === 'GET')
      return json(res, 200, state.role === 'accountant' ? state.templates.filter((x) => financial.has(x.class)) : state.templates)
    if (path === '/documents' && req.method === 'GET' && !q.get('lease_id')) {
      const items = state.archive.filter((d) => (!q.get('asset_id') || d.asset_id === q.get('asset_id')) && (!q.get('year') || d.issued_at.startsWith(q.get('year')))
        && (!q.get('class') || d.class === q.get('class')) && (!q.get('number') || (d.number ?? '').includes(q.get('number'))))
      return json(res, 200, { items, total: items.length, page: 1, size: 50 })
    }
    if (path === '/documents/export') {
      if (!state.stepUpFresh) return stepUp(res)
      if (!b?.year === !b?.asset_id) return invalid(res, [{ field: 'year', message: 'Indiquez une année ou un bien, pas les deux.' }])
      const x = { id: uuid(), state: 'pending', year: b.year, asset_id: b.asset_id, created_at: new Date().toISOString() }
      state.exports.push(x)
      return json(res, 202, x)
    }
    let m = /^\/documents\/exports\/([^/]+)$/.exec(path)
    if (m) {
      const x = state.exports.find((e) => e.id === m[1])
      if (!x) return json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
      if (x.state === 'pending') Object.assign(x, { state: 'ready', documents: state.archive.length, finished_at: new Date().toISOString(), link: { url: `/__mock/file/export-${x.id}`, expires_at: new Date(Date.now() + 600000).toISOString() } })
      return json(res, 200, x)
    }
    if (path === '/grants') {
      if (req.method === 'GET') return json(res, 200, state.grants)
      if (state.role !== 'owner') return forbidden(res)
      if (!state.stepUpFresh) return stepUp(res)
      if (!b?.grantee_sub?.trim()) return invalid(res, [{ field: 'grantee_sub', message: 'L’identifiant Socrate est obligatoire.' }])
      const g = { id: uuid(), owner_id: state.owner.id, grantee_sub: b.grantee_sub, role: b.role, granted_at: new Date().toISOString() }
      state.grants.push(g)
      return json(res, 201, g)
    }
    m = /^\/grants\/([^/]+)$/.exec(path)
    if (m) {
      if (state.role !== 'owner') return forbidden(res)
      if (!state.stepUpFresh) return stepUp(res)
      const g = state.grants.find((x) => x.id === m[1])
      if (!g) return json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
      g.revoked_at = new Date().toISOString()
      return json(res, 200, g)
    }
    m = /^\/params\/([^/]+)$/.exec(path)
    if (m && req.method === 'PUT' && m[1] !== 'irl') {
      if (!state.admin) return forbidden(res)
      if (!state.stepUpFresh) return stepUp(res)
      const today = new Date().toISOString().slice(0, 10)
      if (!b?.effective_from || b.effective_from < today) return invalid(res, [{ field: 'effective_from', message: 'La date d’effet ne peut pas être dans le passé.' }])
      state.paramHistory ??= []
      state.paramHistory.push({ key: decodeURIComponent(m[1]), ...b })
      state.params[decodeURIComponent(m[1])] = b.value
      return json(res, 201, { key: decodeURIComponent(m[1]), ...b })
    }
    if (path === '/me/export') {
      if (!state.stepUpFresh) return stepUp(res)
      return json(res, 200, { sub: 'sub-test', owner: state.owner, grants_given: state.grants, grants_received: [], exported_at: new Date().toISOString() })
    }
    return null
  }
}
