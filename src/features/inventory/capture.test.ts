import { describe, expect, it } from 'vitest'
import { PhotoQueue, blocking, conditions, fitSize, hasWorks, headerEditable, itemsEditable, progress, type Photo } from './capture'

describe('capture', () => {
  it('counts the items assessed in a room', () => {
    expect(progress({ items: [{ condition: 'good' }, {}, { condition: 'poor' }] })).toEqual({ done: 2, total: 3 })
    expect(progress({})).toEqual({ done: 0, total: 0 })
  })
  it('keeps the scale in order, best first', () => {
    expect(conditions).toEqual(['new', 'good', 'fair', 'poor', 'broken'])
  })
  it('asks whether it works for appliances, electrical and plumbing only', () => {
    expect(['appliance', 'electrical', 'plumbing'].every(hasWorks)).toBe(true)
    expect(hasWorks('floor')).toBe(false)
    expect(hasWorks(undefined)).toBe(false)
  })
  it('follows what each state lets change', () => {
    const states = ['draft', 'scheduled', 'in_progress', 'completed', 'signed', 'issued'] as const
    expect(states.filter(headerEditable)).toEqual(['draft', 'scheduled', 'in_progress'])
    expect(states.filter(itemsEditable)).toEqual(['draft', 'in_progress'])
  })
  it('lists the checks blocking a stage', () => {
    const c = { checks: { blocking: [{ code: 'no-key-line', stage: 'complete' as const }, { code: 'party-not-signed', stage: 'issue' as const }] } }
    expect(blocking(c, 'complete').map((x) => x.code)).toEqual(['no-key-line'])
    expect(blocking(c, 'issue')).toHaveLength(2)
    expect(blocking({}, 'complete')).toEqual([])
  })
  it('fits a photo in the long side', () => {
    expect(fitSize(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 })
    expect(fitSize(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 })
    expect(fitSize(800, 600, 2048)).toEqual({ width: 800, height: 600 })
  })
})

describe('PhotoQueue', () => {
  const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
  const flush = () => new Promise((r) => setTimeout(r, 0))

  it('sends one at a time and keeps a failure to retry', async () => {
    const sent: string[] = []
    let fail = true
    const done: Photo[] = []
    const q = new PhotoQueue(
      async (target) => {
        sent.push(target.item_id ?? '')
        if (target.item_id === 'b' && fail) throw new Error('offline')
        return { id: `ph-${target.item_id}`, item_id: target.item_id }
      },
      (p) => done.push(p),
      () => 'not sent',
    )
    q.add({ item_id: 'a' }, file, 'blob:a')
    q.add({ item_id: 'b' }, file, 'blob:b')
    await flush()
    await flush()
    expect(sent).toEqual(['a', 'b'])
    expect(done.map((p) => p.id)).toEqual(['ph-a'])
    expect(q.items).toHaveLength(1)
    expect(q.items[0]).toMatchObject({ state: 'failed', error: 'not sent' })
    fail = false
    q.retry(q.items[0]?.key ?? '')
    await flush()
    await flush()
    expect(done.map((p) => p.id)).toEqual(['ph-a', 'ph-b'])
    expect(q.pending).toBe(0)
  })
})
