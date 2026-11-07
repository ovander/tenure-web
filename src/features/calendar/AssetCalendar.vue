<script setup lang="ts">
// An asset's obligations over the coming year, the overdue ones first
// (RENT-SPEC-012 per-asset timeline, computed base; Q-W32).
import { onMounted, ref } from 'vue'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { ApiError } from '@/api/client'
import { t } from '@/i18n'
import { parisToday } from '@/i18n/format'
import CalendarList from './CalendarList.vue'
import { getCalendar, type CalendarItem } from './calendar'

const props = defineProps<{ assetId: string }>()
const items = ref<CalendarItem[] | null>(null)
const denied = ref(false)
const failed = ref(false)

// A year ahead: the next IRL revision and insurance anniversary always fall
// within it.
function inAYear(day: string): string {
  const [y, m, d] = day.split('-')
  return `${Number(y) + 1}-${m}-${d === '29' && m === '02' ? '28' : d}`
}

onMounted(async () => {
  const today = parisToday()
  try {
    items.value = (await getCalendar({ asset_id: props.assetId, from: today, to: inAYear(today) })).items ?? []
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) denied.value = true
    else failed.value = true
  }
})
</script>

<template>
  <section class="space-y-3" data-test="asset-calendar">
    <p class="text-sm text-slate-500">{{ t('calendar.assetHint') }}</p>
    <Message v-if="denied" severity="warn" :closable="false" data-test="calendar-denied">{{ t('calendar.denied') }}</Message>
    <Message v-else-if="failed" severity="error" :closable="false">{{ t('error.network') }}</Message>
    <Skeleton v-else-if="!items" height="6rem" />
    <CalendarList v-else-if="items.length" :items="items" />
    <p v-else class="text-sm text-slate-500" data-test="calendar-none">{{ t('calendar.none') }}</p>
  </section>
</template>
