import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const calls: string[] = []
const answers: Record<string, unknown> = {}
vi.mock('@/api/client', () => ({
  api: {
    get: vi.fn(async (path: string) => {
      calls.push(`GET ${path}`)
      return { data: answers[path], status: 200 }
    }),
    post: vi.fn(async (path: string) => {
      calls.push(`POST ${path}`)
      return { data: undefined, status: 204 }
    }),
  },
  login: vi.fn(() => calls.push('login')),
  setCsrf: vi.fn((v?: string) => calls.push(`csrf ${v}`)),
  setScope: vi.fn((v?: string) => calls.push(`scope ${v}`)),
}))

const { useSession } = await import('./session')

const owner = { owner_id: 'o1', legal_name: 'A', role: 'owner' as const }
const other = { owner_id: 'o2', legal_name: 'B', role: 'accountant' as const }

beforeEach(() => {
  setActivePinia(createPinia())
  calls.length = 0
  sessionStorage.clear()
})

describe('session', () => {
  it('without a BFF session, goes to login and keeps no token', async () => {
    answers['/bff/session'] = { authenticated: false }
    expect(await useSession().load()).toBe(false)
    expect(calls).toEqual(['GET /bff/session', 'csrf undefined', 'login'])
  })

  it('keeps the CSRF token, reads /me and selects the default scope', async () => {
    answers['/bff/session'] = { authenticated: true, csrf: 'c1', user: { sub: 's', roles: [] } }
    answers['/me'] = { sub: 's', language: 'en', scopes: [owner, other], active_scope: owner, owner: { legal_name: 'A' } }
    const s = useSession()
    expect(await s.load()).toBe(true)
    expect(calls).toEqual(['GET /bff/session', 'csrf c1', 'GET /me', 'scope o1'])
    expect(s.canWrite).toBe(true)
    expect(document.documentElement.lang).toBe('en')
  })

  it('restores a remembered scope that is still granted, and only then', async () => {
    answers['/bff/session'] = { authenticated: true, csrf: 'c1' }
    answers['/me'] = { sub: 's', scopes: [owner, other], active_scope: owner }
    sessionStorage.setItem('tenure.scope', 'o2')
    const s = useSession()
    await s.load()
    expect(s.active?.owner_id).toBe('o2')
    expect(s.canWrite).toBe(false)

    setActivePinia(createPinia())
    sessionStorage.setItem('tenure.scope', 'revoked')
    const s2 = useSession()
    await s2.load()
    expect(s2.active?.owner_id).toBe('o1')
  })
})
