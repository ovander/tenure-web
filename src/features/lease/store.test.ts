import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const calls: { method: string; path: string; body?: unknown; fields?: unknown; file?: string; ifMatch?: unknown }[] = []
vi.mock('@/api/client', () => ({
  api: {
    get: vi.fn(async (path: string) => {
      calls.push({ method: 'GET', path })
      return { data: path.includes('/documents?') || path === '/documents' ? { items: [] } : { id: 'l1', items: [], total: 0 }, status: 200 }
    }),
    post: vi.fn(async (path: string, body?: unknown) => {
      calls.push({ method: 'POST', path, body })
      return { data: { id: 'x' }, status: 201 }
    }),
    put: vi.fn(async (path: string, body: unknown, opts: { ifMatch?: unknown }) => {
      calls.push({ method: 'PUT', path, body, ifMatch: opts?.ifMatch })
      return { data: { id: 'x' }, status: 200 }
    }),
    upload: vi.fn(async (path: string, fields: unknown, file: File) => {
      calls.push({ method: 'UPLOAD', path, fields, file: file.name })
      return { data: { id: 'doc1' }, status: 201 }
    }),
  },
}))

const { useLeases, toLeaseInput, nextActions, guarantorOf, tenantName } = await import('./store')

beforeEach(() => {
  setActivePinia(createPinia())
  calls.length = 0
})

describe('lease store', () => {
  it('follows tenure-api lifecycle', () => {
    expect(nextActions).toEqual({ draft: ['activate'], active: ['notice'], notice: ['end'], ended: ['close'], closed: [] })
  })

  it('builds the PUT body from a lease, without its server fields', () => {
    const input = toLeaseInput({
      id: 'l1', state: 'draft', version: 3, kind: 'unfurnished', asset_ids: ['a1'], tenants: [{ tenant_id: 't1', solidary: true }],
      start_on: '2026-12-01', end_on: '', rent_cents: 80000, rent_breakdown: [], mobility_reason: undefined,
    })
    expect(input).not.toHaveProperty('id')
    expect(input).not.toHaveProperty('state')
    expect(input).not.toHaveProperty('version')
    expect(input.end_on).toBeUndefined()
    expect(input.rent_breakdown).toBeUndefined()
    expect(input.rent_cents).toBe(80000)
  })

  it('sends transitions, guarantee edits with their version, and uploads linked to the lease', async () => {
    const s = useLeases()
    await s.transition('l1', 'notice', '2029-11-30')
    await s.saveGuarantee('l1', { kind: 'deposit', amount_cents: 80000 })
    await s.saveGuarantee('l1', { kind: 'deposit', status: 'settled' }, { id: 'g1', version: 2 })
    await s.upload('contract', { id: 'l1', asset_ids: ['a1', 'a2'] }, new File(['x'], 'signé.pdf'), 'doc-ct')
    expect(calls).toEqual([
      { method: 'POST', path: '/leases/l1/transitions', body: { action: 'notice', end_on: '2029-11-30' } },
      { method: 'POST', path: '/leases/l1/guarantees', body: { kind: 'deposit', amount_cents: 80000 } },
      { method: 'PUT', path: '/guarantees/g1', body: { kind: 'deposit', status: 'settled' }, ifMatch: 2 },
      { method: 'UPLOAD', path: '/documents', fields: { class: 'contract', lease_id: 'l1', asset_id: 'a1', signs_document_id: 'doc-ct' }, file: 'signé.pdf' },
    ])
  })

  it('reads guarantors and names tenants', () => {
    expect(guarantorOf({ guarantor: { name: 'Paul' } as never }).name).toBe('Paul')
    expect(guarantorOf({})).toEqual({})
    expect(tenantName({ names: ['Nina Faure', 'Léo Faure'] })).toBe('Nina Faure, Léo Faure')
    expect(tenantName(undefined)).toBe('')
  })
})
