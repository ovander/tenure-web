// A small model of tenure-api's tax summary routes (internal/tax): enough for
// the screen paths of RENT-FE-001 flow 4, not a second implementation.
//   step_up   POST /tax/summaries answers 401 auth/step-up-required until
//             state.stepUpFresh is set, as a sign-in older than the limit would
//   compute   returns state.taxFixture (a summary made up for the test) as a draft
//   issue     freezes it under the regime given, with a PDF and a CSV document

export function taxRoutes(ctx) {
  const { state, json, uuid } = ctx
  state.taxSummaries ??= []

  return function route(req, res, path, entry) {
    if (!path.startsWith('/tax/')) return null
    const b = entry.body
    const q = new URL(req.url, 'http://x').searchParams
    if (path === '/tax/summaries') {
      if (req.method === 'GET') {
        const items = state.taxSummaries.filter((x) => !q.get('year') || x.tax_year === Number(q.get('year')))
        return json(res, 200, { items, total: items.length, page: 1, size: 10 })
      }
      if (state.role !== 'owner') return json(res, 403, { type: 'auth/forbidden', status: 403, title: 'Accès refusé.' })
      if (state.stepUpNoMFA) return json(res, 403, { type: 'auth/mfa-required', status: 403, title: 'Cette action exige une connexion avec double authentification : activez-la sur votre compte Socrate, puis recommencez.' })
      if (!state.stepUpFresh) return json(res, 401, { type: 'auth/step-up-required', status: 401, title: 'Une authentification forte récente est nécessaire.' })
      let v = state.taxSummaries.find((x) => x.tax_year === b.year)
      if (v?.state === 'issued') return json(res, 409, { type: 'tax/already-issued', status: 409, title: 'Ce récapitulatif est déjà émis.' })
      if (!v) {
        v = { id: uuid(), tax_year: b.year, state: 'draft', version: 1 }
        state.taxSummaries.push(v)
      }
      Object.assign(v, { summary: state.taxFixture, inputs: { payments: 1, charges: 3, draft_charges: 0 }, computed_at: new Date().toISOString() })
      if (b.regime) Object.assign(v, { state: 'issued', regime: b.regime, issued_at: new Date().toISOString(), document_id: uuid(), csv_document_id: uuid() })
      return json(res, 200, v)
    }
    return json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
  }
}
