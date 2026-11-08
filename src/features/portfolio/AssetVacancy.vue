<script setup lang="ts">
// « Vacance » on the asset overview (Q-W34): the periods without a lease
// and the vacant days of each year, computed by the API.
import { computed, ref, watch } from 'vue'
import { t } from '@/i18n'
import { date } from '@/i18n/format'
import { getVacancies, yearsOf, type VacancyView } from '@/features/lease/terms'

const props = defineProps<{ assetId: string }>()
const v = ref<VacancyView | null>(null)
watch(() => props.assetId, async (id) => {
  v.value = id ? await getVacancies(id).catch(() => null) : null
}, { immediate: true })
const years = computed(() => (v.value ? yearsOf(v.value) : []))
</script>

<template>
  <section v-if="v && v.since" class="h-fit rounded-md border border-slate-200 bg-white p-5" data-test="vacancy">
    <h2 class="mb-3 font-medium">{{ t('vacancy.title') }}</h2>
    <p v-if="!(v.periods ?? []).length" class="text-sm text-slate-500" data-test="vacancy-none">{{ t('vacancy.none', { since: date(v.since) }) }}</p>
    <template v-else>
      <ul class="space-y-1 text-sm">
        <li v-for="p in v.periods" :key="p.from_on" data-test="vacancy-period">
          <template v-if="p.open">{{ t('vacancy.open', { from: date(p.from_on), days: p.days ?? 0 }) }}</template>
          <template v-else>{{ t('vacancy.range', { from: date(p.from_on), to: date(p.to_on), days: p.days ?? 0 }) }}</template>
        </li>
      </ul>
      <table class="mt-3 w-full text-sm" data-test="vacancy-years">
        <tbody>
          <tr v-for="y in years" :key="y.year"><td class="py-0.5">{{ y.year }}</td><td class="amount py-0.5">{{ t('vacancy.days', { days: y.days }) }}</td></tr>
        </tbody>
      </table>
    </template>
  </section>
</template>
