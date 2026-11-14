import { describe, expect, it } from 'vitest'
import { itemKey, itemLink, overdue } from './calendar'

describe('calendar', () => {
  it('names each item, with its subject', () => {
    expect(itemKey({ kind: 'diagnostic_expiry', ref: 'dpe' })).toEqual({ key: 'calendar.kind.diagnostic_expiry', params: { what: 'dpe' } })
    expect(itemKey({ kind: 'completion_window', ref: 'ten_day' }).key).toBe('calendar.kind.completion_ten_day')
    expect(itemKey({ kind: 'completion_window', ref: 'heating' }).key).toBe('calendar.kind.completion_heating')
    expect(itemKey({ kind: 'deposit_deadline' }).key).toBe('calendar.kind.deposit_deadline')
    expect(itemKey({ kind: 'maintenance_due', ref: 'chimney' }).key).toBe('calendar.kind.maintenance_chimney')
    expect(itemKey({ kind: 'maintenance_due', ref: 'vmc' }).key).toBe('calendar.kind.maintenance_other')
  })
  it('links each item to where it is dealt with', () => {
    expect(itemLink({ kind: 'diagnostic_expiry', asset_id: 'a1' })).toBe('/assets/a1/overview')
    expect(itemLink({ kind: 'completion_window', lease_id: 'l1' })).toBe('/leases/l1/inventories')
    expect(itemLink({ kind: 'deposit_deadline', lease_id: 'l1' })).toBe('/leases/l1/deposit')
    expect(itemLink({ kind: 'maintenance_due', asset_id: 'a1' })).toBe('/maintenance/contracts')
    expect(itemLink({ kind: 'insurance_certificate', lease_id: 'l1' })).toBe('/leases/l1/guarantees')
    expect(itemLink({ kind: 'irl_revision', lease_id: 'l1' })).toBe('/leases/l1/overview')
  })
  it('counts the overdue items', () => {
    expect(overdue([{ status: 'overdue' }, { status: 'upcoming' }, { status: 'overdue' }])).toBe(2)
  })
})
