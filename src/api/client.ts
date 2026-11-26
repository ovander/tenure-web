// The API client (RENT-FE-001 §7): same-origin /api/v1 with the BFF session
// cookie, never a token. Unsafe requests carry X-CSRF-Token (from
// GET /bff/session); the active scope goes in X-Owner-Scope; a version goes in
// If-Match; errors are RFC 9457 problems. A 401 sends the user to
// /bff/login, except auth/step-up-required, which the caller offers as a
// Dialog (StepUpRequired).
import type { Problem } from './types'

export const STEP_UP = 'auth/step-up-required'

// ApiError is a problem answered by the API.
export class ApiError extends Error {
  readonly status: number
  readonly problem: Problem
  constructor(status: number, problem: Problem) {
    super(problem.title ?? `HTTP ${status}`)
    this.status = status
    this.problem = problem
  }
  get type(): string {
    return this.problem.type ?? 'about:blank'
  }
}

// StepUpRequired asks for a recent multi-factor sign-in before retrying.
export class StepUpRequired extends ApiError {}

// NetworkError is a request that got no answer.
export class NetworkError extends Error {}

// TimeoutError is a request cut because it got no full answer in time.
export class TimeoutError extends NetworkError {}

// REQUEST_TIMEOUT_MS bounds a request, its answer's body included, and
// UPLOAD_TIMEOUT_MS a multipart upload (a photo or a scan over a slow
// mobile network). Without a bound a hung request never settles, and the
// saves queued behind it for the same record (queueByKey, serialByKey) wait
// forever. Technical timeouts, not legal values.
export const REQUEST_TIMEOUT_MS = 30_000
export const UPLOAD_TIMEOUT_MS = 120_000

// send fetches url and reads its answer with read, both within ms: past
// it, the request is aborted and rejects with a TimeoutError.
async function send<T>(url: URL, init: RequestInit, ms: number, read: (res: Response) => Promise<T>): Promise<T> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    let res: Response
    try {
      res = await fetch(url, { ...init, signal: ctl.signal })
    } catch (e) {
      throw ctl.signal.aborted ? new TimeoutError(`no answer in ${ms} ms`) : new NetworkError(String(e))
    }
    try {
      return await read(res)
    } catch (e) {
      throw ctl.signal.aborted ? new TimeoutError(`no full answer in ${ms} ms`) : e
    }
  } finally {
    clearTimeout(timer)
  }
}

interface State {
  csrf?: string
  scope?: string
  onUnauthenticated: () => void
}

const state: State = { onUnauthenticated: () => login() }

export function setCsrf(token: string | undefined): void {
  state.csrf = token
}
export function setScope(ownerId: string | undefined): void {
  state.scope = ownerId
}
export function onUnauthenticated(f: () => void): void {
  state.onUnauthenticated = f
}

// loginURL is the BFF login, coming back to the current page (or to path).
export function loginURL(opts: { stepUp?: boolean; returnTo?: string } = {}): string {
  const q = new URLSearchParams()
  q.set('return_to', opts.returnTo ?? location.pathname + location.search)
  if (opts.stepUp) q.set('step_up', '1')
  return `/bff/login?${q}`
}

export function login(opts: { stepUp?: boolean; returnTo?: string } = {}): void {
  location.assign(loginURL(opts))
}

const unsafe = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export interface Options {
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  ifMatch?: string | number
  // scope overrides the active scope; null sends none (the caller's own).
  scope?: string | null
}

export interface Result<T> {
  data: T
  etag?: string
  status: number
}

// request calls the API under /api/v1 or, for an absolute path that starts
// with /bff/, the BFF.
export async function request<T>(method: string, path: string, opts: Options = {}): Promise<Result<T>> {
  const url = new URL(path.startsWith('/bff/') ? path : `/api/v1${path}`, location.origin)
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v))
  const headers: Record<string, string> = { Accept: 'application/json' }
  const multipart = opts.body instanceof FormData
  if (opts.body !== undefined && !multipart) headers['Content-Type'] = 'application/json'
  if (unsafe.has(method) && state.csrf) headers['X-CSRF-Token'] = state.csrf
  const scope = opts.scope === undefined ? state.scope : opts.scope
  if (scope && !path.startsWith('/bff/')) headers['X-Owner-Scope'] = scope
  if (opts.ifMatch !== undefined) headers['If-Match'] = typeof opts.ifMatch === 'number' ? `W/"${opts.ifMatch}"` : opts.ifMatch

  const init: RequestInit = {
    method,
    headers,
    // A FormData body is sent as multipart/form-data, the browser setting
    // its boundary (POST /documents: fields first, the file last).
    body: opts.body === undefined ? undefined : multipart ? (opts.body as FormData) : JSON.stringify(opts.body),
    credentials: 'same-origin',
    redirect: 'error',
  }
  return send(url, init, multipart ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS, async (res) => {
    if (res.ok) {
      const data = res.status === 204 ? (undefined as T) : ((await res.json()) as T)
      return { data, etag: res.headers.get('ETag') ?? undefined, status: res.status }
    }
    throw await failure(res)
  })
}

// failure turns an error answer into the error to throw, sending the user to
// login on a 401 that is not a step-up.
async function failure(res: Response): Promise<ApiError> {
  const problem = await readProblem(res)
  if (res.status === 401) {
    if (problem.type === STEP_UP) return new StepUpRequired(401, problem)
    state.onUnauthenticated()
  }
  return new ApiError(res.status, problem)
}

async function readProblem(res: Response): Promise<Problem> {
  const ct = res.headers.get('Content-Type') ?? ''
  if (ct.includes('json')) {
    try {
      return (await res.json()) as Problem
    } catch {
      // fall through
    }
  }
  return { status: res.status, title: res.statusText }
}

// blob fetches a file the API renders (a PDF), with the same session,
// scope and problem handling as request.
async function blob(path: string): Promise<Blob> {
  const headers: Record<string, string> = { Accept: 'application/pdf, application/problem+json' }
  if (state.scope) headers['X-Owner-Scope'] = state.scope
  return send(new URL(`/api/v1${path}`, location.origin), { headers, credentials: 'same-origin', redirect: 'error' }, REQUEST_TIMEOUT_MS, async (res) => {
    if (res.ok) return res.blob()
    throw await failure(res)
  })
}

export const api = {
  blob,
  get: <T>(path: string, opts?: Options) => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: Options) => request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: Options) => request<T>('PUT', path, { ...opts, body }),
  del: <T>(path: string, opts?: Options) => request<T>('DELETE', path, opts),
  // upload posts a file and its fields as multipart/form-data, fields first
  // and the file last, as POST /documents requires.
  upload: <T>(path: string, fields: Record<string, string | undefined>, file: File, opts?: Options) => {
    const form = new FormData()
    for (const [k, v] of Object.entries(fields)) if (v) form.append(k, v)
    form.append('file', file, file.name)
    return request<T>('POST', path, { ...opts, body: form })
  },
}
