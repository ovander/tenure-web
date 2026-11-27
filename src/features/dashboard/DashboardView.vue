<script setup lang="ts">
// The dashboard of a year (RENT-SPEC-016; tenure-api Q-129; Q-W39): the
// portfolio's tiles, the year to date against the previous year, the tax
// estimate, one row per asset and the months. Every figure comes from the
// owner's journal, the tax summary's split. The CSV export is a step_up
// action.
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import HelpTip from '@/components/HelpTip.vue'
import { ApiError } from '@/api/client'
import { withStepUp } from '@/app/stepUp'
import { t, type Key } from '@/i18n'
import { useLatest } from '@/lib/async'
import { basisPoints, date, money } from '@/i18n/format'
import { barWidths, bucketKey, change, dashboard, downloadCSV, occupancyBP, type Dashboard } from './dashboard'

const route = useRoute()
const router = useRouter()
const year = computed(() => Number(route.params.year))
const data = ref<Dashboard | null>(null)
const failure = ref('')
const exporting = ref(false)
const exportError = ref('')

// Only the answer for the year shown is kept (a quick year change).
const latest = useLatest()
async function load(): Promise<void> {
  const token = latest.next()
  data.value = null
  failure.value = ''
  try {
    const res = await dashboard(year.value)
    if (latest.isLatest(token)) data.value = res
  } catch (e) {
    if (!latest.isLatest(token)) return
    failure.value = e instanceof ApiError ? (e.problem.title ?? t('error.title')) : t('error.network')
  }
}
watch(year, load, { immediate: true })

const p = computed(() => data.value?.portfolio)
const bars = computed(() => barWidths(data.value?.months ?? []))
const ytd = computed(() => data.value?.year_to_date)
const prev = computed(() => data.value?.previous_year)
const netChange = computed(() => change(ytd.value?.net_cents ?? 0, prev.value?.net_cents ?? 0))
const incomeChange = computed(() => change(ytd.value?.income_cents ?? 0, prev.value?.income_cents ?? 0))

function go(delta: number): void {
  void router.push(`/dashboard/${year.value + delta}`)
}
function pct(bp: number | null | undefined): string {
  return bp == null ? '—' : basisPoints(bp)
}
function signedPct(bp: number | null): string {
  if (bp == null) return '—'
  return `${bp > 0 ? '+' : ''}${basisPoints(bp)}`
}

async function exportCSV(): Promise<void> {
  exporting.value = true
  exportError.value = ''
  try {
    await withStepUp(() => downloadCSV(year.value))
  } catch (e) {
    exportError.value = e instanceof ApiError ? (e.problem.title ?? t('error.title')) : t('error.network')
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <section class="max-w-6xl space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <Button icon="pi pi-chevron-left" text :aria-label="t('dashboard.previous')" data-test="year-prev" @click="go(-1)" />
        <h1 class="text-xl font-semibold" data-test="dashboard-title">{{ t('dashboard.title', { year }) }}</h1>
        <Button icon="pi pi-chevron-right" text :aria-label="t('dashboard.next')" data-test="year-next" @click="go(1)" />
        <Tag v-if="data?.partial" severity="info" :value="t('dashboard.asOf', { day: date(data.as_of) })" data-test="as-of" />
        <HelpTip id="dashboard_intro" :text="t('help.dashboard.source')" />
      </div>
      <Button :label="t('dashboard.export')" icon="pi pi-file" severity="secondary" :loading="exporting" data-test="export-csv" @click="exportCSV" />
    </div>
    <Message v-if="exportError" severity="error" :closable="false" data-test="export-error">{{ exportError }}</Message>
    <Message v-if="failure" severity="error" :closable="false" data-test="dashboard-error">{{ failure }}</Message>
    <Skeleton v-else-if="!data" height="12rem" />
    <template v-else>
      <div class="grid gap-3 sm:grid-cols-4" data-test="tiles">
        <div class="rounded-md border border-slate-200 bg-white p-3">
          <p class="text-xs text-slate-500">{{ t('dashboard.rent') }}</p>
          <p class="amount text-lg font-semibold" data-test="tile-rent">{{ money(p?.rent_cents ?? 0) }}</p>
        </div>
        <div class="rounded-md border border-slate-200 bg-white p-3">
          <p class="text-xs text-slate-500">{{ t('dashboard.expenses') }}</p>
          <p class="amount text-lg font-semibold" data-test="tile-expenses">{{ money(p?.expenses_cents ?? 0) }}</p>
          <p class="text-xs text-slate-500">{{ t('dashboard.interestPart', { amount: money(p?.interest_cents ?? 0) }) }}</p>
        </div>
        <div class="rounded-md border border-slate-200 bg-white p-3">
          <p class="text-xs text-slate-500">{{ t('dashboard.net') }}</p>
          <p class="amount text-lg font-semibold" :class="(p?.net_cents ?? 0) < 0 ? 'text-red-700' : ''" data-test="tile-net">{{ money(p?.net_cents ?? 0) }}</p>
        </div>
        <div class="rounded-md border border-slate-200 bg-white p-3">
          <p class="text-xs text-slate-500">{{ t('dashboard.arrears') }}</p>
          <p class="amount text-lg font-semibold" :class="(p?.arrears_cents ?? 0) > 0 ? 'text-orange-700' : ''" data-test="tile-arrears">{{ money(p?.arrears_cents ?? 0) }}</p>
        </div>
      </div>

      <div class="grid gap-3 lg:grid-cols-2">
        <div class="rounded-md border border-slate-200 bg-white p-3 text-sm" data-test="compare">
          <h2 class="mb-2 font-semibold">{{ t('dashboard.compareTitle') }}</h2>
          <table class="w-full">
            <thead class="text-left text-xs text-slate-500">
              <tr><th /><th class="amount">{{ date(ytd?.from) }} – {{ date(ytd?.to) }}</th><th class="amount">{{ date(prev?.from) }} – {{ date(prev?.to) }}</th><th class="amount">{{ t('dashboard.change') }}</th></tr>
            </thead>
            <tbody>
              <tr><td>{{ t('dashboard.income') }}</td><td class="amount">{{ money(ytd?.income_cents ?? 0) }}</td><td class="amount">{{ money(prev?.income_cents ?? 0) }}</td><td class="amount" data-test="income-change">{{ signedPct(incomeChange) }}</td></tr>
              <tr><td>{{ t('dashboard.expenses') }}</td><td class="amount">{{ money(ytd?.expenses_cents ?? 0) }}</td><td class="amount">{{ money(prev?.expenses_cents ?? 0) }}</td><td /></tr>
              <tr class="font-medium"><td>{{ t('dashboard.net') }}</td><td class="amount">{{ money(ytd?.net_cents ?? 0) }}</td><td class="amount">{{ money(prev?.net_cents ?? 0) }}</td><td class="amount">{{ signedPct(netChange) }}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="rounded-md border border-slate-200 bg-white p-3 text-sm" data-test="tax">
          <h2 class="mb-2 flex items-center gap-1 font-semibold">{{ t('dashboard.taxTitle') }} <HelpTip id="dashboard_tax" :text="t('help.dashboard.tax')" /></h2>
          <template v-if="data.tax?.available">
            <dl class="grid grid-cols-2 gap-1">
              <dt>{{ t('dashboard.micro') }}</dt>
              <dd class="amount" data-test="tax-micro">{{ data.tax.micro?.eligible ? money(data.tax.micro?.taxable_cents ?? 0) : t('dashboard.notEligible') }}</dd>
              <dt>{{ t('dashboard.reel') }}</dt>
              <dd class="amount" data-test="tax-reel">{{ money(data.tax.reel?.taxable_cents ?? 0) }}</dd>
            </dl>
            <p class="mt-2 text-xs text-slate-600" data-test="tax-lower">{{ t(`dashboard.lower.${data.tax.lower ?? 'reel'}` as Key) }}</p>
            <RouterLink :to="`/tax/${year}`" class="text-xs text-emerald-800 underline">{{ t('dashboard.taxOpen') }}</RouterLink>
            <div v-if="(data.tax.sci_shares ?? []).length || (data.tax.parts_loans ?? []).length || data.tax.sci_pending" class="mt-3 border-t border-slate-100 pt-2" data-test="tax-sci">
              <p class="text-xs font-medium text-slate-600">{{ t('dashboard.sciIncluded') }}</p>
              <p v-for="x in data.tax.sci_shares ?? []" :key="x.declaration_id" class="text-xs" data-test="tax-sci-share">{{ t('dashboard.sciShare', { sci: x.sci_name ?? '', net: money(x.net_cents ?? 0) }) }}</p>
              <p v-for="l in data.tax.parts_loans ?? []" :key="l.loan_id" class="text-xs" data-test="tax-parts-loan">{{ t('dashboard.partsLoan', { sci: l.sci_name ?? '', amount: money((l.interest_cents ?? 0) + (l.insurance_cents ?? 0)) }) }}</p>
              <p v-if="data.tax.sci_pending" class="text-xs text-orange-700" data-test="tax-sci-pending">{{ t('dashboard.sciPending', { n: data.tax.sci_pending }) }}</p>
              <RouterLink :to="`/shares/${year}`" class="text-xs text-emerald-800 underline">{{ t('dashboard.sharesOpen') }}</RouterLink>
            </div>
            <div v-if="data.tax.bic" class="mt-3 border-t border-slate-100 pt-2" data-test="tax-bic">
              <p class="text-xs font-medium text-slate-600">{{ t('dashboard.bicBeside') }}</p>
              <p class="text-xs">{{ t(data.tax.bic.declared ? 'dashboard.bicDeclared' : 'dashboard.bicEstimate', { regime: t(`bic.regime.${data.tax.bic.regime ?? 'reel'}` as Key), taxable: money(data.tax.bic.taxable_cents ?? 0) }) }}</p>
              <RouterLink :to="`/bic/${year}`" class="text-xs text-emerald-800 underline">{{ t('dashboard.bicOpen') }}</RouterLink>
            </div>
          </template>
          <template v-else-if="data.tax?.reason === 'entity/sci'">
            <p class="text-slate-600" data-test="tax-sci-scope">{{ t('dashboard.sciScope') }}</p>
            <RouterLink :to="`/sci/2072/${year}`" class="text-xs text-emerald-800 underline">{{ t('dashboard.sci2072Open') }}</RouterLink>
          </template>
          <p v-else class="text-slate-600" data-test="tax-none">{{ t('dashboard.taxNone', { year }) }}</p>
        </div>
      </div>

      <div class="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table class="w-full text-sm" data-test="assets">
          <thead class="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th class="px-3 py-2">{{ t('dashboard.asset') }}</th>
              <th class="amount">{{ t('dashboard.rent') }}</th>
              <th class="amount">{{ t('dashboard.net') }}</th>
              <th class="amount">{{ t('dashboard.grossYield') }}</th>
              <th class="amount">{{ t('dashboard.netYield') }}</th>
              <th class="amount">{{ t('dashboard.occupancy') }}</th>
              <th class="amount">{{ t('dashboard.provisions') }}</th>
              <th class="amount px-3">{{ t('dashboard.arrears') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in data.assets ?? []" :key="a.asset_id" class="border-t border-slate-100 align-top" data-test="asset-row">
              <td class="px-3 py-2">
                <RouterLink :to="`/assets/${a.asset_id}/overview`" class="font-medium hover:underline">{{ a.label }}</RouterLink>
                <RouterLink :to="`/assets/${a.asset_id}/deadlines`" class="ml-2 text-xs text-slate-500 hover:underline">{{ t('dashboard.deadlines') }}</RouterLink>
              </td>
              <td class="amount py-2">{{ money(a.rent_cents ?? 0) }}</td>
              <td class="amount py-2" :class="(a.net_cents ?? 0) < 0 ? 'text-red-700' : ''">{{ money(a.net_cents ?? 0) }}</td>
              <td class="amount py-2" data-test="gross-yield">{{ pct(a.gross_yield_bp) }}</td>
              <td class="amount py-2">{{ pct(a.net_yield_bp) }}</td>
              <td class="amount py-2" data-test="occupancy">
                {{ pct(occupancyBP(a)) }}
                <div class="text-xs text-slate-500">{{ t('dashboard.vacantDays', { n: a.vacant_days ?? 0 }) }}</div>
              </td>
              <td class="amount py-2">
                {{ money(a.provisions_received_cents ?? 0) }}
                <div class="text-xs text-slate-500">{{ t('dashboard.recoverablePaid', { amount: money(a.recoverable_paid_cents ?? 0) }) }}</div>
              </td>
              <td class="amount px-3 py-2" data-test="asset-arrears">
                {{ money(a.arrears_cents ?? 0) }}
                <div v-if="(a.arrears_cents ?? 0) > 0" class="text-xs text-orange-700">
                  <span v-for="b in (a.arrears ?? []).filter((x) => (x.cents ?? 0) > 0)" :key="bucketKey(b)" class="ml-1" data-test="bucket">{{ t('dashboard.bucket', { days: bucketKey(b), amount: money(b.cents ?? 0) }) }}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!(data.assets ?? []).length" class="p-3 text-sm text-slate-500" data-test="no-assets">{{ t('dashboard.noAssets') }}</p>
      </div>

      <div class="rounded-md border border-slate-200 bg-white p-3 text-sm" data-test="months">
        <h2 class="mb-2 font-semibold">{{ t('dashboard.monthsTitle') }}</h2>
        <p v-if="!(data.months ?? []).length" class="text-slate-500">{{ t('dashboard.noMonths') }}</p>
        <div v-for="(m, i) in data.months ?? []" :key="m.month" class="grid grid-cols-[5rem_1fr_7rem] items-center gap-2 py-0.5" data-test="month">
          <span class="text-xs text-slate-600">{{ m.month }}</span>
          <div class="space-y-0.5">
            <div class="h-2 rounded bg-emerald-500" :style="{ width: `${bars[i]?.in ?? 0}%` }" />
            <div class="h-2 rounded bg-slate-400" :style="{ width: `${bars[i]?.out ?? 0}%` }" />
          </div>
          <span class="amount text-xs" :class="(m.net_cents ?? 0) < 0 ? 'text-red-700' : ''">{{ money(m.net_cents ?? 0) }}</span>
        </div>
        <p class="mt-2 text-xs text-slate-500">{{ t('dashboard.monthsLegend') }}</p>
      </div>
    </template>
  </section>
</template>
