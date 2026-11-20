import { describe, expect, it } from 'vitest'
import { PhotoQueue, blocking, changed, conditions, fitSize, fresher, hasWorks, headerEditable, itemsEditable, progress, serialByKey, type Photo } from './capture'

describe('capture', () => {
  it('counts every comparison result but « same » as a change', () => {
    expect(['same', 'better', 'worse', 'missing', 'new', undefined].map(changed)).toEqual([false, true, true, true, true, false])
  })
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

describe('signatures', () => {
  it('lists the parties still to sign and keys them by party and name', async () => {
    const { unsigned, partyKey } = await import('./capture')
    const s = { parties: [{ party: 'owner', name: 'A', signed: true }, { party: 'tenant', name: 'Léa', signed: false }, { party: 'tenant', name: 'Paul' }] }
    expect(unsigned(s).map((p) => p.name)).toEqual(['Léa', 'Paul'])
    expect(unsigned({})).toEqual([])
    expect(partyKey({ party: 'tenant', name: 'Léa' })).toBe('tenant:Léa')
    expect(partyKey({ party: 'tenant', signer_name: 'Léa' })).toBe('tenant:Léa')
  })
})

describe('fresher', () => {
  it('drops a read older than what a save answered, keeps an equal or newer one', () => {
    expect(fresher({ version: 7 }, { version: 6 })).toBe(false)
    expect(fresher({ version: 7 }, { version: 7 })).toBe(true)
    expect(fresher({ version: 7 }, { version: 9 })).toBe(true)
    expect(fresher({}, { version: 1 })).toBe(true)
  })
})

describe('serialByKey', () => {
  it('runs the saves of one item one after the other, once more with the latest edit', async () => {
    const log: string[] = []
    let release: (() => void) | undefined
    const save = serialByKey(async (key) => {
      log.push(`start ${key}`)
      if (!release) await new Promise<void>((r) => { release = r })
      log.push(`end ${key}`)
    })
    const first = save('a')
    const second = save('a')
    const third = save('a')
    const other = save('b')
    expect(log).toEqual(['start a', 'start b', 'end b'])
    release?.()
    await Promise.all([first, second, third, other])
    // a ran twice (the two later calls collapse into one rerun), b alongside.
    expect(log.filter((l) => l === 'start a')).toHaveLength(2)
    expect(log.filter((l) => l === 'start b')).toHaveLength(1)
    expect(log.indexOf('end a')).toBeLessThan(log.lastIndexOf('start a'))
  })
  it('lets a later save run after a failed one', async () => {
    let n = 0
    const save = serialByKey(async () => {
      n++
      if (n === 1) throw new Error('boom')
    })
    await expect(save('a')).rejects.toThrow('boom')
    await save('a')
    expect(n).toBe(2)
  })
})

