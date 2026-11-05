<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'

const s = useSession()
const route = useRoute()
const tabs = computed(() =>
  (
    [
      { to: '/settings/profile', key: 'settings.profile', show: true },
      { to: '/settings/templates', key: 'settings.templates', show: true },
      { to: '/settings/params', key: 'settings.params', show: true },
      { to: '/settings/grants', key: 'settings.grants', show: s.canWrite },
    ] as { to: string; key: Key; show: boolean }[]
  ).filter((x) => x.show),
)
</script>

<template>
  <section class="max-w-3xl">
    <h1 class="mb-4 text-xl font-semibold">{{ t('settings.title') }}</h1>
    <nav class="mb-6 flex gap-1 border-b border-slate-200">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="-mb-px border-b-2 px-4 py-2 text-sm"
        :class="route.path === tab.to ? 'border-emerald-600 font-medium text-emerald-800' : 'border-transparent text-slate-600'"
      >
        {{ t(tab.key) }}
      </RouterLink>
    </nav>
    <RouterView />
  </section>
</template>
