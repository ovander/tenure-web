<script setup lang="ts">
// A person's SCI shares of a year (tenure-api Q-133; Q-W42): their shares of
// the SCIs' issued 2072s, which their tax summary adds to their own revenus
// fonciers; the SCIs they are an associate of whose 2072 does not name them
// yet; and their loans for parts, whose interest is deducted with them.
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import LoanDialog from '@/features/loans/LoanDialog.vue'
import { partsLoans, type Loan } from '@/features/loans/loans'
import { useSession } from '@/stores/session'
import { t } from '@/i18n'
import { money } from '@/i18n/format'
import { shares as getShares, sharePercent, type Shares } from './sci'

const route = useRoute()
const router = useRouter()
const s = useSession()
const year = computed(() => Number(route.params.year))
const data = ref<Shares | null>(null)
const loans = ref<Loan[] | null>(null)
const loanDialog = ref(false)
const editing = ref<Loan | null>(null)

async function load(): Promise<void> {
  data.value = await getShares(year.value)
}
async function loadLoans(): Promise<void> {
  loans.value = await partsLoans()
}
watch(year, load, { immediate: true })
onMounted(loadLoans)
const total = computed(() => (data.value?.shares ?? []).reduce((n, x) => n + (x.net_cents ?? 0), 0))
const yearOf = (l: Loan) => (l.years ?? []).find((y) => y.year === year.value)
const editLoan = (l: Loan | null) => {
  editing.value = l
  loanDialog.value = true
}
</script>

<template>
  <section class="max-w-5xl space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <Button icon="pi pi-chevron-left" text :aria-label="t('bic.previousYear')" data-test="year-prev" @click="router.push(`/shares/${year - 1}`)" />
      <h1 class="text-xl font-semibold" data-test="shares-title">{{ t('sci.sharesTitle', { year }) }}</h1>
      <Button icon="pi pi-chevron-right" text :aria-label="t('bic.nextYear')" data-test="year-next" @click="router.push(`/shares/${year + 1}`)" />
    </div>
    <p class="text-sm text-slate-600">{{ t('sci.sharesIntro') }} <RouterLink :to="`/tax/${year}`" class="text-emerald-700 underline">{{ t('sci.seeTax') }}</RouterLink></p>
    <Skeleton v-if="!data" height="6rem" />
    <template v-else>
      <Message v-if="(data.pending ?? []).length" severity="warn" :closable="false" data-test="shares-pending">{{ t('sci.pending', { n: (data.pending ?? []).length }) }}</Message>
      <article class="rounded-md border border-slate-200 bg-white p-4" data-test="shares">
        <h2 class="mb-2 font-semibold">{{ t('sci.myShares') }}</h2>
        <p v-if="!(data.shares ?? []).length" class="text-sm text-slate-500" data-test="shares-empty">{{ t('sci.sharesEmpty') }}</p>
        <table v-else class="w-full text-sm">
          <thead class="text-left text-xs text-slate-500"><tr><th class="py-1">{{ t('sci.sci') }}</th><th class="amount">{{ t('sci.share') }}</th><th class="amount">{{ t('sci.income') }}</th><th class="amount">{{ t('sci.interest') }}</th><th class="amount">{{ t('sci.otherExpenses') }}</th><th class="amount">{{ t('sci.net') }}</th></tr></thead>
          <tbody>
            <tr v-for="x in data.shares" :key="x.declaration_id" class="border-t border-slate-100" data-test="share">
              <td class="py-1">{{ x.sci_name }} <span class="text-xs text-slate-500">{{ t('sci.partsOf', { parts: x.parts ?? 0, total: x.total_parts ?? 0 }) }}</span></td>
              <td class="amount">{{ sharePercent(x.parts, x.total_parts) }}</td>
              <td class="amount">{{ money(x.income_cents ?? 0) }}</td><td class="amount">{{ money(x.interest_cents ?? 0) }}</td>
              <td class="amount">{{ money(x.other_expenses_cents ?? 0) }}</td><td class="amount font-medium" data-test="share-net">{{ money(x.net_cents ?? 0) }}</td>
            </tr>
            <tr class="border-t border-slate-200 font-medium"><td class="py-1" colspan="5">{{ t('bic.total') }}</td><td class="amount" data-test="shares-total">{{ money(total) }}</td></tr>
          </tbody>
        </table>
        <p class="mt-2 text-xs text-slate-500">{{ t('sci.sharesLineNote') }}</p>
      </article>
      <article class="rounded-md border border-slate-200 bg-white p-4" data-test="parts-loans">
        <div class="flex items-center justify-between gap-3">
          <h2 class="font-semibold">{{ t('sci.partsLoans') }}</h2>
          <Button v-if="s.canWrite" :label="t('sci.partsLoanAdd')" icon="pi pi-plus" size="small" data-test="parts-loan-add" @click="editLoan(null)" />
        </div>
        <p v-if="loans && !loans.length" class="mt-2 text-sm text-slate-500" data-test="parts-loans-empty">{{ t('sci.partsLoansEmpty') }}</p>
        <table v-else-if="loans" class="mt-3 w-full text-sm">
          <thead class="text-left text-xs text-slate-500"><tr><th class="py-1">{{ t('loans.label') }}</th><th>{{ t('sci.sci') }}</th><th class="amount">{{ t('sci.yearInterest', { year }) }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="l in loans" :key="l.id" class="border-t border-slate-100" data-test="parts-loan">
              <td class="py-1">{{ l.label }}</td><td>{{ l.sci_name }}</td>
              <td class="amount">{{ money((yearOf(l)?.interest_cents ?? 0) + (yearOf(l)?.insurance_cents ?? 0)) }}</td>
              <td class="text-right"><Button v-if="s.canWrite" icon="pi pi-pencil" size="small" text :aria-label="t('common.edit')" data-test="parts-loan-edit" @click="editLoan(l)" /></td>
            </tr>
          </tbody>
        </table>
      </article>
    </template>
    <LoanDialog v-model:visible="loanDialog" :loan="editing" @saved="loadLoans" />
  </section>
</template>
