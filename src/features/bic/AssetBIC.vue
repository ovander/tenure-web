<script setup lang="ts">
// The « Meublé » tab of an asset (RENT-SPEC-019; tenure-api Q-132; Q-W41):
// its component grid for the réel (the default proposal until recorded),
// its furniture and works, and the depreciation of a year.
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'
import { useLatest } from '@/lib/async'
import { currentPeriod, date, money } from '@/i18n/format'
import GridDialog from './GridDialog.vue'
import ItemDialog from './ItemDialog.vue'
import { depreciation, duration, grid as getGrid, items as getItems, percent, type Depreciation, type Grid, type Item } from './bic'

const props = defineProps<{ assetId: string }>()
const s = useSession()
const grid = ref<Grid | null>(null)
const list = ref<Item[] | null>(null)
const dep = ref<Depreciation | null>(null)
const year = ref(Number(currentPeriod().slice(0, 4)))
const gridDialog = ref(false)
const itemDialog = ref(false)
const editing = ref<Item | null>(null)

// Only the latest answers are kept: an older asset's grid, or the plan of a
// year the owner already left, never replaces the one shown.
const latest = useLatest()
const latestDep = useLatest()
async function load(): Promise<void> {
  const token = latest.next()
  const [g, l] = await Promise.all([getGrid(props.assetId), getItems(props.assetId)])
  if (!latest.isLatest(token)) return
  grid.value = g
  list.value = l
  await loadDep()
}
async function loadDep(): Promise<void> {
  const token = latestDep.next()
  const d = await depreciation(props.assetId, year.value)
  if (latestDep.isLatest(token)) dep.value = d
}
onMounted(load)
watch(() => props.assetId, load)
watch(year, loadDep)

const label = (c?: string) => {
  const k = `bic.component.${c}` as Key
  const v = t(k)
  return v === k ? (c ?? '') : v
}
const span = (m?: number) => {
  const d = duration(m)
  if (!d) return t('bic.notDepreciated')
  return 'years' in d ? t('bic.years', { n: d.years }) : t('bic.monthsN', { n: d.months })
}
const itemLabel = (ref?: string) => list.value?.find((i) => i.id === ref)?.label ?? label(ref)
const editItem = (i: Item | null) => {
  editing.value = i
  itemDialog.value = true
}
const canEditGrid = computed(() => s.canWrite && !grid.value?.frozen)
</script>

<template>
  <section class="space-y-6" data-test="asset-bic">
    <p class="text-sm text-slate-600">{{ t('bic.intro') }} <RouterLink :to="`/bic/${year}`" class="text-emerald-700 underline" data-test="bic-result-link">{{ t('bic.seeResult') }}</RouterLink></p>
    <Skeleton v-if="!grid" height="8rem" />
    <article v-else class="rounded-md border border-slate-200 bg-white p-4" data-test="grid">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="font-semibold">
            {{ t('bic.grid') }}
            <Tag v-if="grid.proposed" :value="t('bic.proposed')" severity="warn" class="ml-2" data-test="grid-proposed" />
            <Tag v-else :value="t('bic.versionN', { n: grid.version ?? 0 })" severity="secondary" class="ml-2" data-test="grid-version" />
            <Tag v-if="grid.frozen" :value="t('bic.frozen')" severity="info" class="ml-1" data-test="grid-frozen" />
          </h3>
          <p class="text-sm text-slate-600" data-test="grid-summary">
            {{ t('bic.gridSummary', { basis: money(grid.basis_cents ?? 0), on: grid.in_service_on ? date(grid.in_service_on) : '—' }) }}
          </p>
          <p v-if="grid.reason" class="text-xs text-slate-500">{{ grid.reason }}</p>
        </div>
        <Button v-if="canEditGrid" :label="grid.proposed ? t('bic.gridRecord') : t('bic.gridEdit')" icon="pi pi-pencil" size="small" severity="secondary" data-test="grid-edit" @click="gridDialog = true" />
      </div>
      <Message v-if="grid.proposed" severity="info" :closable="false" class="mt-3" data-test="grid-proposal-hint">{{ t('bic.proposalHint') }}</Message>
      <table class="mt-3 w-full text-sm [&_td]:px-2 [&_th]:px-2">
        <thead class="text-left text-xs text-slate-500"><tr><th class="py-1">{{ t('bic.component') }}</th><th>{{ t('bic.share') }}</th><th class="amount">{{ t('bic.base') }}</th><th>{{ t('bic.duration') }}</th></tr></thead>
        <tbody>
          <tr v-for="(l, i) in grid.lines ?? []" :key="l.component" class="border-t border-slate-100" data-test="grid-row">
            <td class="py-1">{{ label(l.component) }}</td><td>{{ percent(l.share_bp) }}</td><td class="amount">{{ money(grid.bases?.[i] ?? 0) }}</td><td>{{ span(l.months) }}</td>
          </tr>
        </tbody>
      </table>
    </article>

    <article class="rounded-md border border-slate-200 bg-white p-4" data-test="items">
      <div class="flex items-center justify-between gap-3">
        <h3 class="font-semibold">{{ t('bic.items') }}</h3>
        <Button v-if="s.canWrite" :label="t('bic.itemAdd')" icon="pi pi-plus" size="small" data-test="item-add" @click="editItem(null)" />
      </div>
      <Message v-if="list && !list.length" severity="secondary" :closable="false" class="mt-3" data-test="items-empty">{{ t('bic.itemsEmpty') }}</Message>
      <table v-else-if="list" class="mt-3 w-full text-sm [&_td]:px-2 [&_th]:px-2">
        <thead class="text-left text-xs text-slate-500"><tr><th class="py-1">{{ t('bic.label') }}</th><th class="amount">{{ t('bic.cost') }}</th><th>{{ t('bic.inServiceItem') }}</th><th>{{ t('bic.duration') }}</th><th>{{ t('bic.treatmentLabel') }}</th><th /></tr></thead>
        <tbody>
          <tr v-for="i in list" :key="i.id" class="border-t border-slate-100" data-test="item">
            <td class="py-1">{{ i.label }} <span class="text-xs text-slate-500">{{ t(`bic.kind.${i.kind}` as Key) }}<template v-if="i.works"> · {{ t(`bic.works.${i.works}` as Key) }}</template></span></td>
            <td class="amount">{{ money(i.cost_cents ?? 0) }}</td>
            <td>{{ date(i.in_service_on) }}<span v-if="i.disposed_on" class="text-xs text-slate-500"> → {{ date(i.disposed_on) }}</span></td>
            <td>{{ span(i.months) }}</td>
            <td data-test="item-treatment-cell">
              <Tag :value="t(`bic.treatment.${i.treatment}` as Key)" :severity="i.treatment === 'asset' ? 'info' : 'secondary'" />
              <span v-if="i.overridden" class="ml-1 text-xs text-orange-700" :title="i.override_reason" data-test="item-overridden">{{ t('bic.forced') }}</span>
            </td>
            <td class="text-right"><Button v-if="s.canWrite" icon="pi pi-pencil" size="small" text :aria-label="t('common.edit')" data-test="item-edit" @click="editItem(i)" /></td>
          </tr>
        </tbody>
      </table>
    </article>

    <article class="rounded-md border border-slate-200 bg-white p-4" data-test="depreciation">
      <div class="flex items-center justify-between gap-3">
        <h3 class="font-semibold">{{ t('bic.depreciation') }}</h3>
        <InputNumber v-model="year" :use-grouping="false" :min="1970" :max="9999" input-id="dep_year" class="w-32" input-class="w-full min-w-0" show-buttons data-test="dep-year" />
      </div>
      <table v-if="dep" class="mt-3 w-full text-sm [&_td]:px-2 [&_th]:px-2">
        <thead class="text-left text-xs text-slate-500"><tr><th class="py-1">{{ t('bic.line') }}</th><th class="amount">{{ t('bic.base') }}</th><th class="amount">{{ t('bic.prior') }}</th><th class="amount">{{ t('bic.yearAmount') }}</th><th class="amount">{{ t('bic.net') }}</th></tr></thead>
        <tbody>
          <tr v-for="r in dep.rows ?? []" :key="r.ref" class="border-t border-slate-100" data-test="dep-row">
            <td class="py-1">{{ itemLabel(r.ref) }}</td><td class="amount">{{ money(r.base_cents ?? 0) }}</td><td class="amount">{{ money(r.prior_cents ?? 0) }}</td>
            <td class="amount">{{ money(r.year_cents ?? 0) }}</td><td class="amount">{{ money(r.net_cents ?? 0) }}</td>
          </tr>
          <tr class="border-t border-slate-200 font-medium"><td class="py-1">{{ t('bic.total') }}</td><td /><td /><td class="amount" data-test="dep-total">{{ money(dep.total_cents ?? 0) }}</td><td /></tr>
        </tbody>
      </table>
      <p v-if="dep?.expensed_cents" class="mt-2 text-xs text-slate-600" data-test="dep-expensed">{{ t('bic.expensedLine', { amount: money(dep.expensed_cents) }) }}</p>
    </article>

    <GridDialog v-model:visible="gridDialog" :asset-id="assetId" :grid="grid" @saved="load" />
    <ItemDialog v-model:visible="itemDialog" :asset-id="assetId" :item="editing" @saved="load" />
  </section>
</template>
