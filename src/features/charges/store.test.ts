import { describe, expect, it } from 'vitest'
import { defaultMapping, exercise, toChargeInput, totals } from './store'

describe('charges helpers', () => {
  it('proposes the calendar year as the exercise', () => {
    expect(exercise(2025)).toEqual({ start: '2025-01-01', end: '2025-12-31' })
  })

  it('sums amounts and recoverable parts, and counts drafts', () => {
    const rows = [
      { amount_cents: 41230, recoverable_cents: 41230, status: 'confirmed' as const },
      { amount_cents: 105000, recoverable_cents: 0, status: 'draft' as const },
      { amount_cents: 30000, recoverable_cents: 24000, status: 'draft' as const },
    ]
    expect(totals(rows)).toEqual({ amount: 176230, recoverable: 65230, drafts: 2 })
    expect(totals([])).toEqual({ amount: 0, recoverable: 0, drafts: 0 })
  })

  it('builds the PUT body from a charge, without its server fields', () => {
    const body = toChargeInput({ id: 'c', version: 3, source: 'syndic', syndic_recoverable_cents: 1, asset_id: 'a', amount_cents: 10, recoverable_cents: 5, paid_on: '', status: 'draft' })
    expect(body).toMatchObject({ asset_id: 'a', amount_cents: 10, recoverable_cents: 5, status: 'draft' })
    expect(body.paid_on).toBeUndefined()
    expect(body).not.toHaveProperty('id')
    expect(body).not.toHaveProperty('syndic_recoverable_cents')
  })

  it('proposes the usual French syndic export', () => {
    expect(defaultMapping).toMatchObject({ label: 'Libellé', amount: 'Montant', recoverable: 'Récupérable', delimiter: ';', decimal_point: false })
  })
})
