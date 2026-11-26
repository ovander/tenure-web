import { describe, expect, it } from 'vitest'
import { queueByKey, useLatest } from './async'

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void } {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('queueByKey', () => {
  it('runs every task of one key in order, none dropped, other keys alongside', async () => {
    const q = queueByKey()
    const log: string[] = []
    const gate = deferred()
    const a1 = q('a', async () => {
      log.push('start a1')
      await gate.promise
      log.push('end a1')
      return 1
    })
    const a2 = q('a', async () => {
      log.push('a2')
      return 2
    })
    const a3 = q('a', async () => {
      log.push('a3')
      return 3
    })
    const b = q('b', async () => {
      log.push('b')
      return 'b'
    })
    await b
    expect(log).toEqual(['start a1', 'b'])
    gate.resolve()
    expect(await Promise.all([a1, a2, a3])).toEqual([1, 2, 3])
    expect(log).toEqual(['start a1', 'b', 'end a1', 'a2', 'a3'])
  })

  it('starts a task only after the previous one settled, so it sees its result', async () => {
    const q = queueByKey()
    let version = 1
    const sent: number[] = []
    const save = () => q('line', async () => {
      sent.push(version)
      await Promise.resolve()
      version++
    })
    await Promise.all([save(), save(), save()])
    expect(sent).toEqual([1, 2, 3])
  })

  it('rejects a failed task on its own and runs the next one', async () => {
    const q = queueByKey()
    const failed = q('a', async () => {
      throw new Error('boom')
    })
    const next = q('a', async () => 'ok')
    await expect(failed).rejects.toThrow('boom')
    await expect(next).resolves.toBe('ok')
  })

  it('idle waits for every key, including tasks queued meanwhile', async () => {
    const q = queueByKey()
    const gate = deferred()
    const done: string[] = []
    void q('a', async () => {
      await gate.promise
      done.push('a')
      void q('b', async () => {
        done.push('b')
      })
    })
    let idle = false
    const waiting = q.idle().then(() => (idle = true))
    await Promise.resolve()
    expect(idle).toBe(false)
    gate.resolve()
    await waiting
    expect(done).toEqual(['a', 'b'])
    await q.idle() // resolves at once when nothing runs
  })
})

describe('useLatest', () => {
  it('keeps only the answer of the latest request', async () => {
    const latest = useLatest()
    let shown = ''
    const slow = deferred()
    const load = async (value: string, wait: Promise<void>) => {
      const token = latest.next()
      await wait
      if (latest.isLatest(token)) shown = value
    }
    const first = load('old', slow.promise)
    await load('new', Promise.resolve())
    slow.resolve()
    await first
    expect(shown).toBe('new')
  })

  it('is independent per guard', () => {
    const a = useLatest()
    const b = useLatest()
    const ta = a.next()
    b.next()
    b.next()
    expect(a.isLatest(ta)).toBe(true)
  })
})
