import { describe, expect, it } from 'vitest'
import { elementCount, move, toEdit, toInput } from './layout'

describe('layout', () => {
  const view = {
    asset_id: 'a1', version: 2,
    rooms: [
      { id: 'r1', position: 1, kind: 'living' as const, label: 'Séjour', version: 1, elements: [{ id: 'e1', position: 1, category: 'floor' as const, label: 'Sol', quantity: 0, version: 1, installed_on: '2019-10-01' }] },
      { id: 'r2', position: 2, kind: 'kitchen' as const, label: 'Cuisine', version: 1, elements: [] },
    ],
  }

  it('round-trips a layout with its ids, in order, labels trimmed', () => {
    const rooms = toEdit(view)
    rooms[0]!.label = '  Grand séjour '
    expect(toInput(rooms)).toEqual({
      rooms: [
        { id: 'r1', kind: 'living', label: 'Grand séjour', elements: [{ id: 'e1', category: 'floor', label: 'Sol', quantity: 0, installed_on: '2019-10-01' }] },
        { id: 'r2', kind: 'kitchen', label: 'Cuisine', elements: [] },
      ],
    })
    expect(elementCount(rooms)).toBe(1)
  })

  it('moves within bounds only', () => {
    expect(move(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
    expect(move(['a', 'b', 'c'], 2, -2)).toEqual(['c', 'a', 'b'])
    expect(move(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
    expect(move(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
  })
})
