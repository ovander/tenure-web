import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const calls: { method: string; path: string; body?: unknown; ifMatch?: unknown }[] = []
vi.mock('@/api/client', () => {
  const record = (method: string) => async (path: string, a?: unknown, b?: { ifMatch?: unknown }) => {
    const isGet = method === 'GET'
    calls.push({ method, path, body: isGet ? undefined : a, ifMatch: isGet ? (a as { ifMatch?: unknown })?.ifMatch : b?.ifMatch })
    return { data: path.endsWith('/diagnostics') && isGet ? [] : { id: 'x', items: [], total: 0 }, status: 200 }
  }
  return { api: { get: record('GET'), post: record('POST'), put: record('PUT') } }
})

const { useAssets, toInput, assetLabel } = await import('./store')

beforeEach(() => {
  setActivePinia(createPinia())
  calls.length = 0
})

describe('portfolio store', () => {
  it('builds the PUT body from the asset, shares kept as they are', () => {
    const shares = [{ owner_id: 'o1', bp: 6000 }, { owner_id: 'o2', bp: 4000 }]
    const input = toInput({ id: 'a', kind: 'apartment', address: '1 rue A', shares, version: 3, dpe_class: '', parent_asset_id: '' })
    expect(input.shares).toBe(shares)
    expect(input.dpe_class).toBeUndefined()
    expect(input.parent_asset_id).toBeUndefined()
    expect(input).not.toHaveProperty('id')
    expect(input).not.toHaveProperty('version')
  })

  it('reads a rent-control asset as tense, and keeps a tense-only asset as such (Q-W14)', () => {
    expect(toInput({ kind: 'apartment', address: 'a', controlled_zone: true }).tense_zone).toBe(true)
    expect(toInput({ kind: 'apartment', address: 'a', tense_zone: true }).tense_zone).toBe(true)
    expect(toInput({ kind: 'apartment', address: 'a', tense_zone: true }).controlled_zone).toBe(false)
    expect(toInput({ kind: 'apartment', address: 'a' }).tense_zone).toBe(false)
  })

  it('names an asset by address and lot', () => {
    expect(assetLabel({ address: '1 rue A', lot: 'Lot 2' })).toBe('1 rue A · Lot 2')
    expect(assetLabel({ address: '1 rue A', lot: '' })).toBe('1 rue A')
  })

  it('updates with the version, and saves a diagnostic by POST then by PUT with its version', async () => {
    const s = useAssets()
    await s.update('a', { kind: 'house', address: 'x' }, 4)
    await s.saveDiagnostic('a', { kind: 'dpe', result: 'C' })
    await s.saveDiagnostic('a', { kind: 'dpe', result: 'D' }, { id: 'd1', version: 2 })
    expect(calls.map((c) => [c.method, c.path, c.ifMatch])).toEqual([
      ['PUT', '/assets/a', 4],
      ['POST', '/assets/a/diagnostics', undefined],
      ['GET', '/assets/a/diagnostics', undefined],
      ['PUT', '/diagnostics/d1', 2],
      ['GET', '/assets/a/diagnostics', undefined],
    ])
  })
})
