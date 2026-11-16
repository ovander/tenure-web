// A small model of tenure-api's SCI (internal/sci, Q-133): enough for the
// screens' paths, not a second implementation. The 2072's figures and the
// person's shares are made up by each test (state.sci2072, state.sciShares).
//   entities     POST /entities step_up; the SCI becomes a scope of the
//                caller, as its manager (state.extraScopes)
//   register     associates, holdings opened and closed by movements;
//                a subscription within the capital
//   2072         blockers from the register on 31 December and the year;
//                issued once, step_up, then the year is locked
export function sciRoutes(ctx) {
  const { state, json, invalid, uuid, record } = ctx
  const problem = (res, status, type, title) => json(res, status, { type, status, title })
  const held = (on) => state.sciHoldings.filter((h) => h.from_on <= on && (!h.closed_on || h.closed_on > on))
  const register = (on) => {
    const hs = held(on)
    return {
      on, capital_parts: entity().capital_parts, held_parts: hs.reduce((n, h) => n + h.parts, 0),
      associates: state.sciAssociates.map((a) => ({ ...a, parts_on: hs.filter((h) => h.associate_id === a.id).reduce((n, h) => n + h.parts, 0),
        holdings: state.sciHoldings.filter((h) => h.associate_id === a.id).map(({ id, parts, from_on, closed_on }) => ({ id, parts, from_on, closed_on: closed_on ?? null })) })),
    }
  }
  let scope
  const entity = () => state.entities.find((e) => e.id === scope)
  return function route(req, res, path, entry) {
    const b = entry.body
    const q = new URL(req.url, 'http://x').searchParams
    if (!['/entities', '/entity', '/associates'].includes(path) && !path.startsWith('/associates/') && !path.startsWith('/sci/')) return false
    state.entities ??= []
    state.sciAssociates ??= []
    state.sciHoldings ??= []
    state.sciMovements ??= []
    state.sciDeclared ??= []
    scope = entry.scope
    if (path === '/entities') {
      if (!state.stepUpFresh) return problem(res, 401, 'auth/step-up-required', 'Une authentification forte récente est nécessaire.')
      if (b?.tax_regime === 'is') return problem(res, 422, 'entity/is-unsupported', 'Une SCI soumise à l’impôt sur les sociétés n’est pas prise en charge.')
      if (!b?.legal_name) return invalid(res, [{ field: 'legal_name', message: 'La dénomination de la SCI est obligatoire.' }])
      // An id apart from the counter's, which the owner's own id starts from.
      const e = { ...b, id: `00000000-0000-7000-8000-5c1${String(++state.seq).padStart(9, '0')}`, kind: 'sci', siren: (b.siren ?? '').replace(/\s/g, ''), version: 1 }
      state.entities.push(e)
      state.extraScopes.push({ owner_id: e.id, legal_name: e.legal_name, role: 'owner', kind: 'sci', manager: true })
      record('entity.create', 'owner', e.id, null, e)
      return json(res, 201, e, { ETag: 'W/"1"' })
    }
    if (path === '/sci/shares') {
      const y = Number(q.get('year'))
      return json(res, 200, { year: y, shares: [], pending: [], ...(entity() ? {} : state.sciShares?.[y]) })
    }
    if (!entity()) return problem(res, 409, 'entity/not-sci', 'Cette action ne concerne qu’une SCI : choisissez le périmètre de la SCI.')
    if (path === '/entity') {
      const e = entity()
      if (req.method === 'GET') return json(res, 200, e, { ETag: `W/"${e.version}"` })
      if (entry.ifMatch !== `W/"${e.version}"`) return problem(res, 412, 'http/stale', 'Version périmée.')
      Object.assign(e, b, { capital_parts: e.capital_parts, version: e.version + 1 })
      record('entity.update', 'owner', e.id, null, e)
      return json(res, 200, e, { ETag: `W/"${e.version}"` })
    }
    if (path === '/associates') {
      if (req.method === 'GET') return json(res, 200, register(q.get('on') ?? new Date().toISOString().slice(0, 10)))
      if (!b?.name) return invalid(res, [{ field: 'name', message: 'Le nom de l’associé est obligatoire (200 caractères au plus).' }])
      if (b.link === 'self' && state.sciAssociates.some((a) => a.me)) return problem(res, 409, 'sci/associate-linked', 'Cette personne est déjà associée de la SCI.')
      const a = { id: uuid(), name: b.name, me: b.link === 'self', person_sub: b.link === 'self' ? 'sub-test' : (b.grant_id ? 'sub-granted' : null), version: 1 }
      state.sciAssociates.push(a)
      record('sci.associate.create', 'sci_associate', a.id, null, a)
      return json(res, 201, a, { ETag: 'W/"1"' })
    }
    let m = /^\/associates\/([^/]+)$/.exec(path)
    if (m) {
      const a = state.sciAssociates.find((x) => x.id === m[1])
      if (!a) return problem(res, 404, 'http/not-found', 'Introuvable.')
      if (entry.ifMatch !== `W/"${a.version}"`) return problem(res, 412, 'http/stale', 'Version périmée.')
      Object.assign(a, { name: b.name, me: b.link === 'self', version: a.version + 1 })
      return json(res, 200, a, { ETag: `W/"${a.version}"` })
    }
    if (path === '/sci/movements') {
      if (req.method === 'GET') return json(res, 200, state.sciMovements)
      const year = Number(b.on_date.slice(0, 4))
      if (state.sciDeclared.some((y) => y >= year)) return problem(res, 409, 'sci/year-declared', 'La 2072 de cette année est émise : les parts détenues cette année-là ne changent plus.')
      const mv = { ...b, id: uuid(), opened: [], closed: [] }
      if (b.reason === 'subscription') {
        const max = Math.max(...[b.on_date, ...state.sciHoldings.map((h) => h.from_on).filter((d) => d > b.on_date)].map((d) => held(d).reduce((n, h) => n + h.parts, 0)))
        if (max + b.parts > entity().capital_parts) return problem(res, 422, 'sci/capital-exceeded', 'Les parts détenues dépasseraient le capital de la SCI.')
        const h = { id: uuid(), associate_id: b.to_associate_id, parts: b.parts, from_on: b.on_date }
        state.sciHoldings.push(h)
        mv.opened.push(h)
      } else {
        const h = state.sciHoldings.find((x) => x.id === b.from_holding_id)
        if (!h || h.closed_on || h.from_on >= b.on_date) return problem(res, 409, 'sci/holding-closed', 'Ces parts ne sont plus détenues à cette date.')
        if (b.parts > h.parts) return problem(res, 422, 'sci/holding-parts', 'On ne cède pas plus de parts que la détention n’en compte.')
        h.closed_on = b.on_date
        const to = { id: uuid(), associate_id: b.to_associate_id, parts: b.parts, from_on: b.on_date }
        state.sciHoldings.push(to)
        mv.opened.push(to)
        if (h.parts > b.parts) state.sciHoldings.push({ id: uuid(), associate_id: h.associate_id, parts: h.parts - b.parts, from_on: b.on_date })
        mv.closed.push(h.id)
      }
      state.sciMovements.push(mv)
      record('sci.movement', 'sci_movement', mv.id, null, mv)
      return json(res, 201, mv)
    }
    if (path === '/sci/result' || path === '/sci/declarations') {
      const y = path === '/sci/result' ? Number(q.get('year')) : b?.year
      const reg = register(`${y}-12-31`)
      const r = state.sci2072?.[y] ?? { income_cents: 0, interest_cents: 0, other_expenses_cents: 0, net_cents: 0, furnished_receipts_cents: 0, lines: [], flags: [] }
      const blockers = []
      if (state.sciDeclared.includes(y)) blockers.push('declared')
      if (y >= new Date().getFullYear()) blockers.push('year_open')
      if (r.furnished_receipts_cents > 0) blockers.push('furnished_receipts')
      if (reg.held_parts !== reg.capital_parts) blockers.push('register_incomplete')
      const allocations = (state.sci2072Alloc?.[y] ?? []).map((a) => ({ ...a, associate_id: state.sciAssociates.find((x) => x.name === a.name)?.id ?? a.name }))
      const v = { year: y, declared: state.sciDeclared.includes(y), issued_at: state.sciDeclared.includes(y) ? new Date().toISOString() : null,
        capital_parts: reg.capital_parts, held_parts: reg.held_parts, result: r, allocations, blockers }
      if (path === '/sci/result') return json(res, 200, v)
      if (req.method === 'GET') return json(res, 200, [])
      if (!state.stepUpFresh) return problem(res, 401, 'auth/step-up-required', 'Une authentification forte récente est nécessaire.')
      if (blockers.length) return problem(res, 409, `sci/${blockers[0].replace('_', '-')}`, 'Cette 2072 ne peut être émise.')
      state.sciDeclared.push(y)
      record('sci.declaration', 'sci_declaration', String(y), null, v)
      return json(res, 201, { ...v, declared: true, blockers: ['declared'] })
    }
    return false
  }
}
