import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, NetworkError, StepUpRequired, api, loginURL, onUnauthenticated, setCsrf, setScope } from './client'

interface Call { url: URL; init: RequestInit }
let calls: Call[]
let next: () => Response

beforeEach(() => {
  calls = []
  next = () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: URL, init: RequestInit) => {
    calls.push({ url, init })
    return next()
  }))
  setCsrf('tok')
  setScope('owner-1')
})
afterEach(() => {
  vi.unstubAllGlobals()
  setCsrf(undefined)
  setScope(undefined)
})

const headers = (i = 0) => calls[i]!.init.headers as Record<string, string>
const problem = (status: number, body: object) => () =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/problem+json' } })

describe('api client', () => {
  it('sends no CSRF token on a read, and the scope', async () => {
    await api.get('/assets', { query: { page: 2, kind: undefined } })
    expect(calls[0]!.url.pathname).toBe('/api/v1/assets')
    expect(calls[0]!.url.search).toBe('?page=2')
    expect(headers()['X-CSRF-Token']).toBeUndefined()
    expect(headers()['X-Owner-Scope']).toBe('owner-1')
    expect(calls[0]!.init.credentials).toBe('same-origin')
    expect(headers()['Authorization']).toBeUndefined()
  })

  it('sends the CSRF token and If-Match on a write', async () => {
    await api.put('/me', { legal_name: 'x' }, { ifMatch: 4, scope: null })
    expect(headers()['X-CSRF-Token']).toBe('tok')
    expect(headers()['If-Match']).toBe('W/"4"')
    expect(headers()['X-Owner-Scope']).toBeUndefined()
    expect(calls[0]!.init.body).toBe('{"legal_name":"x"}')
  })

  it('calls the BFF without the /api/v1 prefix or a scope', async () => {
    await api.post('/bff/logout')
    expect(calls[0]!.url.pathname).toBe('/bff/logout')
    expect(headers()['X-Owner-Scope']).toBeUndefined()
    expect(headers()['X-CSRF-Token']).toBe('tok')
  })

  it('turns a problem into an ApiError with its fields', async () => {
    next = problem(422, { type: 'invariant/fields', title: 'Données invalides.', errors: [{ field: 'legal_name', message: 'obligatoire' }] })
    const e = await api.post('/assets', {}).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect((e as ApiError).type).toBe('invariant/fields')
    expect((e as ApiError).problem.errors?.[0]?.field).toBe('legal_name')
  })

  it('goes to login on a 401, but not on a step-up', async () => {
    const away = vi.fn()
    onUnauthenticated(away)
    next = problem(401, { type: 'auth/unauthenticated' })
    await expect(api.get('/me')).rejects.toBeInstanceOf(ApiError)
    expect(away).toHaveBeenCalledTimes(1)
    next = problem(401, { type: 'auth/step-up-required' })
    await expect(api.post('/grants', {})).rejects.toBeInstanceOf(StepUpRequired)
    expect(away).toHaveBeenCalledTimes(1)
  })

  it('uploads multipart with the file last, the CSRF token and no JSON type', async () => {
    const file = new File(['%PDF-1.7'], 'bail-signé.pdf', { type: 'application/pdf' })
    await api.upload('/documents', { class: 'contract', lease_id: 'l1', signs_document_id: undefined }, file)
    const body = calls[0]!.init.body as FormData
    expect([...body.keys()]).toEqual(['class', 'lease_id', 'file'])
    expect((body.get('file') as File).name).toBe('bail-signé.pdf')
    expect(headers()['Content-Type']).toBeUndefined()
    expect(headers()['X-CSRF-Token']).toBe('tok')
    expect(headers()['X-Owner-Scope']).toBe('owner-1')
  })

  it('reports a request without an answer as a NetworkError', async () => {
    next = () => {
      throw new TypeError('offline')
    }
    await expect(api.get('/me')).rejects.toBeInstanceOf(NetworkError)
  })

  it('builds the login URL with the return path and step-up', () => {
    expect(loginURL({ returnTo: '/tax/2025?x=1', stepUp: true })).toBe('/bff/login?return_to=%2Ftax%2F2025%3Fx%3D1&step_up=1')
  })
})
