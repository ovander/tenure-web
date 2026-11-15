// A small model of tenure-api's furnished letting under the réel
// (internal/bic; Q-132): enough for the screens' paths, not a second
// implementation. The default grid, the results and the threshold are made
// up by each test (state.bicProposal, state.bicResults, state.bicThreshold).
//   grid         state.bicGrids[asset]: versions; GET serves the latest or the
//                proposal; a frozen one refuses a new version
//   items        state.bicItems[asset]; expense under state.bicThreshold for
//                furniture, works by nature; a forced treatment needs its reason
//   depreciation state.bicDepreciation[asset][year]
//   result       state.bicResults[year]; declarations: step_up, once per year
export function bicRoutes(ctx) {
  const { state, json, invalid, uuid, record } = ctx
  const problem = (res, status, type, title) => json(res, status, { type, status, title })
  return function route(req, res, path, entry) {
    const b = entry.body
    const q = new URL(req.url, 'http://x').searchParams
    let m = /^\/assets\/([^/]+)\/(bic-grid|fixed-assets|depreciation)$/.exec(path)
    if (!m && !path.startsWith('/bic/') && !path.startsWith('/fixed-assets/')) return false
    state.bicGrids ??= {}
    state.bicItems ??= {}
    if (m && m[2] === 'bic-grid') {
      const versions = (state.bicGrids[m[1]] ??= [])
      const latest = versions.at(-1)
      if (req.method === 'GET') return json(res, 200, latest ?? { ...state.bicProposal, proposed: true, version: 0 }, { ETag: `W/"${latest?.version ?? 0}"` })
      if (entry.ifMatch !== `W/"${latest?.version ?? 0}"`) return problem(res, 412, 'http/stale', 'Version périmée.')
      if (latest?.frozen) return problem(res, 409, 'bic/grid-frozen', 'Cette grille a servi à une déclaration : elle ne change plus.')
      const total = (b.lines ?? []).reduce((s, l) => s + l.share_bp, 0)
      if (total !== 10000) return invalid(res, [{ field: 'lines', message: 'Les quotes-parts font 100 %.' }])
      if (latest && !b.reason) return invalid(res, [{ field: 'reason', message: 'Dites pourquoi la grille change.' }])
      const basis = b.price_cents + (b.costs_expensed ? 0 : b.acquisition_costs_cents ?? 0)
      let given = 0
      const bases = b.lines.map((l, i) => {
        const v = i === b.lines.length - 1 ? basis - given : Math.round((basis * l.share_bp) / 10000)
        given += v
        return v
      })
      const g = { ...b, basis_cents: basis, bases, version: (latest?.version ?? 0) + 1, proposed: false, frozen: false }
      versions.push(g)
      record('bic.grid', 'asset', m[1], null, g)
      return json(res, 200, g, { ETag: `W/"${g.version}"` })
    }
    if (m && m[2] === 'fixed-assets') {
      const list = (state.bicItems[m[1]] ??= [])
      if (req.method === 'GET') return json(res, 200, list)
      return saveItem(res, m[1], null, b)
    }
    if (m && m[2] === 'depreciation') {
      return json(res, 200, state.bicDepreciation?.[m[1]]?.[q.get('year')] ?? { year: Number(q.get('year')), rows: [], total_cents: 0, expensed_cents: 0 })
    }
    m = /^\/fixed-assets\/([^/]+)$/.exec(path)
    if (m) {
      for (const [asset, list] of Object.entries(state.bicItems)) {
        const it = list.find((x) => x.id === m[1])
        if (it) {
          if (entry.ifMatch !== `W/"${it.version}"`) return problem(res, 412, 'http/stale', 'Version périmée.')
          return saveItem(res, asset, it, b)
        }
      }
      return problem(res, 404, 'http/not-found', 'Introuvable.')
    }
    if (path === '/bic/result') {
      const y = Number(q.get('year'))
      const r = state.bicResults?.[y] ?? { year: y, regime: 'reel', micro: { eligible: true }, lower: 'reel' }
      const declared = (state.bicDeclarations ?? []).find((d) => d.year === y)
      return json(res, 200, { year: y, result: declared ? declared.result : r, chain: [declared ? declared.result : r], assets: state.bicResultAssets ?? [] })
    }
    if (path === '/bic/declarations') {
      state.bicDeclarations ??= []
      if (req.method === 'GET') return json(res, 200, state.bicDeclarations)
      if (!state.stepUpFresh) return problem(res, 401, 'auth/step-up-required', 'Une authentification forte récente est nécessaire.')
      if (state.bicDeclarations.some((d) => d.year === b.year)) return problem(res, 409, 'bic/declared', 'La déclaration de cette année est déjà émise.')
      const r = state.bicResults?.[b.year] ?? {}
      const d = { id: uuid(), year: b.year, regime: b.regime, result: { ...r, regime: b.regime, declared: true }, assets: [], grids: [], issued_at: new Date().toISOString() }
      state.bicDeclarations.push(d)
      for (const versions of Object.values(state.bicGrids)) if (versions.at(-1)) versions.at(-1).frozen = true
      record('bic.declaration', 'bic_declaration', d.id, null, d)
      return json(res, 201, d)
    }
    return false
  }

  function saveItem(res, asset, current, b) {
    if (!b?.label?.trim()) return invalid(res, [{ field: 'label', message: 'Un intitulé est obligatoire.' }])
    const suggested = b.kind === 'works' ? (b.works === 'repair' ? 'expense' : 'asset') : (b.cost_cents ?? 0) < (state.bicThreshold ?? 0) ? 'expense' : 'asset'
    const treatment = b.treatment ?? suggested
    if (treatment !== suggested && !b.override_reason) return invalid(res, [{ field: 'override_reason', message: 'Dites pourquoi vous forcez ce traitement.' }])
    const it = { ...(current ?? { id: uuid(), version: 0 }), ...b, asset_id: asset, months: b.months ?? state.bicFurnitureMonths, suggested, treatment, overridden: treatment !== suggested }
    it.version += 1
    if (!current) state.bicItems[asset].push(it)
    else Object.assign(current, it)
    return json(res, current ? 200 : 201, it, { ETag: `W/"${it.version}"` })
  }
}
