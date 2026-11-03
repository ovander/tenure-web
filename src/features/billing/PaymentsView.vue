<script setup lang="ts">
// S09 Payments (RENT-FE-001 §3): every payment of the scope, the unmatched
// ones on a filter kept in the URL (?unmatched=1, ?lease=…); record a payment,
// apply one to rent calls, and issue the receipts now rather than at the next
// hourly run of billing.receipts.
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Skeleton from 'primevue/skeleton'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { useToast } from 'primevue/usetoast'
import { ApiError } from '@/api/client'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'
import { currentPeriod, date, money } from '@/i18n/format'
import { useBilling, type Payment } from './store'
import { useLeaseNames } from './names'
import PaymentDialog from './PaymentDialog.vue'
import MatchDialog from './MatchDialog.vue'

const props = defineProps<{ leaseId?: string; embedded?: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const s = useSession()
const store = useBilling()
const names = useLeaseNames()

const rows = ref<Payment[] | null>(null)
const adding = ref(false)
const matching = ref<Payment | null>(null)
const issuing = ref(false)
const unmatched = computed({
  get: () => !props.embedded && route.query.unmatched === '1',
  set: (v: boolean) => void router.replace({ query: { ...route.query, unmatched: v ? '1' : undefined } }),
})
const leaseFilter = computed(() => props.leaseId ?? (route.query.lease as string | undefined))
const matchVisible = computed({ get: () => matching.value !== null, set: (v: boolean) => (matching.value = v ? matching.value : null) })

async function load(): Promise<void> {
  rows.value = null
  try {
    rows.value = (await store.payments({ lease_id: leaseFilter.value, unmatched: unmatched.value })).items
  } catch {
    rows.value = []
    toast.add({ severity: 'error', summary: t('error.network'), life: 4000 })
  }
}
onMounted(async () => {
  await Promise.all([names.load(), load()])
})
watch(() => [route.query.unmatched, leaseFilter.value], load)

function saved(p: Payment): void {
  const key = (p.matched_cents ?? 0) > 0 ? 'payments.savedMatched' : 'payments.saved'
  toast.add({ severity: 'success', summary: t(key as Key, { amount: money(p.matched_cents ?? 0) }), life: 5000 })
  void load()
  emit('changed')
}

async function issueReceipts(): Promise<void> {
  issuing.value = true
  try {
    await store.issueReceipts()
    toast.add({ severity: 'success', summary: t('payments.receiptsIssued'), life: 5000 })
    emit('changed')
  } catch (e) {
    toast.add({ severity: 'error', summary: e instanceof ApiError ? e.problem.title || t('error.title') : t('error.network'), life: 5000 })
  } finally {
    issuing.value = false
  }
}
</script>

<template>
  <section :class="embedded ? 'space-y-3' : 'max-w-6xl space-y-5'">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div v-if="!embedded">
        <nav class="text-sm text-slate-500" aria-label="breadcrumb">
          <RouterLink :to="`/billing/${currentPeriod()}`" class="hover:underline">{{ t('billing.title') }}</RouterLink>
          <span class="mx-2">›</span><span class="text-slate-700">{{ t('payments.title') }}</span>
        </nav>
        <h1 class="text-xl font-semibold">{{ t('payments.title') }}</h1>
      </div>
      <h2 v-else class="text-base font-semibold">{{ t('payments.title') }}</h2>
      <div class="flex flex-wrap items-center gap-3">
        <span v-if="!embedded" class="flex items-center gap-2">
          <Checkbox v-model="unmatched" input-id="only_unmatched" binary />
          <label for="only_unmatched" class="text-sm">{{ t('payments.onlyUnmatched') }}</label>
        </span>
        <Button v-if="s.canWrite" :label="t('payments.issueReceipts')" icon="pi pi-file-check" severity="secondary" :loading="issuing" :title="t('help.payment.receipts')" data-test="issue-receipts" @click="issueReceipts" />
        <Button v-if="s.canWrite" :label="t('payments.add')" icon="pi pi-plus" data-test="add-payment" @click="adding = true" />
      </div>
    </div>

    <Skeleton v-if="rows === null" height="6rem" />
    <div v-else-if="rows.length === 0" class="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm" data-test="payments-empty">
      <p class="font-medium">{{ unmatched ? t('payments.noneUnmatched') : t('payments.empty') }}</p>
      <Button v-if="s.canWrite && !unmatched" :label="t('payments.add')" icon="pi pi-plus" class="mt-3" @click="adding = true" />
    </div>
    <DataTable v-else :value="rows" data-key="id" size="small" data-test="payments">
      <Column :header="t('payments.paidOn')">
        <template #body="{ data }">{{ date(data.paid_on) }}</template>
      </Column>
      <Column v-if="!embedded" :header="t('billing.lease')">
        <template #body="{ data }"><RouterLink :to="`/leases/${data.lease_id}/billing`" class="hover:underline">{{ names.label(data.lease_id) }}</RouterLink></template>
      </Column>
      <Column :header="t('payments.methodLabel')">
        <template #body="{ data }">{{ data.method ? t(`payments.method.${data.method}` as Key) : '' }}<span v-if="data.reference" class="text-slate-500"> · {{ data.reference }}</span></template>
      </Column>
      <Column :header="t('payments.amount')" class="amount">
        <template #body="{ data }">{{ money(data.amount_cents ?? 0) }}</template>
      </Column>
      <Column :header="t('payments.matched')" class="amount">
        <template #body="{ data }">{{ money(data.matched_cents ?? 0) }}</template>
      </Column>
      <Column :header="t('payments.unmatched')" class="amount">
        <template #body="{ data }"><span :class="{ 'font-medium text-orange-700': (data.unmatched_cents ?? 0) > 0 }" data-test="unmatched-cell">{{ money(data.unmatched_cents ?? 0) }}</span></template>
      </Column>
      <Column>
        <template #body="{ data }">
          <div class="flex justify-end">
            <Button v-if="s.canWrite && (data.unmatched_cents ?? 0) > 0" :label="t('payments.match')" size="small" severity="secondary" data-test="match" @click="matching = data" />
          </div>
        </template>
      </Column>
    </DataTable>

    <PaymentDialog v-model:visible="adding" :lease-id="leaseId" @saved="saved" />
    <MatchDialog v-model:visible="matchVisible" :payment="matching" @saved="saved" />
  </section>
</template>
