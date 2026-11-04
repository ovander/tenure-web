// A small model of tenure-api's lease rules (internal/lease): enough for the
// screens' paths of RENT-FE-001 flow 1, not a second implementation.
//   generation blocker  a dwelling without a DPE diagnostic
//   activation blockers no generated contract, no signed copy, no entry inventory
//   close               refused while a deposit is still held
const transitions = { draft: { activate: 'active' }, active: { notice: 'notice' }, notice: { end: 'ended' }, ended: { close: 'closed' } }

export function leaseRoutes(ctx) {
  const { state, json, invalid, uuid, record } = ctx

  function blockers(l) {
    const generation = []
    for (const id of l.asset_ids) {
      const a = state.assets.find((x) => x.id === id)
      if (a && a.kind !== 'box' && !state.diagnostics.some((d) => d.asset_id === id && d.kind === 'dpe'))
        generation.push({ type: 'lease/diagnostic-missing', title: 'Le diagnostic de performance énergétique (DPE) manque.', detail: a.address })
    }
    const contract = state.leaseDocs.filter((d) => d.lease_id === l.id && d.kind === 'contract').at(-1)
    const activation = []
    if (!contract) activation.push({ type: 'lease/contract-missing', title: 'Le contrat n’a pas été généré.' })
    else if (!state.uploads.some((u) => u.signs_document_id === contract.document_id))
      activation.push({ type: 'lease/contract-not-signed', title: 'L’exemplaire signé du contrat n’a pas été déposé.' })
    if (!state.inventories.some((i) => i.lease_id === l.id && i.kind === 'entry'))
      activation.push({ type: 'lease/entry-inventory-missing', title: 'L’état des lieux d’entrée manque.' })
    return l.state === 'draft' ? { generation, activation, warnings: [] } : { generation: [], activation: [], warnings: [] }
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
    let m = /^\/leases\/([^/]+)(?:\/([a-z]+))?$/.exec(path)
    if (m) {
      const l = state.leases.find((x) => x.id === m[1])
      if (!l) return json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
      switch (m[2]) {
        case undefined:
          if (req.method === 'GET') return json(res, 200, l)
          if (l.state !== 'draft') return conflict(res, 'lease/not-editable', 'Seul un bail en brouillon peut être modifié ; utilisez un avenant.')
          if (entry.ifMatch !== `W/"${l.version}"`) return stale(res)
          Object.assign(l, b, { version: l.version + 1 })
          return json(res, 200, l)
        case 'blockers':
          return json(res, 200, blockers(l))
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
          if (!b.done_on) return invalid(res, [{ field: 'done_on', message: 'La date de l’état des lieux est obligatoire.' }])
          {
            const i = { ...b, id: uuid(), lease_id: l.id }
            state.inventories.push(i)
            return json(res, 201, i)
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
