// Test server for the Playwright smoke: it serves dist/ the way tenure does
// (tenure-api internal/httpapi/static.go): the CSP of the web app with a fresh
// style nonce written into index.html, an SPA fallback, and long caching of
// hashed assets. /bff and /api/v1 are mocks whose state the tests set through
// /__mock (never part of the bundle).
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { extname, join, normalize } from 'node:path'
import { leaseRoutes } from './mock-leases.mjs'
import { billingRoutes } from './mock-billing.mjs'
import { chargeRoutes } from './mock-charges.mjs'
import { taxRoutes } from './mock-tax.mjs'
import { docRoutes } from './mock-docs.mjs'
import { inventoryRoutes } from './mock-inventory.mjs'

const dist = new URL('../dist/', import.meta.url).pathname
const port = Number(process.env.PORT ?? 4173)
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
}
// The archive: inventory photos come from the object store's own origin
// through signed links (tenure-api Q-110, INV-OD-12), here a second port.
const archivePort = port + 1
const archive = `http://127.0.0.1:${archivePort}`
export const csp = (nonce) =>
  "default-src 'self'; script-src 'self'; " + `style-src 'self' 'nonce-${nonce}'; ` +
  `img-src 'self' data: blob: ${archive}; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; ` +
  "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"

const fresh = () => ({
  authenticated: true,
  csrf: 'csrf-test-token',
  owner: { id: '00000000-0000-7000-8000-000000000001', legal_name: 'Bailleur Test', address: '1 rue de la Paix, Paris', tax_id: '', language: 'fr', version: 3 },
  extraScopes: [],
  // role of the scope's own row: 'owner', or another role to read a granted scope only
  role: 'owner',
  assets: [],
  diagnostics: [],
  events: [],
  seq: 0,
  tenants: [],
  leases: [],
  leaseDocs: [],
  guarantees: [],
  inventories: [],
  uploads: [],
  // Legal parameters, made up on purpose: the app must read them, never know
  // them (tenure-api /params, /params/irl).
  params: {
    lease_term_months: { unfurnished: 30, unfurnished_legal_owner: 60, furnished: 10, furnished_student: 8 },
    mobility_term_months: { min: 2, max: 8 },
    'deposit_max_months.unfurnished': 1,
    'deposit_max_months.furnished': 3,
    'deposit_max_months.mobility': 0,
  },
  irl: [{ quarter: '2026-Q1', value: 14590, published_on: '2026-04-15' }, { quarter: '2026-Q2', value: 14632, published_on: '2026-07-15' }],
  runs: [{ id: 'r1', job: 'billing.monthly', period: '2026-11', status: 'succeeded', finished_at: '2026-11-01T05:00:12Z' }],
  requests: [],
  archive,
})
let state = fresh()
const leases = (...a) => leaseRoutes({ state, json, invalid, uuid, record })(...a)
const billing = (...a) => billingRoutes({ state, json, invalid, uuid, record })(...a)
const charges = (...a) => chargeRoutes({ state, json, invalid, uuid, record })(...a)
const tax = (...a) => taxRoutes({ state, json, invalid, uuid, record })(...a)
const docs = (...a) => docRoutes({ state, json, invalid, uuid, record })(...a)
const inventory = (...a) => inventoryRoutes({ state, json, invalid, uuid, record })(...a)

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json', ...headers })
  res.end(JSON.stringify(body))
  return true
}
// body reads a JSON body, or a multipart one as its fields, the file part
// becoming its file name.
const body = async (req) => {
  let s = ''
  for await (const c of req) s += c
  const ct = req.headers['content-type'] ?? ''
  if (ct.startsWith('multipart/form-data')) {
    const out = {}
    for (const m of s.matchAll(/Content-Disposition: form-data; name="([^"]+)"(?:; filename="([^"]*)")?\r\n(?:[^\r]*\r\n)*?\r\n([\s\S]*?)\r\n--/g))
      out[m[1]] = m[2] !== undefined ? m[2] : m[3]
    return out
  }
  return s ? JSON.parse(s) : undefined
}

function me() {
  const o = state.owner
  const own = o ? [{ owner_id: o.id, legal_name: o.legal_name, role: state.role }] : []
  const scopes = [...own, ...state.extraScopes]
  return { sub: 'sub-test', admin: !!state.admin, language: o?.language ?? 'fr', scopes, active_scope: scopes[0], owner: o }
}

async function api(req, res, path) {
  const unsafe = !['GET', 'HEAD'].includes(req.method)
  const entry = { method: req.method, path, csrf: req.headers['x-csrf-token'], scope: req.headers['x-owner-scope'], ifMatch: req.headers['if-match'] }
  if (unsafe) entry.body = await body(req)
  state.requests.push(entry)
  if (!state.authenticated) return json(res, 401, { type: 'auth/unauthenticated', status: 401, title: 'Authentification requise.' })
  // state.delay[path] slows a GET down, to put a screen's load in a race.
  if (!unsafe && state.delay?.[path]) await new Promise((r) => setTimeout(r, state.delay[path]))
  if (unsafe && entry.csrf !== state.csrf) return json(res, 403, { type: 'bff/csrf', status: 403, title: 'Jeton CSRF invalide.' })
  if (path === '/me' && req.method === 'GET') return json(res, 200, me())
  if (path === '/me' && req.method === 'PUT') {
    const v = state.owner?.version
    if (state.owner && entry.ifMatch !== `W/"${v}"`) return json(res, 412, { type: 'http/stale', status: 412, title: 'Version périmée.' })
    if (!entry.body?.legal_name) return json(res, 422, { type: 'invariant/fields', status: 422, title: 'Données invalides.', errors: [{ field: 'legal_name', message: 'Le nom est obligatoire.' }] })
    state.owner = { ...(state.owner ?? { id: '00000000-0000-7000-8000-000000000001' }), ...entry.body, version: (v ?? 0) + 1 }
    return json(res, state.owner.version === 1 ? 201 : 200, state.owner, { ETag: `W/"${state.owner.version}"` })
  }
  if (path === '/params/irl') return json(res, 200, state.irl)
  if (path === '/params') {
    const key = new URL(req.url, 'http://x').searchParams.get('key')
    const rows = Object.entries(state.params).filter(([k]) => !key || k === key).map(([k, value]) => ({ key: k, value, effective_from: '2024-01-01', source: 'test' }))
    return json(res, 200, rows)
  }
  if (path.startsWith('/jobs/runs')) return json(res, 200, { items: state.runs, total: state.runs.length, page: 1, size: 10 })
  if (assets(req, res, path, entry)) return
  if (billing(req, res, path, entry)) return
  if (charges(req, res, path, entry)) return
  if (tax(req, res, path, entry)) return
  if (inventory(req, res, path, entry)) return
  if (docs(req, res, path, entry)) return
  if (leases(req, res, path, entry)) return
  return json(res, 404, { type: 'about:blank', status: 404, title: 'Introuvable.' })
}

// A small model of tenure-api's portfolio rules (internal/portfolio): enough for
// the screens' paths, not a second implementation.
const uuid = () => `00000000-0000-7000-8000-${String(++state.seq).padStart(12, '0')}`
const record = (action, type, id, before, after) =>
  state.events.unshift({ id: state.events.length + 1, action, entity_type: type, entity_id: id, actor_sub: 'sub-test', occurred_at: new Date().toISOString(), before, after })
function checkAsset(b) {
  const errors = []
  if (!b.address?.trim()) errors.push({ field: 'address', message: 'L’adresse est obligatoire.' })
  if (b.controlled_zone && b.kind !== 'box' && (!b.rent_control_zone || !b.rent_control_category))
    errors.push({ field: 'rent_control_zone', message: 'Zone et catégorie d’encadrement obligatoires en zone encadrée.' })
  return errors
}
const invalid = (res, errors) => json(res, 422, { type: 'invariant/fields', status: 422, title: 'Données invalides.', errors })
function assets(req, res, path, entry) {
  const m = /^\/assets(?:\/([^/]+))?(\/diagnostics)?$/.exec(path) ?? /^\/diagnostics\/([^/]+)$/.exec(path)
  if (path.startsWith('/audit/events')) {
    const q = new URL(req.url, 'http://x').searchParams
    const items = state.events.filter((e) => e.entity_type === q.get('entity_type') && e.entity_id === q.get('entity_id'))
    return json(res, 200, { items, total: items.length, page: 1, size: 50 })
  }
  if (!m) return null
  const write = req.method !== 'GET'
  if (write && state.role !== 'owner') return json(res, 403, { type: 'auth/forbidden', status: 403, title: 'Accès refusé.' })
  const b = entry.body
  if (path.startsWith('/diagnostics/')) {
    const d = state.diagnostics.find((x) => x.id === m[1])
    if (!d) return json(res, 404, { status: 404 })
    if (entry.ifMatch !== `W/"${d.version}"`) return json(res, 412, { type: 'http/stale', status: 412, title: 'Version périmée.' })
    Object.assign(d, b, { version: d.version + 1 })
    return json(res, 200, d)
  }
  if (!m[1]) {
    if (req.method === 'GET') {
      const q = new URL(req.url, 'http://x').searchParams
      const page = Number(q.get('page') ?? 1), size = Number(q.get('size') ?? 20)
      return json(res, 200, { items: state.assets.slice((page - 1) * size, page * size), total: state.assets.length, page, size })
    }
    const errors = checkAsset(b)
    if (errors.length) return invalid(res, errors)
    const a = { ...b, tense_zone: !!(b.tense_zone || b.controlled_zone), id: uuid(), version: 1, shares: b.shares ?? [{ owner_id: state.owner.id, bp: 10000 }] }
    state.assets.push(a)
    record('asset.create', 'asset', a.id, null, a)
    return json(res, 201, a)
  }
  const a = state.assets.find((x) => x.id === m[1])
  if (!a) return json(res, 404, { type: 'http/not-found', status: 404, title: 'Introuvable.' })
  if (m[2]) {
    if (req.method === 'GET') return json(res, 200, state.diagnostics.filter((d) => d.asset_id === a.id))
    if (b.kind === 'dpe' && !b.not_required_reason && !/^[A-G]$/.test(b.result ?? '')) return invalid(res, [{ field: 'result', message: 'Classe DPE attendue : A à G.' }])
    const d = { ...b, id: uuid(), asset_id: a.id, version: 1 }
    state.diagnostics.push(d)
    return json(res, 201, d)
  }
  if (req.method === 'GET') return json(res, 200, a, { ETag: `W/"${a.version}"` })
  if (!entry.ifMatch) return json(res, 428, { type: 'http/precondition-required', status: 428 })
  if (entry.ifMatch !== `W/"${a.version}"`) return json(res, 412, { type: 'http/stale', status: 412, title: 'Version périmée.' })
  if (b.kind !== a.kind) return json(res, 409, { type: 'asset/kind-immutable', status: 409, title: 'Le type d’un bien ne peut pas être modifié.' })
  const errors = checkAsset(b)
  if (errors.length) return invalid(res, errors)
  const before = { ...a }
  Object.assign(a, b, { tense_zone: !!(b.tense_zone || b.controlled_zone), version: a.version + 1 })
  record('asset.update', 'asset', a.id, before, { ...a })
  return json(res, 200, a)
}

async function file(res, name) {
  const p = normalize(join(dist, name))
  if (!p.startsWith(dist)) return false
  try {
    const st = await stat(p)
    if (!st.isFile()) return false
  } catch {
    return false
  }
  const nonce = randomBytes(16).toString('base64')
  let data = await readFile(p)
  if (name === 'index.html') data = Buffer.from(data.toString('utf8').replace('__CSP_NONCE__', nonce))
  res.writeHead(200, {
    'Content-Type': types[extname(p)] ?? 'application/octet-stream',
    'Content-Security-Policy': csp(nonce),
    'Cache-Control': name.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(data)
  return true
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const path = url.pathname
  try {
    if (path === '/__mock/reset') { state = fresh(); return json(res, 200, {}) }
    if (path === '/__mock/state') { Object.assign(state, (await body(req)) ?? {}); return json(res, 200, {}) }
    if (path === '/__mock/bump') { const a = [...state.assets, ...state.tenants].find((x) => x.id === url.searchParams.get('id')); if (a) a.version += 1; return json(res, 200, a ?? {}) }
    if (path === '/__mock/requests') return json(res, 200, state.requests)
    if (path === '/bff/session') return json(res, 200, state.authenticated ? { authenticated: true, user: { sub: 'sub-test', name: 'Test', roles: [] }, csrf: state.csrf } : { authenticated: false })
    if (path === '/bff/login') { state.requests.push({ method: 'GET', path: '/bff/login', query: url.search }); res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<p id="socrate">Socrate</p>') }
    if (path === '/bff/logout') {
      state.requests.push({ method: req.method, path, csrf: req.headers['x-csrf-token'] })
      if (req.headers['x-csrf-token'] !== state.csrf) return json(res, 403, { type: 'bff/csrf', status: 403 })
      state.authenticated = false
      res.writeHead(204); return res.end()
    }
    if (path.startsWith('/api/v1/')) return await api(req, res, path.slice('/api/v1'.length))
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 404, { status: 404 })
    const name = path === '/' ? 'index.html' : path.slice(1)
    if (await file(res, name)) return
    if (extname(name)) return json(res, 404, { status: 404 })
    await file(res, 'index.html')
  } catch (e) {
    json(res, 500, { status: 500, title: String(e) })
  }
}).listen(port, '127.0.0.1', () => console.log(`e2e server on http://127.0.0.1:${port}`))

// The archive serves a signed photo link as an image, nothing else.
createServer((req, res) => {
  if (!/^\/photo\/[0-9a-f-]+$/.test(new URL(req.url ?? '/', archive).pathname)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' })
  res.end('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="#7c3aed"/></svg>')
}).listen(archivePort, '127.0.0.1')
