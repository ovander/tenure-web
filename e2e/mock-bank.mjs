// A small model of tenure-api's bank reconciliation (internal/payment bank,
// internal/charge bank; Q-123 to Q-125): enough for the screen's paths, not a
// second implementation.
//   accounts      state.bankAccounts
//   import        state.bankStatements[uploaded file name] = lines read; a
//                 line already held (same key) counts as a duplicate
//   suggestions   state.rentSuggestions / state.chargeSuggestions[line id]
//   auto          the lines listed in state.bankSure[line id] = lease id
export function bankRoutes(ctx) {
  const { state, json, invalid, uuid, record } = ctx
  const notFound = (res) => json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
  return function route(req, res, path, entry) {
    const b = entry.body
    const q = new URL(req.url, 'http://x').searchParams
    const owned = path === '/bank-accounts' || path === '/payments/import' || path.startsWith('/bank-lines')
    if (!owned) return false
    if (req.method !== 'GET' && state.role !== 'owner') return json(res, 403, { type: 'auth/forbidden', status: 403, title: 'Accès refusé.' })
    state.bankAccounts ??= []
    state.bankLines ??= []
    if (path === '/bank-accounts') {
      if (req.method === 'GET') return json(res, 200, state.bankAccounts)
      if (!b?.label) return invalid(res, [{ field: 'label', message: 'Un libellé de 1 à 100 caractères est obligatoire.' }])
      const a = { id: uuid(), label: b.label, iban_last4: b.iban_last4, version: 1 }
      state.bankAccounts.push(a)
      record('payment.bank_account', 'bank_account', a.id, null, a)
      return json(res, 201, a)
    }
    if (path === '/payments/import') {
      const up = state.uploads.find((u) => u.id === b.document_id)
      if (!up) return json(res, 422, { type: 'payment/statement-file', status: 422, title: 'Le relevé doit être un fichier CSV ou OFX déposé.' })
      if (b.format === 'csv' && !b.mapping?.date) return json(res, 422, { type: 'payment/statement-invalid', status: 422, title: 'Ce relevé ne peut pas être lu avec ce paramétrage.' })
      const read = state.bankStatements?.[up.original_name] ?? []
      const held = new Set(state.bankLines.filter((l) => l.account_id === b.account_id).map((l) => l.key))
      const fresh = read.filter((l) => !held.has(l.key))
      if (!b.dry_run) {
        for (const l of fresh) state.bankLines.push({ id: l.id ?? uuid(), status: 'unmatched', version: 1, ...l, account_id: b.account_id })
        record('payment.bank_import', 'bank_account', b.account_id, null, { new: fresh.length })
      }
      return json(res, 200, { lines: fresh, new: fresh.length, duplicates: read.length - fresh.length })
    }
    if (path === '/bank-lines') {
      const items = state.bankLines.filter((l) => (!q.get('account_id') || l.account_id === q.get('account_id')) && (!q.get('status') || l.status === q.get('status')))
      return json(res, 200, { items, total: items.length, page: 1, size: 100 })
    }
    if (path === '/bank-lines/auto') {
      const sure = Object.entries(state.bankSure ?? {}).filter(([id]) => state.bankLines.find((l) => l.id === id && l.status === 'unmatched'))
      const left = state.bankLines.filter((l) => l.status === 'unmatched' && l.amount_cents > 0).length - sure.length
      if (!b?.dry_run) for (const [id] of sure) Object.assign(state.bankLines.find((l) => l.id === id), { status: 'matched' })
      return json(res, 200, { matched: sure.map(([id, lease]) => ({ line_id: id, suggestion: { lease_id: lease, rule: 'name_amount' } })), left })
    }
    const m = /^\/bank-lines\/([^/]+)\/(suggestions|charge-suggestions|match|charges|status)$/.exec(path)
    if (!m) return false
    const l = state.bankLines.find((x) => x.id === m[1])
    if (!l) return notFound(res)
    if (m[2] === 'suggestions') return json(res, 200, l.status === 'unmatched' ? state.rentSuggestions?.[l.id] ?? [] : [])
    if (m[2] === 'charge-suggestions') return json(res, 200, l.status === 'unmatched' ? state.chargeSuggestions?.[l.id] ?? [] : [])
    if (b?.version !== l.version) return json(res, 412, { type: 'http/stale', status: 412, title: 'Version périmée.' })
    if (m[2] === 'status') {
      if (l.status === 'matched') return json(res, 409, { type: 'payment/bank-line-state', status: 409, title: 'Cette ligne bancaire est déjà rapprochée.' })
      Object.assign(l, { status: b.status, note: b.note ?? '', version: l.version + 1 })
      return json(res, 200, l)
    }
    if (l.status !== 'unmatched') return json(res, 409, { type: 'payment/bank-line-state', status: 409, title: 'Cette ligne bancaire est déjà rapprochée.' })
    if (m[2] === 'match') {
      const sum = (b.allocations ?? []).reduce((s, a) => s + a.amount_cents, 0)
      if (sum !== l.amount_cents) return json(res, 422, { type: 'payment/bank-allocation-invalid', status: 422, title: 'La répartition doit couvrir exactement le montant de la ligne bancaire.' })
      state.bankMatches ??= []
      state.bankMatches.push({ line: l.id, allocations: b.allocations })
    } else state.bankCharges = [...(state.bankCharges ?? []), { line: l.id, charge_ids: b.charge_ids }]
    Object.assign(l, { status: 'matched', version: l.version + 1 })
    record('payment.bank_match', 'bank_line', l.id, null, l)
    return json(res, 200, { line: l, payments: [], charges: [] })
  }
}
