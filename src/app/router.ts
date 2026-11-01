// Routes of RENT-FE-001 §2. Screens not built yet show « Bientôt disponible »;
// every route needs a session (a missing one goes to Socrate through the BFF).
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useSession } from '@/stores/session'
import { currentPeriod } from '@/i18n/format'
import type { Key } from '@/i18n'

declare module 'vue-router' {
  interface RouteMeta {
    title?: Key
    ownerOnly?: boolean
  }
}

const soon = () => import('@/features/common/ComingSoon.vue')

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('@/features/home/HomeView.vue'), meta: { title: 'nav.home' } },
  { path: '/assets', name: 'assets', component: soon, meta: { title: 'nav.assets' } },
  { path: '/assets/:id/:tab(overview|leases|charges|documents|activity)?', name: 'asset', component: soon, meta: { title: 'nav.assets' } },
  { path: '/leases/:id/:tab(overview|contract|guarantees|billing|inventories)?', name: 'lease', component: soon, meta: { title: 'nav.assets' } },
  { path: '/billing', redirect: () => `/billing/${currentPeriod()}` },
  { path: '/billing/:period(\\d{4}-\\d{2})', name: 'billing', component: soon, meta: { title: 'nav.billing' } },
  { path: '/charges', name: 'charges', component: soon, meta: { title: 'nav.charges' } },
  { path: '/reconciliations/:id', name: 'reconciliation', component: soon, meta: { title: 'nav.charges' } },
  { path: '/tax', redirect: () => `/tax/${Number(currentPeriod().slice(0, 4)) - 1}` },
  { path: '/tax/:year(\\d{4})', name: 'tax', component: soon, meta: { title: 'nav.tax' } },
  { path: '/documents', name: 'documents', component: soon, meta: { title: 'nav.documents' } },
  {
    path: '/settings',
    component: () => import('@/features/settings/SettingsView.vue'),
    meta: { title: 'nav.settings' },
    children: [
      { path: '', redirect: '/settings/profile' },
      { path: 'profile', name: 'profile', component: () => import('@/features/settings/ProfileView.vue'), meta: { title: 'settings.profile' } },
      { path: 'templates', name: 'templates', component: soon, meta: { title: 'settings.templates', ownerOnly: true } },
      { path: 'params', name: 'params', component: soon, meta: { title: 'settings.params' } },
      { path: 'grants', name: 'grants', component: soon, meta: { title: 'settings.grants', ownerOnly: true } },
    ],
  },
  { path: '/:rest(.*)*', name: 'not-found', component: () => import('@/features/common/NotFound.vue') },
]

export const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach(async (to) => {
  const s = useSession()
  if (!s.session) {
    if (!(await s.load())) return false // on the way to Socrate
  }
  if (to.meta.ownerOnly && !s.canWrite) return { name: 'home' }
  return true
})
