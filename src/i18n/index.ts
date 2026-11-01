// The app's own dictionary module (RENT-FE-001 §7): French by default,
// English optional, chosen in the profile and persisted by PUT /me. No
// vue-i18n. A missing key renders as the key itself, so it is visible.
import { ref } from 'vue'
import fr from './fr.json'
import en from './en.json'

export type Language = 'fr' | 'en'
export type Key = keyof typeof fr

const dictionaries: Record<Language, Record<string, string>> = { fr, en }

export const language = ref<Language>('fr')

export function setLanguage(l: string | undefined | null): void {
  language.value = l === 'en' ? 'en' : 'fr'
  document.documentElement.lang = language.value
}

// t returns the text of key in the current language, with {name} placeholders
// replaced from params.
export function t(key: Key, params: Record<string, string | number> = {}): string {
  const text = dictionaries[language.value][key] ?? dictionaries.fr[key] ?? key
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m))
}

export const dictionariesForTest = dictionaries
