// PrimeVue's own texts (date picker, empty lists) in the user's language.
import type { Language } from '@/i18n'

const fr = {
  firstDayOfWeek: 1,
  dayNames: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  dayNamesShort: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
  dayNamesMin: ['D', 'L', 'M', 'M', 'J', 'V', 'S'],
  monthNames: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  monthNamesShort: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  today: 'Aujourd’hui',
  clear: 'Effacer',
  weekHeader: 'Sem.',
  dateFormat: 'dd/mm/yy',
  emptyMessage: 'Aucun résultat',
  emptyFilterMessage: 'Aucun résultat',
  emptySelectionMessage: 'Aucune sélection',
  chooseDate: 'Choisir une date',
}

const en = {
  ...fr,
  dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  dayNamesMin: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
  monthNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  monthNamesShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  today: 'Today',
  clear: 'Clear',
  weekHeader: 'Wk',
  emptyMessage: 'No results',
  emptyFilterMessage: 'No results',
  emptySelectionMessage: 'No selection',
  chooseDate: 'Choose a date',
}

// Dates stay dd/mm/yyyy in both languages (RENT-FE-001 §1).
export const primevueLocale: Record<Language, typeof fr> = { fr, en }
