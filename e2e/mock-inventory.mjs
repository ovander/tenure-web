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
    rooms, meters: [], keys: [], signatures: [], requests: [],
    parties: [{ party: 'owner', name: state.owner?.legal_name ?? '', signed: false },
      ...(lease.tenants ?? []).flatMap((lt) => (state.tenants.find((x) => x.id === lt.tenant_id)?.names ?? []).map((name) => ({ party: 'tenant', name, signed: false })))] }
  return state.captures[inv.id]
}

// corrected is the entry's item corrected by its accepted completion lines
// (tenure-api Q-114).
function corrected(e, it) {
  const out = { ...it }
  for (const c of e.completions ?? []) for (const l of c.lines) if (l.entry_item_id === it.id && l.accepted) {
    if (l.requested.condition) out.condition = l.requested.condition
    if (l.requested.works) out.works = l.requested.works
    if (l.requested.comment) out.comment = l.requested.comment
  }
  return out
}

// draftExit pre-fills an exit from the issued entry's capture (Q-113): each
// item at its entry state, linked and to check; the keys as handed over.
export function draftExit(state, inv, entryInv, uuid) {
  const e = state.captures[entryInv.id]
  state.captures[inv.id] = { id: inv.id, lease_id: inv.lease_id, kind: 'exit', mode: 'amicable', state: 'draft', place: '', observations: '',
    version: 1, entry_inventory_id: entryInv.id, entry_done_on: e.done_on, keys_returned_on: undefined, tenant_new_address: '',
    rooms: e.rooms.map((r) => ({ ...r, items: r.items.map((it) => ({ ...corrected(e, it), id: uuid(), entry_item_id: it.id, photos: [], version: 1, to_check: true })) })),
    meters: e.meters.map((m) => ({ ...m, id: uuid(), reading: '', photos: [] })), keys: e.keys.map((k) => ({ ...k })),
    signatures: [], requests: [], parties: e.parties.map((p) => ({ ...p, signed: false })) }
  return state.captures[inv.id]
}

// compare is a small model of Compare: the scale, keys, flagged.
const rank = { new: 5, good: 4, fair: 3, poor: 2, broken: 1 }
export function compare(state, c) {
  const e = state.captures[c.entry_inventory_id]
  const byID = Object.fromEntries(e.rooms.flatMap((r) => r.items).map((it) => [it.id, corrected(e, it)]))
  const items = []
  for (const r of c.rooms) for (const x of r.items) {
    const en = byID[x.entry_item_id]
    const st = (it) => ({ condition: it.condition, works: it.works, quantity: it.quantity, comment: it.comment })
    let result = 'new'
    if (en) result = (rank[x.condition] ?? 0) < (rank[en.condition] ?? 0) ? 'worse' : (rank[x.condition] ?? 0) > (rank[en.condition] ?? 0) ? 'better' : 'same'
    items.push({ exit_item_id: x.id, entry_item_id: x.entry_item_id, room: r.label, label: x.label, category: x.category, result, entry: en && st(en), exit: st(x) })
  }
  const keys = e.keys.map((k) => {
    const x = c.keys.find((y) => y.kind === k.kind && y.destination === k.destination)
    const n = x?.quantity ?? 0
    return { kind: k.kind, destination: k.destination, entry: k.quantity, exit: n, result: n < k.quantity ? 'missing' : 'same' }
  })
  return { items, keys, flagged: [...items, ...keys].filter((x) => x.result === 'worse' || x.result === 'missing').length,
    inventory_id: c.id, entry_inventory_id: e.id, entry_done_on: e.done_on, exit_done_on: c.done_on, state: c.state }
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
  if (c.kind === 'exit') {
    for (const r of c.rooms) for (const it of r.items) if (it.to_check) blocking.push({ code: 'exit-item-to-check', stage: 'complete', room: r.label, item: it.label })
    if (!c.tenant_new_address) blocking.push({ code: 'exit-new-address-missing', stage: 'complete' })
    if (!c.keys_returned_on) blocking.push({ code: 'exit-keys-returned-missing', stage: 'complete' })
  }
  blocking.push({ code: 'party-not-signed', stage: 'issue', party: c.parties[0]?.name })
  return { blocking, warnings: [] }
}

export function inventoryRoutes(ctx) {
  const { state, json, invalid, uuid, record } = ctx
  const ctxRecord = record
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
  const view = (c) => {
    if (c.kind !== 'exit') return { ...c, checks: checks(c) }
    const byExit = Object.fromEntries(compare(state, c).items.map((r) => [r.exit_item_id, r.entry]))
    return { ...c, checks: checks(c), rooms: c.rooms.map((r) => ({ ...r, items: r.items.map((it) => ({ ...it, entry: byExit[it.id] })) })) }
  }
  const moves = { schedule: ['draft', 'scheduled'], start: ['scheduled', 'in_progress'], complete: ['in_progress', 'completed'], reopen: ['completed', 'in_progress'], issue: ['signed', 'issued'] }

  // The capture routes of tenure-api (Q-111), and the photo pipeline (Q-110)
  // with its signed links on the archive origin.
  function capture(req, res, path, entry) {
    const m = /^\/inventories\/([^/]+)(?:\/(items|meters|keys|transitions|photos|preview|signatures|comparison)(?:\/([^/]+))?(\/content)?)?$/.exec(path)
    if (!m) return false
    if (state.role === 'accountant') return forbidden(res)
    const c = state.captures[m[1]]
    if (!c) return json(res, 404, { type: 'http/not-found', status: 404, title: 'Ressource introuvable.' })
    const sub = m[2]
    if (req.method === 'GET' && !sub) return json(res, 200, view(c), { ETag: `W/"${c.version}"` })
    const sigView = () => ({ state: c.state, esign_available: state.esign !== false, parties: c.parties, signatures: c.signatures,
      document_id: c.document_id, request: c.requests.at(-1) && { ...c.requests.at(-1), signers: c.requests.at(-1).signers.map((x) => ({ ...x,
        link: state.role === 'owner' && c.requests.at(-1).state === 'pending' && !x.signed ? x.link : undefined })) } })
    const notSignable = (res) => json(res, 409, { type: 'inventory/not-signable', status: 409, title: 'L’état des lieux se signe une fois la saisie terminée.' })
    // The last signature issues the EE document.
    const recordSigned = (signers, method, evidence) => {
      for (const x of signers) {
        const pt = c.parties.find((p) => p.party === x.party && p.name === x.signer_name)
        pt.signed = true
        c.signatures.push({ party: x.party, signer_name: x.signer_name, method, signed_at: new Date().toISOString(), reservations: x.reservations ?? '', evidence_document_id: evidence })
      }
      if (c.parties.every((p) => p.signed)) {
        c.state = 'issued'
        c.document_id = uuid()
        const inv = state.inventories.find((i) => i.id === c.id)
        if (inv) Object.assign(inv, { state: 'issued', document_id: c.document_id })
      }
      ctxRecord('inventory.signature.add', 'inventory', c.id, null, { method, signers })
    }
    if (sub === 'preview' && req.method === 'GET') {
      if (c.state !== 'completed') return notSignable(res)
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' })
      res.end('%PDF-1.7\n% copie à signer\n%%EOF\n')
      return true
    }
    if (sub === 'signatures' && req.method === 'GET' && !m[3]) return json(res, 200, sigView())
    if (sub === 'comparison' && req.method === 'GET') {
      if (c.kind !== 'exit') return json(res, 409, { type: 'inventory/comparison-unavailable', status: 409, title: 'La comparaison porte sur un état des lieux de sortie saisi à partir de l’entrée.' })
      return json(res, 200, compare(state, c))
    }
    if (req.method === 'GET' && sub === 'photos' && m[4]) return json(res, 200, { url: `${state.archive}/photo/${m[3]}`, expires_at: new Date(Date.now() + 600000).toISOString() })
    if (state.role !== 'owner') return forbidden(res)
    const b = entry.body ?? {}
    const header = ['draft', 'scheduled', 'in_progress'].includes(c.state)
    const items = ['draft', 'in_progress'].includes(c.state)
    if (!sub && req.method === 'PUT') {
      if (!header) return notEditable(res)
      if (entry.ifMatch !== `W/"${c.version}"`) return stale(res)
      if (b.keys_returned_on && b.keys_returned_on > new Date().toISOString().slice(0, 10)) return invalid(res, [{ field: 'keys_returned_on', message: 'La remise des clés ne peut pas être dans le futur.' }])
      Object.assign(c, { done_on: b.done_on, scheduled_at: b.scheduled_at, place: b.place ?? '', observations: b.observations ?? '' })
      if (c.kind === 'exit') Object.assign(c, { keys_returned_on: b.keys_returned_on, tenant_new_address: b.tenant_new_address ?? '' })
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
      // staleItem: another writer saved this item just before, once.
      if (state.staleItem === it.label) { delete state.staleItem; Object.assign(it, { condition: 'fair', version: it.version + 1 }); return stale(res) }
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
    if (sub === 'signatures') {
      const pending = c.requests.find((r) => r.state === 'pending')
      if (m[3] === 'refresh') {
        if (!pending) return json(res, 200, sigView())
        for (const x of pending.signers) if ((state.esignSigned ?? []).includes(x.party + ':' + x.signer_name)) x.signed = true
        if (pending.signers.every((x) => x.signed)) {
          pending.state = 'done'
          recordSigned(pending.signers, 'esign', uuid())
        }
        return json(res, 200, sigView())
      }
      if (m[3] === 'cancel') {
        if (!pending) return json(res, 404, { status: 404 })
        pending.state = 'cancelled'
        ctxRecord('inventory.signature.cancel', 'inventory', c.id, null, {})
        return json(res, 200, sigView())
      }
      if (c.state !== 'completed') return notSignable(res)
      if (pending) return json(res, 409, { type: 'inventory/signature-pending', status: 409, title: 'Une demande de signature électronique est en cours : terminez-la ou annulez-la d’abord.' })
      const open = c.parties.filter((p) => !p.signed)
      const errors = []
      ;(b.signers ?? []).forEach((x, i) => {
        if (!open.some((p) => p.party === x.party && p.name === x.signer_name)) errors.push({ field: `signers[${i}].signer_name`, message: 'Cette personne n’est pas une partie qui reste à signer.' })
        if (b.method === 'esign' && !/^[^@\s]+@[^@\s]+$/.test(x.email ?? '')) errors.push({ field: `signers[${i}].email`, message: 'Adresse e-mail attendue : le prestataire de signature l’exige.' })
      })
      if (errors.length) return invalid(res, errors)
      if (b.method === 'wet_scan') {
        if (!b.document_id) return invalid(res, [{ field: 'document_id', message: 'La copie signée est obligatoire.' }])
        recordSigned(b.signers, 'wet_scan', b.document_id)
        return json(res, 200, sigView())
      }
      if (state.esign === false) return json(res, 409, { type: 'inventory/esign-unavailable', status: 409, title: 'La signature électronique n’est pas configurée : utilisez la copie signée à la main.' })
      c.requests.push({ id: uuid(), provider: 'yousign', state: 'pending', created_at: new Date().toISOString(),
        signers: b.signers.map((x, i) => ({ party: x.party, signer_name: x.signer_name, link: `https://sign.example.test/s${i + 1}`, signed: false, reservations: x.reservations })) })
      ctxRecord('inventory.signature.request', 'inventory', c.id, null, {})
      return json(res, 200, sigView())
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

  // The completion routes (tenure-api Q-114): windows from the entry's day
  // (ten days; October for an entry done from June to September), a request
  // within its window, the decision per line issuing an EC document.
  const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
  const todayParis = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
  function windows(c) {
    if (c.state !== 'issued' || c.mode === 'upload' || !c.done_on) return undefined
    const w = { ten_day_ends_on: addDays(c.done_on, 10) }
    const [y, mo] = c.done_on.split('-').map(Number)
    if (mo >= 6 && mo <= 9) Object.assign(w, { heating_starts_on: `${y}-10-01`, heating_ends_on: `${y}-10-31` })
    return w
  }
  const isOpen = (w, c, reason, on) => !!w && (reason === 'ten_day' ? on >= c.done_on && on <= w.ten_day_ends_on
    : reason === 'heating' && !!w.heating_starts_on && on >= w.heating_starts_on && on <= w.heating_ends_on)
  function completions(req, res, path, entry) {
    const m = /^\/inventories\/([^/]+)\/completions$/.exec(path)
    const d = /^\/completions\/([^/]+)$/.exec(path)
    if (!m && !d) return false
    if (state.role === 'accountant') return forbidden(res)
    const c = m ? state.captures[m[1]] : Object.values(state.captures).find((x) => (x.completions ?? []).some((y) => y.id === d[1]))
    if (!c) return json(res, 404, { type: 'http/not-found', status: 404, title: 'Ressource introuvable.' })
    if (c.kind !== 'entry') return json(res, 409, { type: 'inventory/completion-unavailable', status: 409, title: 'Un complément porte sur un état des lieux d’entrée émis et saisi dans Tenure.' })
    c.completions ??= []
    const w = windows(c)
    if (m && req.method === 'GET') {
      const open = ['ten_day', 'heating'].filter((r) => isOpen(w, c, r, todayParis()))
      return json(res, 200, { inventory_id: c.id, done_on: c.done_on, windows: w, open, completions: c.completions })
    }
    if (state.role !== 'owner') return forbidden(res)
    const b = entry.body ?? {}
    const items = Object.fromEntries(c.rooms.flatMap((r) => r.items.map((it) => [it.id, { ...it, room: r.label }])))
    if (m && req.method === 'POST') {
      if (!w) return json(res, 409, { type: 'inventory/completion-unavailable', status: 409, title: 'Un complément porte sur un état des lieux d’entrée émis et saisi dans Tenure.' })
      if (!isOpen(w, c, b.reason, b.requested_on ?? '')) return json(res, 409, { type: 'inventory/completion-window-closed', status: 409, title: 'La demande de complément est hors du délai prévu par la loi.' })
      const errs = []
      for (const [i, l] of (b.lines ?? []).entries()) {
        const it = items[l.entry_item_id]
        if (!it) errs.push({ field: `lines[${i}].entry_item_id`, message: 'Un élément de cet état des lieux, une seule fois.' })
        else if (b.reason === 'heating' && it.category !== 'heating') errs.push({ field: `lines[${i}].entry_item_id`, message: 'Une demande pendant la période de chauffe porte sur les éléments de chauffage.' })
      }
      if (!(b.lines ?? []).length) errs.push({ field: 'lines', message: 'Au moins un élément à compléter.' })
      if (errs.length) return invalid(res, errs)
      const st = (it) => ({ condition: it.condition, works: it.works, quantity: it.quantity, comment: it.comment })
      const x = { id: uuid(), inventory_id: c.id, reason: b.reason, requested_on: b.requested_on, request_document_id: b.request_document_id, decision: 'pending', version: 1,
        lines: b.lines.map((l) => ({ entry_item_id: l.entry_item_id, room: items[l.entry_item_id].room, label: items[l.entry_item_id].label, category: items[l.entry_item_id].category,
          entry: st(items[l.entry_item_id]), requested: { condition: l.condition, works: l.works, comment: l.comment } })) }
      c.completions.push(x)
      ctxRecord('inventory.completion.create', 'inventory_completion', x.id, null, b)
      return json(res, 201, x, { ETag: `W/"${x.version}"` })
    }
    if (d && req.method === 'PUT') {
      const x = c.completions.find((y) => y.id === d[1])
      if (x.decision !== 'pending') return json(res, 409, { type: 'inventory/completion-decided', status: 409, title: 'Cette demande de complément est déjà tranchée.' })
      if (entry.ifMatch !== `W/"${x.version}"`) return stale(res)
      const by = Object.fromEntries((b.lines ?? []).map((l) => [l.entry_item_id, l.accepted]))
      if ((b.lines ?? []).length !== x.lines.length || x.lines.some((l) => by[l.entry_item_id] === undefined))
        return invalid(res, [{ field: 'lines', message: 'Chaque ligne de la demande est acceptée ou refusée.' }])
      for (const l of x.lines) l.accepted = by[l.entry_item_id]
      const n = x.lines.filter((l) => l.accepted).length
      Object.assign(x, { decision: n === x.lines.length ? 'accepted' : n ? 'partial' : 'refused', decided_on: b.decided_on ?? todayParis(), document_id: uuid(), version: x.version + 1 })
      ctxRecord('inventory.completion.decide', 'inventory_completion', x.id, null, b)
      return json(res, 200, x, { ETag: `W/"${x.version}"` })
    }
    return json(res, 405, { status: 405 })
  }

  return function route(req, res, path, entry) {
    if (completions(req, res, path, entry) !== false) return true
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
