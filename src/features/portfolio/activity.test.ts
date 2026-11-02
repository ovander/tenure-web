import { describe, expect, it } from 'vitest'
import { changedFields } from './activity'

describe('changedFields', () => {
  it('lists changed fields, nested values compared by content, bookkeeping ignored', () => {
    expect(
      changedFields(
        { address: 'a', lot: '', shares: [{ bp: 10000 }], version: 1, updated_at: 'x' },
        { address: 'b', lot: '', shares: [{ bp: 10000 }], version: 2, updated_at: 'y', dpe_class: 'C' },
      ),
    ).toEqual(['address', 'dpe_class'])
    expect(changedFields(null, null)).toEqual([])
  })
})
