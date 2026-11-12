<script setup lang="ts">
// The Loans tab of an asset (RENT-SPEC-014; tenure-api Q-126; Q-W38): the
// loans that finance it with their totals by year, and the amortisation
// table of the one opened. The interest and insurance of each year go to
// line 250 of the tax summary by themselves.
import { onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { useSession } from '@/stores/session'
import { t } from '@/i18n'
import { date, money } from '@/i18n/format'
import LoanDialog from './LoanDialog.vue'
import { get, list, rate, type Loan } from './loans'

const props = defineProps<{ assetId: string }>()
const s = useSession()
const loans = ref<Loan[] | null>(null)
const open = ref<Loan | null>(null)
const editing = ref<Loan | null>(null)
const dialog = ref(false)

async function load(): Promise<void> {
  loans.value = await list(props.assetId)
}
onMounted(load)
watch(() => props.assetId, load)

async function show(l: Loan): Promise<void> {
  open.value = open.value?.id === l.id ? null : await get(l.id ?? '')
}
function add(): void {
  editing.value = null
  dialog.value = true
}
async function edit(l: Loan): Promise<void> {
  editing.value = await get(l.id ?? '')
  dialog.value = true
}
async function saved(l: Loan): Promise<void> {
  await load()
  open.value = l
}
</script>

<template>
  <section class="space-y-4" data-test="asset-loans">
    <div class="flex items-start justify-between gap-4">
      <p class="text-sm text-slate-600">{{ t('loans.intro') }}</p>
      <Button v-if="s.canWrite" :label="t('loans.add')" icon="pi pi-plus" data-test="loan-add" @click="add" />
    </div>
    <Skeleton v-if="!loans" height="6rem" />
    <Message v-else-if="!loans.length" severity="secondary" :closable="false" data-test="loans-empty">{{ t('loans.empty') }}</Message>
    <article v-for="l in loans ?? []" :key="l.id" class="rounded-md border border-slate-200 bg-white p-4" data-test="loan">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="font-semibold" data-test="loan-title">{{ l.label }} <span v-if="l.lender" class="text-sm font-normal text-slate-500">· {{ l.lender }}</span></h3>
          <p class="text-sm text-slate-600">
            {{ t('loans.summary', { principal: money(l.principal_cents ?? 0), rate: rate(l.annual_rate_ppm), n: l.term_months ?? 0, from: date(l.first_due_on), to: date(l.last_due_on) }) }}
          </p>
          <p class="text-xs text-slate-500">{{ l.source === 'imported' ? t('loans.sourceImported') : t('loans.sourceComputed') }}</p>
        </div>
        <div class="flex gap-2">
          <Button :label="open?.id === l.id ? t('loans.hideTable') : t('loans.showTable')" icon="pi pi-table" severity="secondary" size="small" data-test="loan-open" @click="show(l)" />
          <Button v-if="s.canWrite" :label="t('common.edit')" icon="pi pi-pencil" severity="secondary" size="small" data-test="loan-edit" @click="edit(l)" />
        </div>
      </div>
      <table class="mt-3 w-full text-sm" data-test="loan-years">
        <thead class="text-left text-xs text-slate-500">
          <tr><th class="py-1">{{ t('loans.year') }}</th><th class="amount">{{ t('loans.principalPaid') }}</th><th class="amount">{{ t('loans.interest') }}</th><th class="amount">{{ t('loans.insuranceCol') }}</th><th class="amount">{{ t('loans.remaining') }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="y in l.years ?? []" :key="y.year" class="border-t border-slate-100" data-test="loan-year">
            <td class="py-1">{{ y.year }} <span class="text-xs text-slate-500">({{ t('loans.instalments', { n: y.instalments ?? 0 }) }})</span></td>
            <td class="amount">{{ money(y.principal_cents ?? 0) }}</td>
            <td class="amount">{{ money(y.interest_cents ?? 0) }}</td>
            <td class="amount">{{ money(y.insurance_cents ?? 0) }}</td>
            <td class="amount">{{ money(y.remaining_cents ?? 0) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="open?.id === l.id" class="mt-3 max-h-96 overflow-auto rounded border border-slate-100" data-test="loan-instalments">
        <table class="w-full text-xs">
          <thead class="sticky top-0 bg-slate-50 text-left text-slate-500">
            <tr><th class="px-2 py-1">{{ t('loans.seq') }}</th><th>{{ t('loans.dueOn') }}</th><th class="amount">{{ t('loans.principalPaid') }}</th><th class="amount">{{ t('loans.interest') }}</th><th class="amount">{{ t('loans.insuranceCol') }}</th><th class="amount px-2">{{ t('loans.remaining') }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="i in open?.instalments ?? []" :key="i.seq" class="border-t border-slate-100" data-test="instalment">
              <td class="px-2 py-0.5">{{ i.seq }}</td>
              <td>{{ date(i.due_on) }}</td>
              <td class="amount">{{ money(i.principal_cents ?? 0) }}</td>
              <td class="amount">{{ money(i.interest_cents ?? 0) }}</td>
              <td class="amount">{{ money(i.insurance_cents ?? 0) }}</td>
              <td class="amount px-2">{{ money(i.remaining_cents ?? 0) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
    <LoanDialog v-model:visible="dialog" :asset-id="assetId" :loan="editing" @saved="saved" />
  </section>
</template>
