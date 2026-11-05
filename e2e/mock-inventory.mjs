// A small model of tenure-api's layout routes (internal/inventory, Q-109):
// enough for screen S15a, not a second implementation. The template is a
// made-up subset: three coverings per room, a hob in a furnished kitchen.
//   GET  /assets/{id}/layout        state.layouts[id], version 0 when none
//   PUT  /assets/{id}/layout        If-Match on the version; ids kept, new ones minted; an empty label is a field error
//   POST /assets/{id}/layout/seed   refused once the asset has rooms
//   an accountant gets 403 everywhere
// draftCapture builds a captured entry from the layouts of its lease's assets
// (tenure-api Q-111): one unassessed item per element, the room copied.
export function draftCapture(state, inv, lease, uuid) {
  const rooms = []
  for (const a of lease.asset_ids ?? []) {
    const l = state.layouts?.[a]
    if (!l?.rooms?.length) return null
    for (const r of l.rooms) rooms.push({ room_id: r.id, label: r.label, kind: r.kind,
      items: r.elements.map((e) => ({ id: uuid(), element_id: e.id, category: e.category, label: e.label, quantity: e.quantity ?? 0, comment: '', to_check: false, photos: [], version: 1 })) })
  }
  state.captures ??= {}
  state.captures[inv.id] = { id: inv.id, lease_id: lease.id, kind: 'entry', mode: 'amicable', state: 'draft', place: '', observations: '', version: 1,
    rooms, meters: [], keys: [], parties: [{ party: 'owner', name: state.owner?.legal_name ?? '', signed: false }] }
  return state.captures[inv.id]
}

// checks is a small model of Validate's complete stage: every item assessed,
// a poor or broken item explained, a key line.
function checks(c) {
  const blocking = []
  if (!c.done_on) blocking.push({ code: 'done-on-missing', stage: 'complete' })
  for (const r of c.rooms) for (const it of r.items) {
    if (!it.condition) blocking.push({ code: 'item-not-assessed', stage: 'complete', room: r.label, item: it.label })
    else if ((it.condition === 'poor' || it.condition === 'broken') && !it.comment && !it.photos.length) blocking.push({ code: 'damage-unexplained', stage: 'complete', room: r.label, item: it.label })
  }
  if (!c.keys.some((k) => k.quantity > 0)) blocking.push({ code: 'no-key-line', stage: 'complete' })
  blocking.push({ code: 'party-not-signed', stage: 'issue', party: c.parties[0]?.name })
  return { blocking, warnings: [] }
}

export function inventoryRoutes(ctx) {
  const { state, json, invalid, uuid, record } = ctx
  state.layouts ??= {}
  state.captures ??= {}
  const forbidden = (res) => json(res, 403, { type: 'auth/forbidden', status: 403, title: 'Accès refusé.' })
  const els = (...labels) => labels.map(([category, label, quantity = 0]) => ({ category, label, quantity }))
  const covering = () => els(['floor', 'Sol'], ['walls', 'Murs'], ['ceiling', 'Plafond'])

  function seedRooms(asset, b) {
    if (asset.kind === 'box') return [{ kind: 'box', label: 'Box', elements: [...covering(), ...els(['joinery', 'Porte'])] }]
    const rooms = [{ kind: 'entry', label: 'Entrée', elements: covering() }, { kind: 'living', label: 'Séjour', elements: covering() },
      { kind: 'kitchen', label: 'Cuisine', elements: [...covering(), ...els(b.furnished ? ['furniture', 'Plaques de cuisson', 1] : ['appliance', 'Plaques'])] }]
    for (let i = 1; i <= (b.bedrooms ?? 0); i++) rooms.push({ kind: 'bedroom', label: b.bedrooms > 1 ? `Chambre ${i}` : 'Chambre', elements: covering() })
    rooms.push({ kind: 'bathroom', label: 'Salle d’eau', elements: covering() }, { kind: 'wc', label: 'WC', elements: covering() })
    if (b.features?.cellar) rooms.push({ kind: 'storage', label: 'Cellier ou cave', elements: covering() })
    return rooms
  }
  // store numbers the rooms and elements, keeping known ids.
  function store(assetId, rooms, version) {
    const out = { asset_id: assetId, version, rooms: rooms.map((r, i) => ({ id: r.id ?? uuid(), position: i + 1, kind: r.kind, label: r.label, version: 1,
      elements: (r.elements ?? []).map((e, j) => ({ id: e.id ?? uuid(), position: j + 1, category: e.category, label: e.label, quantity: e.quantity ?? 0, installed_on: e.installed_on, version: 1 })) })) }
    state.layouts[assetId] = out
    return out
  }

  const stale = (res) => json(res, 412, { type: 'http/stale', status: 412, title: 'Version périmée.' })
  const notEditable = (res) => json(res, 409, { type: 'inventory/not-editable', status: 409, title: 'Cet état des lieux ne se modifie pas à cette étape.' })
  const view = (c) => ({ ...c, checks: checks(c) })
  const moves = { schedule: ['draft', 'scheduled'], start: ['scheduled', 'in_progress'], complete: ['in_progress', 'completed'], reopen: ['completed', 'in_progress'], issue: ['signed', 'issued'] }

  // The capture routes of tenure-api (Q-111), and the photo pipeline (Q-110)
  // with its signed links on the archive origin.
  function capture(req, res, path, entry) {
    const m = /^\/inventories\/([^/]+)(?:\/(items|meters|keys|transitions|photos)(?:\/([^/]+))?(\/content)?)?$/.exec(path)
    if (!m) return false
    if (state.role === 'accountant') return forbidden(res)
    const c = state.captures[m[1]]
    if (!c) return json(res, 404, { type: 'http/not-found', status: 404, title: 'Ressource introuvable.' })
    const sub = m[2]
    if (req.method === 'GET' && !sub) return json(res, 200, view(c), { ETag: `W/"${c.version}"` })
    if (req.method === 'GET' && sub === 'photos' && m[4]) return json(res, 200, { url: `${state.archive}/photo/${m[3]}`, expires_at: new Date(Date.now() + 600000).toISOString() })
    if (state.role !== 'owner') return forbidden(res)
    const b = entry.body ?? {}
    const header = ['draft', 'scheduled', 'in_progress'].includes(c.state)
    const items = ['draft', 'in_progress'].includes(c.state)
    if (!sub && req.method === 'PUT') {
      if (!header) return notEditable(res)
      if (entry.ifMatch !== `W/"${c.version}"`) return stale(res)
      Object.assign(c, { done_on: b.done_on, scheduled_at: b.scheduled_at, place: b.place ?? '', observations: b.observations ?? '' })
      c.version++
      record('inventory.update', 'inventory', c.id, null, c)
      return json(res, 200, view(c), { ETag: `W/"${c.version}"` })
    }
    if (sub === 'items') {
      if (!items) return notEditable(res)
      if (req.method === 'POST') {
        const room = c.rooms.find((r) => (b.room_id && r.room_id === b.room_id) || r.label === b.room_label)
        if (!b.label?.trim()) return invalid(res, [{ field: 'label', message: 'Le libellé est obligatoire.' }])
        const it = { id: uuid(), category: b.category, label: b.label, quantity: b.quantity ?? 0, comment: '', to_check: false, photos: [], version: 1 }
        room.items.push(it)
        record('inventory.item.add', 'inventory', c.id, null, it)
        return json(res, 201, it, { ETag: 'W/"1"' })
      }
      const it = c.rooms.flatMap((r) => r.items).find((x) => x.id === m[3])
      if (!it) return json(res, 404, { status: 404 })
      if (entry.ifMatch !== `W/"${it.version}"`) return stale(res)
      if (state.failItem === it.label) { delete state.failItem; return json(res, 503, { type: 'http/unavailable', status: 503, title: 'Service indisponible.' }) }
      Object.assign(it, { condition: b.condition, works: b.works, quantity: b.quantity ?? 0, comment: b.comment ?? '', to_check: false, version: it.version + 1 })
      record('inventory.item.update', 'inventory', c.id, null, it)
      return json(res, 200, it, { ETag: `W/"${it.version}"` })
    }
    if (sub === 'meters' || sub === 'keys') {
      if (!header) return notEditable(res)
      if (entry.ifMatch !== `W/"${c.version}"`) return stale(res)
      if (sub === 'meters') {
        const errors = []
        ;(b.meters ?? []).forEach((x, i) => { if (!/^([0-9]+([.,][0-9]+)?)?$/.test(x.reading ?? '')) errors.push({ field: `meters[${i}].reading`, message: 'Index attendu : des chiffres, avec une virgule décimale au besoin.' }) })
        if (errors.length) return invalid(res, errors)
        c.meters = (b.meters ?? []).map((x) => ({ ...x, id: x.id ?? uuid(), photos: c.meters.find((o) => o.id === x.id)?.photos ?? [] }))
      } else c.keys = b.keys ?? []
      c.version++
      record(`inventory.${sub}.update`, 'inventory', c.id, null, c[sub])
      return json(res, 200, view(c), { ETag: `W/"${c.version}"` })
    }
    if (sub === 'photos') {
      if (!items) return notEditable(res)
      const it = c.rooms.flatMap((r) => r.items).find((x) => x.id === b.item_id)
      const meter = c.meters.find((x) => x.id === b.meter_id)
      if (!it && !meter) return json(res, 422, { type: 'inventory/photo-target-invalid', status: 422, title: 'La photo doit se rattacher à un élément ou à un compteur de cet état des lieux.' })
      const photo = { id: uuid(), inventory_id: c.id, item_id: b.item_id, meter_id: b.meter_id, sha256: 'b'.repeat(64), width: 2048, height: 1536 }
      ;(it ?? meter).photos.push(photo.id)
      record('inventory.photo.add', 'inventory', c.id, null, photo)
      return json(res, 201, photo)
    }
    if (sub === 'transitions') {
      const mv = moves[b.action]
      if (!mv) return invalid(res, [{ field: 'action', message: 'Étape inconnue.' }])
      if (b.action === 'start' && !c.done_on) c.done_on = new Date().toISOString().slice(0, 10)
      if (b.action === 'schedule') { if (b.scheduled_at) c.scheduled_at = b.scheduled_at; if (b.place !== undefined) c.place = b.place }
      if (c.state !== mv[0]) return json(res, 409, { type: 'inventory/transition-invalid', status: 409, title: 'Cette étape n’est pas possible depuis l’état actuel de l’état des lieux.' })
      if (b.action === 'schedule' && (!c.scheduled_at || !c.place)) return invalid(res, [...(!c.scheduled_at ? [{ field: 'scheduled_at', message: 'La date et l’heure du rendez-vous sont obligatoires.' }] : []), ...(!c.place ? [{ field: 'place', message: 'Le lieu du rendez-vous est obligatoire.' }] : [])])
      if (b.action === 'complete' && checks(c).blocking.some((x) => x.stage === 'complete'))
        return json(res, 422, { type: 'inventory/mandatory-mention-missing', status: 422, title: 'Des mentions obligatoires manquent à l’état des lieux.' })
      c.state = mv[1]
      c.version++
      const inv = state.inventories.find((i) => i.id === c.id)
      if (inv) Object.assign(inv, { state: c.state, done_on: c.done_on })
      record('inventory.transition', 'inventory', c.id, null, { action: b.action })
      return json(res, 200, view(c), { ETag: `W/"${c.version}"` })
    }
    return json(res, 405, { status: 405 })
  }

  return function route(req, res, path, entry) {
    if (capture(req, res, path, entry) !== false) return true
    const m = /^\/assets\/([^/]+)\/layout(\/seed)?$/.exec(path)
    if (!m && path !== '/inventory-templates') return false
    if (state.role === 'accountant') return forbidden(res)
    if (path === '/inventory-templates') return json(res, 200, [])
    const asset = state.assets.find((a) => a.id === m[1])
    if (!asset) return json(res, 404, { type: 'http/not-found', status: 404, title: 'Ressource introuvable.' })
    const cur = state.layouts[asset.id] ?? { asset_id: asset.id, version: 0, rooms: [] }
    if (req.method === 'GET') return json(res, 200, cur, { ETag: `W/"${cur.version}"` })
    if (state.role !== 'owner') return forbidden(res)
    const b = entry.body ?? {}
    if (m[2]) {
      if (cur.rooms.length) return json(res, 409, { type: 'inventory/layout-exists', status: 409, title: 'Ce bien a déjà un plan de pièces : modifiez-le plutôt que de le recréer.' })
      const out = store(asset.id, seedRooms(asset, b), cur.version + 1)
      record('layout.seed', 'asset', asset.id, null, out)
      return json(res, 201, out, { ETag: `W/"${out.version}"` })
    }
    if (entry.ifMatch !== `W/"${cur.version}"`) return json(res, 412, { type: 'http/stale', status: 412, title: 'Version périmée.' })
    const errors = []
    ;(b.rooms ?? []).forEach((r, i) => { if (!r.label?.trim()) errors.push({ field: `rooms[${i}].label`, message: 'Le nom de la pièce est obligatoire.' }) })
    if (errors.length) return invalid(res, errors)
    const before = cur
    const out = store(asset.id, b.rooms ?? [], cur.version + 1)
    record('layout.update', 'asset', asset.id, before, out)
    return json(res, 200, out, { ETag: `W/"${out.version}"` })
  }
}
