// Test server for the Playwright smoke: it serves dist/ the way tenure does
// (tenure-api internal/httpapi/static.go): the CSP of the web app with a fresh
// style nonce written into index.html, an SPA fallback, and long caching of
// hashed assets. /bff and /api/v1 are mocks whose state the tests set through
// /__mock (never part of the bundle).
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { extname, join, normalize } from 'node:path'

const dist = new URL('../dist/', import.meta.url).pathname
const port = Number(process.env.PORT ?? 4173)
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
}
export const csp = (nonce) =>
  "default-src 'self'; script-src 'self'; " + `style-src 'self' 'nonce-${nonce}'; ` +
  "img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; " +
  "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"

const fresh = () => ({
  authenticated: true,
  csrf: 'csrf-test-token',
  owner: { id: '00000000-0000-7000-8000-000000000001', legal_name: 'Bailleur Test', address: '1 rue de la Paix, Paris', tax_id: '', language: 'fr', version: 3 },
  extraScopes: [],
  runs: [{ id: 'r1', job: 'billing.monthly', period: '2026-11', status: 'succeeded', finished_at: '2026-11-01T05:00:12Z' }],
  requests: [],
})
let state = fresh()

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json', ...headers })
  res.end(JSON.stringify(body))
}
const body = async (req) => {
  let s = ''
  for await (const c of req) s += c
  return s ? JSON.parse(s) : undefined
}

function me() {
  const o = state.owner
  const own = o ? [{ owner_id: o.id, legal_name: o.legal_name, role: 'owner' }] : []
  const scopes = [...own, ...state.extraScopes]
  return { sub: 'sub-test', admin: false, language: o?.language ?? 'fr', scopes, active_scope: scopes[0], owner: o }
}

async function api(req, res, path) {
  const unsafe = !['GET', 'HEAD'].includes(req.method)
  const entry = { method: req.method, path, csrf: req.headers['x-csrf-token'], scope: req.headers['x-owner-scope'], ifMatch: req.headers['if-match'] }
  if (unsafe) entry.body = await body(req)
  state.requests.push(entry)
  if (!state.authenticated) return json(res, 401, { type: 'auth/unauthenticated', status: 401, title: 'Authentification requise.' })
  if (unsafe && entry.csrf !== state.csrf) return json(res, 403, { type: 'bff/csrf', status: 403, title: 'Jeton CSRF invalide.' })
  if (path === '/me' && req.method === 'GET') return json(res, 200, me())
  if (path === '/me' && req.method === 'PUT') {
    const v = state.owner?.version
    if (state.owner && entry.ifMatch !== `W/"${v}"`) return json(res, 412, { type: 'http/stale', status: 412, title: 'Version périmée.' })
    if (!entry.body?.legal_name) return json(res, 422, { type: 'invariant/fields', status: 422, title: 'Données invalides.', errors: [{ field: 'legal_name', message: 'Le nom est obligatoire.' }] })
    state.owner = { ...(state.owner ?? { id: '00000000-0000-7000-8000-000000000001' }), ...entry.body, version: (v ?? 0) + 1 }
    return json(res, state.owner.version === 1 ? 201 : 200, state.owner, { ETag: `W/"${state.owner.version}"` })
  }
  if (path.startsWith('/jobs/runs')) return json(res, 200, { items: state.runs, total: state.runs.length, page: 1, size: 10 })
  return json(res, 404, { type: 'about:blank', status: 404, title: 'Introuvable.' })
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
