import { describe, expect, it } from 'vitest'
import { computedNotice, letterInput, ownerMayGive } from './notice'

describe('notice', () => {
  it('computes the notice of every kind under loi 89-462, not of a box', () => {
    expect(computedNotice('unfurnished')).toBe(true)
    expect(computedNotice('furnished')).toBe(true)
    expect(computedNotice('mobility')).toBe(true)
    expect(computedNotice('box')).toBe(false)
  })
  it('lets the owner give notice on an unfurnished or furnished lease only', () => {
    expect(ownerMayGive('unfurnished')).toBe(true)
    expect(ownerMayGive('furnished')).toBe(true)
    expect(ownerMayGive('mobility')).toBe(false)
    expect(ownerMayGive('box')).toBe(false)
  })
  it('sends only the fields of the ground chosen, trimmed', () => {
    const f = { priceCents: 28500000, conditions: '  Comptant ', name: ' Claire ', relationship: 'descendant', address: ' 3 rue ', grounds: ' Impayés ', protectedTenant: 'no' }
    expect(letterInput('sale', f, true)).toEqual({ reason: 'sale', protected_tenant: 'no', dry_run: true, price_cents: 28500000, conditions: 'Comptant' })
    expect(letterInput('repossession', f, false)).toEqual({ reason: 'repossession', protected_tenant: 'no', dry_run: false,
      beneficiary: { name: 'Claire', relationship: 'descendant', address: '3 rue' } })
    expect(letterInput('legitimate', { ...f, protectedTenant: '' }, false)).toEqual({ reason: 'legitimate', protected_tenant: undefined, dry_run: false, grounds: 'Impayés' })
  })
})
