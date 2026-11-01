<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import Button from 'primevue/button'
import Select from 'primevue/select'
import { nav, settings } from './nav'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'

const s = useSession()
const route = useRoute()
const collapsed = ref(false)

// Settings stays visible to everyone: it holds the caller's own profile.
const items = [...nav, settings]
const scopeOptions = computed(() =>
  s.scopes.map((sc) => ({ value: sc.owner_id, label: `${sc.legal_name} (${t(`scope.${sc.role}` as Key)})` })),
)
const scope = computed({
  get: () => s.active?.owner_id,
  set: (v: string | undefined) => {
    s.selectScope(v)
    location.assign('/') // every view reloads under the new scope
  },
})

function isActive(to: string): boolean {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}
</script>

<template>
  <div class="flex h-full">
    <nav
      class="flex shrink-0 flex-col border-r border-slate-200 bg-white"
      :class="collapsed ? 'w-16' : 'w-56'"
      :aria-label="t('app.name')"
    >
      <div class="flex h-14 items-center gap-2 px-4 font-semibold text-emerald-700">
        <img src="/icon.svg" alt="" class="h-7 w-7" />
        <span v-if="!collapsed">{{ t('app.name') }}</span>
      </div>
      <ul class="flex-1 space-y-1 px-2">
        <li v-for="item in items" :key="item.to">
          <RouterLink
            :to="item.to"
            class="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-slate-100"
            :class="isActive(item.to) ? 'bg-emerald-50 font-medium text-emerald-800' : 'text-slate-700'"
            :aria-current="isActive(item.to) ? 'page' : undefined"
            :title="collapsed ? t(item.key) : undefined"
          >
            <i :class="item.icon" aria-hidden="true" />
            <span v-if="!collapsed">{{ t(item.key) }}</span>
          </RouterLink>
        </li>
      </ul>
      <Button
        text
        class="m-2"
        :icon="collapsed ? 'pi pi-angle-double-right' : 'pi pi-angle-double-left'"
        :aria-label="collapsed ? t('nav.expand') : t('nav.collapse')"
        @click="collapsed = !collapsed"
      />
    </nav>
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-14 items-center justify-end gap-4 border-b border-slate-200 bg-white px-6">
        <label v-if="s.scopes.length > 1" class="flex items-center gap-2 text-sm text-slate-600">
          {{ t('top.scope') }}
          <Select v-model="scope" :options="scopeOptions" option-label="label" option-value="value" class="w-72" data-test="scope" />
        </label>
        <span class="text-sm text-slate-700" data-test="user">{{ s.displayName }}</span>
        <Button :label="t('top.logout')" icon="pi pi-sign-out" severity="secondary" text size="small" data-test="logout" @click="s.logout()" />
      </header>
      <main class="min-h-0 flex-1 overflow-auto p-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>
