<script setup lang="ts">
// A list of calendar items, soonest first, the overdue ones flagged; each
// links to where it is dealt with (Q-W32).
import { RouterLink } from 'vue-router'
import Tag from 'primevue/tag'
import { t, type Key } from '@/i18n'
import { date } from '@/i18n/format'
import { itemKey, itemLink, type CalendarItem } from './calendar'

defineProps<{ items: CalendarItem[]; subject?: (it: CalendarItem) => string }>()
function text(it: CalendarItem): string {
  const k = itemKey(it)
  const what = k.params.what ? t(`diag.kind.${k.params.what}` as Key) : ''
  return t(k.key, { ...k.params, what })
}
</script>

<template>
  <ul class="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white text-sm" data-test="calendar">
    <li v-for="(it, i) in items" :key="`${it.kind}-${it.lease_id}-${it.asset_id}-${it.ref}-${i}`" class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2" data-test="calendar-item" :data-kind="it.kind">
      <span class="w-24 font-mono">{{ date(it.on) }}</span>
      <Tag v-if="it.status === 'overdue'" :value="t('calendar.overdue')" severity="danger" data-test="calendar-overdue" />
      <RouterLink :to="itemLink(it)" class="text-emerald-800 hover:underline" data-test="calendar-link">{{ text(it) }}</RouterLink>
      <span v-if="subject" class="text-slate-500">{{ subject(it) }}</span>
    </li>
  </ul>
</template>
