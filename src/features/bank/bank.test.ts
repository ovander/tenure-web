import { describe, expect, it } from 'vitest'
import { formatOf, guessDelimiter, guessMapping, header, oneLease } from './bank'

describe('bank', () => {
  it('tells the format from the file name', () => {
    expect(formatOf('Releve-Octobre.OFX')).toBe('ofx')
    expect(formatOf('export.csv')).toBe('csv')
    expect(formatOf('releve.pdf')).toBeNull()
  })
  it('reads the header and guesses a French mapping', () => {
    const text = '﻿Date opération;Libellé;Débit;Crédit\n05/10/2026;VIR;;800,00\n'
    expect(guessDelimiter(text)).toBe(';')
    const cols = header(text, ';')
    expect(cols).toEqual(['Date opération', 'Libellé', 'Débit', 'Crédit'])
    expect(guessMapping(cols, ';')).toEqual({ delimiter: ';', date: 'Date opération', label: 'Libellé', debit: 'Débit', credit: 'Crédit', reference: undefined })
    const signed = guessMapping(header('"Date","Label","Amount","Ref"\n', ','), ',')
    expect(signed).toMatchObject({ date: 'Date', label: 'Label', amount: 'Amount', reference: 'Ref' })
  })
  it('records the whole line on the suggested lease', () => {
    expect(oneLease({ id: 'b1', amount_cents: 21234, version: 1 }, { lease_id: 'l2', method: 'caf' })).toEqual([{ lease_id: 'l2', amount_cents: 21234, method: 'caf' }])
  })
})
