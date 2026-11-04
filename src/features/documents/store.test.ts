import { describe, expect, it } from 'vitest'
import { waitExport, type ExportView } from './store'

describe('waitExport', () => {
  const states = (...s: ExportView['state'][]) => {
    let i = 0
    return async (): Promise<ExportView> => ({ id: 'x', state: s[Math.min(i++, s.length - 1)] })
  }
  const noSleep = async () => undefined

  it('polls until the export is ready', async () => {
    expect((await waitExport(states('pending', 'pending', 'ready'), 1, 10, noSleep)).state).toBe('ready')
  })
  it('stops on a failure', async () => {
    expect((await waitExport(states('pending', 'failed'), 1, 10, noSleep)).state).toBe('failed')
  })
  it('gives up after the tries allowed, on the last state seen', async () => {
    let calls = 0
    const get = async (): Promise<ExportView> => { calls++; return { state: 'pending' } }
    expect((await waitExport(get, 1, 3, noSleep)).state).toBe('pending')
    expect(calls).toBe(3)
  })
})
