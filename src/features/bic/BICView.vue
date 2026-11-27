<script setup lang="ts">
// The BIC result of furnished letting for a year (RENT-SPEC-019; tenure-api
// Q-132; Q-W41): receipts, charges, the depreciation room, what is deducted
// and carried, the deficits, the taxable result, micro-BIC beside, the
// chain of years, and the declaration of the year behind the step-up.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { ApiError } from '@/api/client'
import { withStepUp } from '@/app/stepUp'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'
import { useLatest } from '@/lib/async'
import { currentPeriod, money } from '@/i18n/format'
import { declarations as getDeclarations, issue, result as getResult, type Declaration, type Regime, type Result } from './bic'

const route = useRoute()
const router = useRouter()
const s = useSession()
const year = computed(() => Number(route.params.year))
// A year is declared once it is over (tenure-api #258, 409 bic/year-open).
const open = computed(() => year.value >= Number(currentPeriod().slice(0, 4)))
const data = ref<Result | null>(null)
const done = ref<Declaration[]>([])
const failure = ref('')
const confirm = ref(false)
const regime = ref<Regime>('reel')
const busy = ref(false)
const issueError = ref('')

// Only the answer for the year shown is kept (a quick year change).
const latest = useLatest()
async function load(): Promise<void> {
  const token = latest.next()
  data.value = null
  failure.value = ''
  try {
    const [res, decl] = await Promise.all([getResult(year.value), getDeclarations()])
    if (!latest.isLatest(token)) return
    data.value = res
    done.value = decl
  } catch (e) {
    if (!latest.isLatest(token)) return
    failure.value = e instanceof ApiError ? (e.problem.title ?? t('error.title')) : t('error.network')
  }
}
watch(year, load, { immediate: true })

const r = computed(() => data.value?.result)
const declared = computed(() => done.value.find((d) => d.year === year.value))
function ask(x: Regime): void {
  regime.value = x
  issueError.value = ''
  confirm.value = true
}
async function doIssue(): Promise<void> {
  busy.value = true
  try {
    const d = await withStepUp(() => issue(year.value, regime.value))
    if (d) {
      confirm.value = false
      await load()
    }
  } catch (e) {
    issueError.value = e instanceof ApiError ? (e.problem.title ?? t('error.title')) : t('error.network')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="max-w-5xl space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <Button icon="pi pi-chevron-left" text :aria-label="t('bic.previousYear')" data-test="year-prev" @click="router.push(`/bic/${year - 1}`)" />
      <h1 class="text-xl font-semibold" data-test="bic-title">{{ t('bic.resultTitle', { year }) }}</h1>
      <Button icon="pi pi-chevron-right" text :aria-label="t('bic.nextYear')" data-test="year-next" @click="router.push(`/bic/${year + 1}`)" />
      <Tag v-if="declared" :value="t('bic.declaredAs', { regime: t(`bic.regime.${declared.regime}` as Key) })" severity="success" data-test="bic-declared" />
    </div>
    <p class="text-sm text-slate-600">{{ t('bic.resultIntro') }}</p>
    <Message v-if="failure" severity="error" :closable="false" data-test="bic-error">{{ failure }}</Message>
    <Skeleton v-else-if="!data || !r" height="10rem" />
    <template v-else>
      <Message v-if="!(data.assets ?? []).length" severity="secondary" :closable="false" data-test="bic-empty">{{ t('bic.noFurnished') }}</Message>
      <div class="grid gap-4 md:grid-cols-2">
        <article class="rounded-md border border-slate-200 bg-white p-4" data-test="bic-reel">
          <h2 class="mb-2 font-semibold">{{ t('bic.regime.reel') }}</h2>
          <dl class="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
            <dt>{{ t('bic.receipts') }}</dt><dd class="amount" data-test="bic-receipts">{{ money(r.receipts_cents ?? 0) }}</dd>
            <dt>{{ t('bic.charges') }}</dt><dd class="amount">− {{ money(r.charges_cents ?? 0) }}</dd>
            <dt>{{ t('bic.depreciationYear') }}</dt><dd class="amount">{{ money(r.depreciation_cents ?? 0) }}</dd>
            <dt>{{ t('bic.carriedIn') }}</dt><dd class="amount">{{ money(r.carried_in_cents ?? 0) }}</dd>
            <dt>{{ t('bic.room') }}</dt><dd class="amount">{{ money(r.room_cents ?? 0) }}</dd>
            <dt class="font-medium">{{ t('bic.deducted') }}</dt><dd class="amount font-medium" data-test="bic-deducted">− {{ money(r.deducted_cents ?? 0) }}</dd>
            <dt>{{ t('bic.carriedOut') }}</dt><dd class="amount" data-test="bic-carried">{{ money(r.carried_out_cents ?? 0) }}</dd>
            <dt class="font-medium">{{ t('bic.result') }}</dt><dd class="amount font-medium" data-test="bic-result">{{ money(r.result_cents ?? 0) }}</dd>
            <template v-if="r.deficit_used_cents"><dt>{{ t('bic.deficitUsed') }}</dt><dd class="amount">− {{ money(r.deficit_used_cents) }}</dd></template>
            <dt class="font-semibold">{{ t('bic.taxable') }}</dt><dd class="amount font-semibold" data-test="bic-taxable">{{ money(r.taxable_cents ?? 0) }}</dd>
          </dl>
          <p v-for="d in r.deficits ?? []" :key="d.year ?? 0" class="mt-1 text-xs text-slate-500" data-test="bic-deficit">{{ t('bic.deficitLine', { year: d.year ?? '', amount: money(d.remaining_cents ?? 0) }) }}</p>
        </article>
        <article class="rounded-md border border-slate-200 bg-white p-4" data-test="bic-micro">
          <h2 class="mb-2 font-semibold">{{ t('bic.regime.micro') }}</h2>
          <p v-if="!r.micro?.eligible" class="text-sm text-orange-700" data-test="bic-micro-closed">{{ t('bic.microClosed') }}</p>
          <dl v-else class="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
            <dt>{{ t('bic.receipts') }}</dt><dd class="amount">{{ money(r.receipts_cents ?? 0) }}</dd>
            <dt>{{ t('bic.abatement') }}</dt><dd class="amount">− {{ money(r.micro?.abatement_cents ?? 0) }}</dd>
            <dt class="font-semibold">{{ t('bic.taxable') }}</dt><dd class="amount font-semibold" data-test="bic-micro-taxable">{{ money(r.micro?.taxable_cents ?? 0) }}</dd>
          </dl>
          <p class="mt-3 text-sm" data-test="bic-lower">
            {{ (r.taxable_cents ?? 0) === (r.micro?.taxable_cents ?? 0) ? t('bic.equal') : t('bic.lower', { regime: t(`bic.regime.${r.lower ?? 'reel'}` as Key) }) }}
          </p>
        </article>
      </div>

      <Message v-if="s.canWrite && !declared && open" severity="info" :closable="false" data-test="bic-year-open">{{ t('bic.yearOpen') }}</Message>
      <div v-else-if="s.canWrite && !declared" class="flex flex-wrap gap-2" data-test="bic-issue">
        <Button :label="t('bic.issueReel')" icon="pi pi-send" data-test="issue-reel" @click="ask('reel')" />
        <Button :label="t('bic.issueMicro')" icon="pi pi-send" severity="secondary" :disabled="!r.micro?.eligible" data-test="issue-micro" @click="ask('micro')" />
      </div>

      <div v-if="(data.chain ?? []).length > 1" class="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table class="w-full text-sm" data-test="bic-chain">
          <thead class="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th class="px-3 py-2">{{ t('bic.year') }}</th><th>{{ t('bic.regimeLabel') }}</th><th class="amount">{{ t('bic.receipts') }}</th><th class="amount">{{ t('bic.deducted') }}</th><th class="amount">{{ t('bic.carriedOut') }}</th><th class="amount px-3">{{ t('bic.taxable') }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="y in data.chain" :key="y.year" class="border-t border-slate-100" data-test="bic-chain-row">
              <td class="px-3 py-1">{{ y.year }} <Tag v-if="y.declared" :value="t('bic.declared')" severity="success" /></td>
              <td>{{ t(`bic.regime.${y.regime ?? 'reel'}` as Key) }}</td>
              <td class="amount">{{ money(y.receipts_cents ?? 0) }}</td><td class="amount">{{ money(y.deducted_cents ?? 0) }}</td>
              <td class="amount">{{ money(y.carried_out_cents ?? 0) }}</td><td class="amount px-3">{{ money(y.taxable_cents ?? 0) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <ConfirmDialog v-model:visible="confirm" :title="t('bic.issueTitle', { year })" :body="t('bic.issueBody', { regime: t(`bic.regime.${regime}` as Key) })" :confirm="t('bic.issueConfirm')" :busy="busy" @confirm="doIssue">
      <Message v-if="issueError" severity="error" :closable="false" data-test="issue-error">{{ issueError }}</Message>
    </ConfirmDialog>
  </section>
</template>
