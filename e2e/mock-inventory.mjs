// A small model of tenure-api's layout routes (internal/inventory, Q-109):
// enough for screen S15a, not a second implementation. The template is a
// made-up subset: three coverings per room, a hob in a furnished kitchen.
//   GET  /assets/{id}/layout        state.layouts[id], version 0 when none
//   PUT  /assets/{id}/layout        If-Match on the version; ids kept, new ones minted; an empty label is a field error
//   POST /assets/{id}/layout/seed   refused once the asset has rooms
//   an accountant gets 403 everywhere
export function inventoryRoutes(ctx) {
  const { state, json, invalid, uuid, record } = ctx
  state.layouts ??= {}
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

  return function route(req, res, path, entry) {
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
