// The session (RENT-FE-001 §7, app/auth): who is signed in, read from
// GET /bff/session, the CSRF token kept in memory only, the caller's scopes
// from GET /me and the active one. The app holds no OIDC client and no token.
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, login, setCsrf, setScope } from '@/api/client'
import type { Me, Scope } from '@/api/types'
import { setLanguage } from '@/i18n'

export interface BffSession {
  authenticated: boolean
  user?: { sub: string; email?: string; name?: string; roles: string[] }
  csrf?: string
}

const scopeKey = 'tenure.scope'

function remembered(): string | undefined {
  try {
    return sessionStorage.getItem(scopeKey) ?? undefined
  } catch {
    return undefined
  }
}

export const useSession = defineStore('session', () => {
  const session = ref<BffSession | null>(null)
  const me = ref<Me | null>(null)
  const activeOwnerId = ref<string | undefined>()
  const stepUpPending = ref(false)

  const scopes = computed<Scope[]>(() => me.value?.scopes ?? [])
  const active = computed<Scope | undefined>(
    () => scopes.value.find((s) => s.owner_id === activeOwnerId.value) ?? me.value?.active_scope ?? scopes.value[0],
  )
  const role = computed(() => active.value?.role)
  const canWrite = computed(() => role.value === 'owner')
  // isSCI is true in an SCI's scope (tenure-api Q-133).
  const isSCI = computed(() => active.value?.kind === 'sci')
  const displayName = computed(
    () => me.value?.owner?.legal_name || session.value?.user?.name || session.value?.user?.email || '',
  )

  // load reads the BFF session, then /me; without a session it sends the
  // browser to Socrate and resolves false.
  async function load(): Promise<boolean> {
    const s = await api.get<BffSession>('/bff/session')
    session.value = s.data
    if (!s.data.authenticated) {
      setCsrf(undefined)
      login()
      return false
    }
    setCsrf(s.data.csrf)
    await refreshMe()
    return true
  }

  async function refreshMe(): Promise<void> {
    const m = await api.get<Me>('/me', { scope: null })
    me.value = m.data
    setLanguage(m.data.language)
    const want = remembered()
    selectScope(m.data.scopes?.some((s) => s.owner_id === want) ? want : m.data.active_scope?.owner_id)
  }

  function selectScope(ownerId: string | undefined): void {
    activeOwnerId.value = ownerId
    setScope(ownerId)
    try {
      if (ownerId) sessionStorage.setItem(scopeKey, ownerId)
    } catch {
      // private mode: the scope lasts for the page
    }
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/bff/logout')
    } finally {
      setCsrf(undefined)
      session.value = { authenticated: false }
      me.value = null
      location.assign('/')
    }
  }

  return { session, me, scopes, active, role, canWrite, isSCI, displayName, stepUpPending, load, refreshMe, selectScope, logout }
})
