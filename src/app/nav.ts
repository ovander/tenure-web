import type { Key } from '@/i18n'

export interface NavItem {
  key: Key
  to: string
  icon: string
}

// The left navigation (RENT-FE-001 §2); Settings sits apart at the bottom.
export const nav: NavItem[] = [
  { key: 'nav.home', to: '/', icon: 'pi pi-home' },
  { key: 'nav.dashboard', to: '/dashboard', icon: 'pi pi-chart-bar' },
  { key: 'nav.assets', to: '/assets', icon: 'pi pi-building' },
  { key: 'nav.billing', to: '/billing', icon: 'pi pi-receipt' },
  { key: 'nav.charges', to: '/charges', icon: 'pi pi-calculator' },
  { key: 'nav.bank', to: '/bank', icon: 'pi pi-wallet' },
  { key: 'nav.maintenance', to: '/maintenance', icon: 'pi pi-wrench' },
  { key: 'nav.tax', to: '/tax', icon: 'pi pi-percentage' },
  { key: 'nav.ledger', to: '/ledger', icon: 'pi pi-book' },
  { key: 'nav.documents', to: '/documents', icon: 'pi pi-folder-open' },
]
export const settings: NavItem = { key: 'nav.settings', to: '/settings', icon: 'pi pi-cog' }
