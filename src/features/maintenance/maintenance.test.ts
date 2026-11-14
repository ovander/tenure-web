import { describe, expect, it } from 'vitest'
import { actions, dueState, editable, isOpen, statusSeverity, treatmentOutcome } from './maintenance'

describe('maintenance helpers', () => {
  it('offers the actions the API machine allows', () => {
    expect(actions('new')).toEqual(['quote', 'schedule', 'cancel'])
    expect(actions('quoted')).toEqual(['quote', 'schedule', 'cancel'])
    expect(actions('scheduled')).toEqual(['schedule', 'done', 'cancel'])
    expect(actions('done')).toEqual(['invoice'])
    expect(actions('invoiced')).toEqual([])
    expect(actions('cancelled')).toEqual([])
  })
  it('lets the report change until the works are done', () => {
    expect(['new', 'quoted', 'scheduled', 'done', 'invoiced', 'cancelled'].filter((s) => editable(s as never))).toEqual(['new', 'quoted', 'scheduled'])
    expect(isOpen('done')).toBe(true)
    expect(isOpen('invoiced')).toBe(false)
    expect(isOpen('cancelled')).toBe(false)
  })
  it('colours a status', () => {
    expect(statusSeverity('invoiced')).toBe('success')
    expect(statusSeverity('cancelled')).toBe('secondary')
  })
  it('places the next visit against today', () => {
    expect(dueState({ next_due_on: '2026-11-01' }, '2026-11-14')).toBe('overdue')
    expect(dueState({ next_due_on: '2026-11-14' }, '2026-11-14')).toBe('soon')
    expect(dueState({ next_due_on: '2026-12-14' }, '2026-11-14')).toBe('soon')
    expect(dueState({ next_due_on: '2026-12-15' }, '2026-11-14')).toBe('later')
    expect(dueState({}, '2026-11-14')).toBe('none')
  })
  it('says what an invoice becomes, from the parameter', () => {
    // Made-up kinds: the list comes from the API's parameter.
    const kinds = ['apartment']
    expect(treatmentOutcome('repair', 'box', kinds)).toBe('charge')
    expect(treatmentOutcome('improvement', 'apartment', kinds)).toBe('charge')
    expect(treatmentOutcome('improvement', 'house', kinds)).toBe('capitalised')
    expect(treatmentOutcome('improvement', undefined, kinds)).toBe('capitalised')
    expect(treatmentOutcome('construction', 'apartment', kinds)).toBe('capitalised')
  })
})
