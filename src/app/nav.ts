import type { Key } from '@/i18n'

export interface NavItem {
  key: Key
  to: string
  icon: string
  // only shows the item in a person's scope, or only in an SCI's (Q-W42).
  scope?: 'person' | 'sci'
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
  { key: 'nav.tax', to: '/tax', icon: 'pi pi-percentage', scope: 'person' },
  { key: 'nav.bic', to: '/bic', icon: 'pi pi-briefcase', scope: 'person' },
  { key: 'nav.shares', to: '/shares', icon: 'pi pi-sitemap', scope: 'person' },
  { key: 'nav.sci', to: '/sci', icon: 'pi pi-users', scope: 'sci' },
  { key: 'nav.sci2072', to: '/sci/2072', icon: 'pi pi-file', scope: 'sci' },
  { key: 'nav.ledger', to: '/ledger', icon: 'pi pi-book' },
  { key: 'nav.documents', to: '/documents', icon: 'pi pi-folder-open' },
]
export const settings: NavItem = { key: 'nav.settings', to: '/settings', icon: 'pi pi-cog' }

// navFor keeps the items of the scope's kind.
export function navFor(sci: boolean): NavItem[] {
  return nav.filter((i) => !i.scope || i.scope === (sci ? 'sci' : 'person'))
}
