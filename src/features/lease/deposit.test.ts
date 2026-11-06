import { describe, expect, it } from 'vitest'
import { needsApproval, retained, sharePct } from './deposit'

describe('deposit', () => {
  it('prints a share in basis points as a French percentage', () => {
    expect(sharePct(10000)).toBe('100 %')
    expect(sharePct(6400)).toBe('64 %')
    expect(sharePct(1250)).toBe('12,50 %')
    expect(sharePct(5)).toBe('0,05 %')
    expect(sharePct(undefined)).toBe('0 %')
  })
  it('tells an item already retained', () => {
    const d = { deductions: [{ exit_item_id: 'a' }, { description: 'Clé' }] }
    expect(retained(d, 'a')).toBe(true)
    expect(retained(d, 'b')).toBe(false)
  })
  it('asks for the accounts approval on a release, or a first statement in a collective building', () => {
    expect(needsApproval({ next: 'release', collective_building: false })).toBe(true)
    expect(needsApproval({ next: 'initial', collective_building: true })).toBe(true)
    expect(needsApproval({ next: 'initial', collective_building: false })).toBe(false)
    expect(needsApproval({ next: 'done', collective_building: true })).toBe(false)
  })
})
