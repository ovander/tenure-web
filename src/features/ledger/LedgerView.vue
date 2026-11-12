<script setup lang="ts">
// The owner's journal of a year (RENT-SPEC-014; tenure-api Q-127, Q-128;
// Q-W38): every movement in double entry on a cash basis, each account's
// movements, and whether the year is closed by its issued tax summary.
// The exports (journal CSV, FEC of a closed year, year-end pack) are
// step_up actions, recorded by the API.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import HelpTip from '@/components/HelpTip.vue'
import { ApiError } from '@/api/client'
import { withStepUp } from '@/app/stepUp'
import { t, type Key } from '@/i18n'
import { date, money } from '@/i18n/format'
import { byClass, download, journal, type ExportKind, type Journal } from './ledger'

const route = useRoute()
const router = useRouter()
const year = computed(() => Number(route.params.year))
const data = ref<Journal | null>(null)
const failure = ref('')
const exporting = ref<ExportKind | null>(null)
const exportError = ref('')

async function load(): Promise<void> {
  data.value = null
  failure.value = ''
  try {
    data.value = await journal(year.value)
  } catch (e) {
    failure.value = e instanceof ApiError ? (e.problem.title ?? t('error.title')) + (e.problem.detail ? ` ${e.problem.detail}` : '') : t('error.network')
  }
}
watch(year, load, { immediate: true })

const groups = computed(() => byClass(data.value?.balances ?? []))
const total = computed(() => (data.value?.balances ?? []).reduce((s, b) => s + (b.balance_cents ?? 0), 0))

function go(delta: number): void {
  void router.push(`/ledger/${year.value + delta}`)
}

async function exportFile(kind: ExportKind): Promise<void> {
  exporting.value = kind
  exportError.value = ''
  try {
    await withStepUp(() => download(kind, year.value))
  } catch (e) {
    exportError.value = e instanceof ApiError ? (e.problem.title ?? t('error.title')) : t('error.network')
  } finally {
    exporting.value = null
  }
}
</script>

<template>
  <section class="max-w-6xl space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <Button icon="pi pi-chevron-left" text :aria-label="t('ledger.previous')" data-test="year-prev" @click="go(-1)" />
        <h1 class="text-xl font-semibold" data-test="ledger-title">{{ t('ledger.title', { year }) }}</h1>
        <Button icon="pi pi-chevron-right" text :aria-label="t('ledger.next')" data-test="year-next" @click="go(1)" />
        <Tag v-if="data" :severity="data.closed ? 'success' : 'warn'" :value="data.closed ? t('ledger.closed') : t('ledger.open')" data-test="ledger-state" />
        <HelpTip id="ledger_state" :text="t('help.ledger.closed')" />
      </div>
      <div class="flex flex-wrap gap-2">
        <Button :label="t('ledger.exportJournal')" icon="pi pi-file" severity="secondary" :loading="exporting === 'journal'" data-test="export-journal" @click="exportFile('journal')" />
        <Button
          :label="t('ledger.exportFEC')" icon="pi pi-file-export" severity="secondary" :disabled="!data?.closed" :loading="exporting === 'fec'"
          :title="data?.closed ? undefined : t('ledger.fecClosedOnly')" data-test="export-fec" @click="exportFile('fec')"
        />
        <Button :label="t('ledger.exportPack')" icon="pi pi-box" :loading="exporting === 'pack'" data-test="export-pack" @click="exportFile('pack')" />
      </div>
    </div>
    <p class="text-sm text-slate-600">{{ t('ledger.intro') }}</p>
    <p v-if="data && !data.closed" class="text-xs text-slate-500" data-test="fec-hint">{{ t('ledger.fecClosedOnly') }}</p>
    <Message v-if="exportError" severity="error" :closable="false" data-test="export-error">{{ exportError }}</Message>
    <Message v-if="failure" severity="error" :closable="false" data-test="ledger-error">{{ failure }}</Message>
    <Skeleton v-else-if="!data" height="10rem" />
    <template v-else>
      <Message v-if="!(data.entries ?? []).length" severity="secondary" :closable="false" data-test="ledger-empty">{{ t('ledger.empty') }}</Message>
      <div class="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div v-if="(data.entries ?? []).length" class="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table class="w-full text-sm" data-test="entries">
            <thead class="bg-slate-50 text-left text-xs text-slate-500">
              <tr><th class="px-3 py-2">{{ t('ledger.date') }}</th><th>{{ t('ledger.account') }}</th><th class="amount">{{ t('ledger.debit') }}</th><th class="amount px-3">{{ t('ledger.credit') }}</th></tr>
            </thead>
            <tbody>
              <template v-for="(e, n) in data.entries ?? []" :key="`${e.kind}${e.source}${n}`">
                <tr class="border-t border-slate-200 bg-slate-50/60" data-test="entry">
                  <td class="px-3 py-1.5 whitespace-nowrap">{{ date(e.date) }}</td>
                  <td colspan="3" class="py-1.5">
                    <span class="font-medium">{{ e.label }}</span>
                    <span class="ml-2 text-xs text-slate-500">{{ e.journal }} · {{ t(`ledger.kind.${e.kind}` as Key) }}</span>
                    <span v-if="!e.document_id && (e.kind === 'charge' || e.kind === 'instalment')" class="ml-2 text-xs text-orange-700" data-test="no-document">{{ t('ledger.noDocument') }}</span>
                  </td>
                </tr>
                <tr v-for="(l, i) in e.lines ?? []" :key="i" data-test="entry-line">
                  <td />
                  <td class="py-0.5"><span class="font-mono text-xs">{{ l.account }}</span> {{ l.label }}</td>
                  <td class="amount">{{ l.debit_cents ? money(l.debit_cents) : '' }}</td>
                  <td class="amount px-3">{{ l.credit_cents ? money(l.credit_cents) : '' }}</td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <div v-if="(data.balances ?? []).length" class="rounded-md border border-slate-200 bg-white p-3">
          <h2 class="mb-2 font-semibold">{{ t('ledger.balances') }}</h2>
          <table class="w-full text-sm" data-test="balances">
            <tbody>
              <template v-for="g in groups" :key="g.cls">
                <tr><td colspan="2" class="pt-2 text-xs font-medium text-slate-500">{{ t(`ledger.class.${g.cls}` as Key) }}</td></tr>
                <tr v-for="b in g.items" :key="b.account" data-test="balance">
                  <td class="py-0.5"><span class="font-mono text-xs">{{ b.account }}</span> {{ b.label }}</td>
                  <td class="amount">{{ money(b.balance_cents ?? 0) }}</td>
                </tr>
              </template>
              <tr class="border-t border-slate-200 font-medium">
                <td class="pt-1">{{ t('ledger.total') }}</td>
                <td class="amount pt-1" data-test="balances-total">{{ money(total) }}</td>
              </tr>
            </tbody>
          </table>
          <p class="mt-2 text-xs text-slate-500">{{ t('ledger.balanceSign') }}</p>
        </div>
      </div>
    </template>
  </section>
</template>
