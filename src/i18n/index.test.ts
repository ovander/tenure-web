import { afterEach, describe, expect, it } from 'vitest'
import { dictionariesForTest, language, setLanguage, t } from './index'

afterEach(() => setLanguage('fr'))

describe('i18n', () => {
  it('has the same keys in French and English', () => {
    expect(Object.keys(dictionariesForTest.en).sort()).toEqual(Object.keys(dictionariesForTest.fr).sort())
  })
  it('defaults to French and replaces placeholders', () => {
    expect(language.value).toBe('fr')
    expect(t('home.welcome', { name: 'Anne' })).toBe('Bonjour Anne')
  })
  it('switches to English, and anything else is French', () => {
    setLanguage('en')
    expect(t('nav.home')).toBe('Home')
    expect(document.documentElement.lang).toBe('en')
    setLanguage('de')
    expect(t('nav.home')).toBe('Accueil')
  })
})
