<script setup lang="ts">
// Lease hub › Billing (RENT-FE-001 §2): what the lease still owes (arrears,
// no penalty), its billing documents and its payments.
import { onMounted, ref, watch } from 'vue'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import DocumentCard from '@/components/DocumentCard.vue'
import type { Lease } from '@/features/lease/store'
import { t, type Key } from '@/i18n'
import { date, money } from '@/i18n/format'
import { useBilling, type Arrears, type BillingDoc } from './store'
import PaymentsView from './PaymentsView.vue'

const props = defineProps<{ lease: Lease }>()
const store = useBilling()
const arrears = ref<Arrears | null>(null)
const docs = ref<BillingDoc[] | null>(null)

async function load(): Promise<void> {
  if (!props.lease.id) return
  const id = props.lease.id
  await Promise.all([
    store.arrears(id).then((a) => (arrears.value = a)).catch(() => (arrears.value = { items: [], outstanding_cents: 0, overdue_cents: 0 })),
    store.documents({ lease_id: id }).then((p) => (docs.value = p.items)).catch(() => (docs.value = [])),
  ])
}
onMounted(load)
watch(() => props.lease.id, load)

function label(d: BillingDoc): string {
  const kind = t(`billing.kind.${d.kind}` as Key)
  return d.period ? `${kind} ${d.period}` : kind
}
</script>

<template>
  <div class="space-y-6" data-test="lease-billing">
    <Skeleton v-if="!arrears" height="3rem" />
    <Message v-else-if="(arrears.outstanding_cents ?? 0) > 0" :severity="(arrears.overdue_cents ?? 0) > 0 ? 'warn' : 'info'" :closable="false" data-test="arrears">
      {{ t('billing.outstanding', { amount: money(arrears.outstanding_cents ?? 0) }) }}
      <span v-if="(arrears.overdue_cents ?? 0) > 0">· {{ t('billing.overdue', { amount: money(arrears.overdue_cents ?? 0) }) }}</span>
      <ul class="ml-5 mt-1 list-disc text-sm">
        <li v-for="it in arrears.items" :key="it.billing_document_id">{{ it.number }} — {{ t('payments.dueOn') }} {{ date(it.due_on) }} — {{ money(it.outstanding_cents ?? 0) }}</li>
      </ul>
    </Message>
    <p v-else class="text-sm text-slate-600" data-test="arrears-none">{{ t('billing.upToDate') }}</p>

    <div class="space-y-2">
      <h2 class="text-base font-semibold">{{ t('billing.documents') }}</h2>
      <Skeleton v-if="docs === null" height="4rem" />
      <p v-else-if="docs.length === 0" class="text-sm text-slate-500">{{ t('billing.noDocuments') }}</p>
      <DocumentCard v-for="d in docs ?? []" :key="d.id" :number="d.number" :label="label(d)" :issued-at="d.issued_at" :document-id="d.document_id" />
    </div>

    <PaymentsView :lease-id="lease.id" embedded @changed="load" />
  </div>
</template>
