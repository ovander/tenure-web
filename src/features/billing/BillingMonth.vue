<script setup lang="ts">
// S08 Billing month (RENT-FE-001 §3, flow 2): the fees of a period computed
// in a « Simulation » panel before anything is issued, then issued through a
// dialog that restates their count and total; the period's documents (rent
// calls, receipts, cancellations) below, each live rent call with « Cancel and
// reissue ». The period is in the URL; an issued document is never edited.
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Textarea from 'primevue/textarea'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { useToast } from 'primevue/usetoast'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FormField from '@/components/FormField.vue'
import { ApiError } from '@/api/client'
import { useSession } from '@/stores/session'
import { download } from '@/features/lease/store'
import { t, type Key } from '@/i18n'
import { useLatest } from '@/lib/async'
import { dayOf, money } from '@/i18n/format'
import { exception, feesTotal, live, shiftPeriod, useBilling, type BillingDoc, type Fee, type RunView } from './store'
import { useLeaseNames } from './names'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const s = useSession()
const store = useBilling()
const names = useLeaseNames()

const period = computed(() => route.params.period as string)
const docs = ref<BillingDoc[] | null>(null)
const simulation = ref<RunView | null>(null)
const busy = ref(false)
const error = ref('')
const confirmIssue = ref(false)
const cancelling = ref<BillingDoc | null>(null)
const reason = ref('')

const fees = computed<Fee[]>(() => simulation.value?.fees ?? [])
const total = computed(() => feesTotal(fees.value))
const monthLabel = computed(() => {
  const [y, m] = period.value.split('-').map(Number)
  return `${t(`month.${m}` as Key)} ${y}`
})
const issued = computed(() => (docs.value ?? []).filter((d) => d.kind === 'rent_call'))

// Only answers for the month shown are kept: a list or a simulation asked
// for another month (the owner moved on meanwhile) is dropped.
const latestDocs = useLatest()
const latestSim = useLatest()
async function loadDocs(): Promise<void> {
  const token = latestDocs.next()
  docs.value = null
  try {
    const items = (await store.documents({ period: period.value })).items
    if (latestDocs.isLatest(token)) docs.value = items
  } catch {
    if (!latestDocs.isLatest(token)) return
    docs.value = []
    toast.add({ severity: 'error', summary: t('error.network'), life: 4000 })
  }
}
onMounted(async () => {
  await Promise.all([names.load(), loadDocs()])
})
watch(period, () => {
  latestSim.next()
  simulation.value = null
  error.value = ''
  void loadDocs()
})

function problemText(e: unknown): string {
  return e instanceof ApiError ? [e.problem.title].filter(Boolean).join(' ') : t('error.network')
}

async function simulate(): Promise<void> {
  const token = latestSim.next()
  busy.value = true
  error.value = ''
  try {
    const sim = await store.run(period.value, true)
    if (latestSim.isLatest(token)) simulation.value = sim
  } catch (e) {
    if (latestSim.isLatest(token)) error.value = problemText(e)
  } finally {
    busy.value = false
  }
}

async function issue(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const r = await store.run(period.value, false)
    confirmIssue.value = false
    simulation.value = null
    toast.add({ severity: 'success', summary: t('billing.issued', { n: r.fees?.length ?? 0 }), life: 4000 })
    await loadDocs()
  } catch (e) {
    error.value = problemText(e)
  } finally {
    busy.value = false
  }
}

function askCancel(d: BillingDoc): void {
  reason.value = ''
  error.value = ''
  cancelling.value = d
}
const cancelVisible = computed({ get: () => cancelling.value !== null, set: (v: boolean) => (cancelling.value = v ? cancelling.value : null) })
async function cancel(): Promise<void> {
  if (!cancelling.value?.id) return
  busy.value = true
  error.value = ''
  try {
    const r = await store.cancel(cancelling.value.id, reason.value.trim())
    cancelling.value = null
    toast.add({ severity: 'success', summary: r.reissued ? t('billing.reissued', { number: r.reissued.number ?? '' }) : t('billing.cancelled'), life: 5000 })
    await loadDocs()
  } catch (e) {
    error.value = problemText(e)
  } finally {
    busy.value = false
  }
}

async function open(d: BillingDoc): Promise<void> {
  if (!d.document_id) return
  try {
    await download(d.document_id)
  } catch {
    toast.add({ severity: 'error', summary: t('error.network'), life: 4000 })
  }
}

function go(n: number): void {
  void router.push(`/billing/${shiftPeriod(period.value, n)}`)
}
function lineLabel(kind: string | undefined): string {
  return kind ? t(`billing.line.${kind}` as Key) : ''
}
</script>

<template>
  <section class="max-w-6xl space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-2">
        <Button icon="pi pi-chevron-left" text rounded :aria-label="t('billing.previous')" data-test="prev-month" @click="go(-1)" />
        <h1 class="min-w-48 text-center text-xl font-semibold" data-test="billing-title">{{ t('billing.title') }} · {{ monthLabel }}</h1>
        <Button icon="pi pi-chevron-right" text rounded :aria-label="t('billing.next')" data-test="next-month" @click="go(1)" />
      </div>
      <div class="flex flex-wrap gap-2">
        <RouterLink to="/billing/payments"><Button :label="t('payments.title')" icon="pi pi-wallet" severity="secondary" data-test="to-payments" /></RouterLink>
        <Button v-if="s.canWrite" :label="t('billing.simulate')" icon="pi pi-calculator" severity="secondary" :loading="busy && !confirmIssue" data-test="simulate" @click="simulate" />
        <span v-if="s.canWrite" :title="simulation ? '' : t('billing.simulateFirst')" data-test="issue-reason">
          <Button :label="t('billing.issue')" icon="pi pi-send" :disabled="!simulation || fees.length === 0" data-test="issue" @click="confirmIssue = true" />
        </span>
      </div>
    </div>

    <Message v-if="error && !confirmIssue && !cancelling" severity="error" :closable="false" data-test="billing-error">{{ error }}</Message>

    <div v-if="simulation" class="rounded-md border-2 border-dashed border-amber-400 bg-amber-50/40 p-4" data-test="simulation">
      <h2 class="mb-1 text-base font-semibold">{{ t('billing.simulation') }}</h2>
      <p class="mb-3 text-sm text-slate-600">{{ t('billing.simulationBody') }}</p>
      <p v-if="fees.length === 0" class="text-sm" data-test="simulation-empty">{{ t('billing.nothingToIssue') }}</p>
      <table v-else class="w-full text-sm" data-test="fees">
        <thead>
          <tr class="border-b border-slate-300 text-left text-slate-600">
            <th class="py-1 pr-3 font-medium">{{ t('billing.lease') }}</th>
            <th class="py-1 pr-3 font-medium">{{ t('billing.lines') }}</th>
            <th class="py-1 pr-3 font-medium">{{ t('billing.exception') }}</th>
            <th class="amount py-1 font-medium">{{ t('billing.total') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in fees" :key="f.lease_id" class="border-b border-slate-200 align-top" data-test="fee">
            <td class="py-2 pr-3">
              <RouterLink :to="`/leases/${f.lease_id}/billing`" class="font-medium text-emerald-800 hover:underline">{{ names.label(f.lease_id) }}</RouterLink>
            </td>
            <td class="py-2 pr-3">
              <ul>
                <li v-for="(l, i) in f.lines ?? []" :key="i" class="flex justify-between gap-4">
                  <span>
                    {{ lineLabel(l.kind) }}<span v-if="l.of" class="text-slate-500"> ({{ l.instalment }}/{{ l.of }}<span v-if="l.reference">, {{ l.reference }}</span>)</span>
                    <span v-if="f.prorated && l.base_cents != null && l.base_cents !== l.amount_cents" class="text-slate-500"> — {{ t('billing.of') }} {{ money(l.base_cents) }}</span>
                  </span>
                  <span class="amount" :class="{ negative: (l.amount_cents ?? 0) < 0 }">{{ money(l.amount_cents ?? 0) }}</span>
                </li>
              </ul>
            </td>
            <td class="py-2 pr-3" data-test="fee-exception">
              <span v-if="exception(f) === 'prorated'" class="rounded bg-orange-100 px-2 py-0.5 text-orange-800">{{ t('billing.prorated', { days: f.occupied_days ?? 0, of: f.days_in_period ?? 0 }) }}</span>
              <span v-else-if="exception(f) === 'carry_over'" class="rounded bg-orange-100 px-2 py-0.5 text-orange-800">{{ t('billing.carryOver', { amount: money(-(f.carry_over_cents ?? 0)) }) }}</span>
            </td>
            <td class="amount py-2 font-medium">{{ money(f.total_cents ?? 0) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" class="py-2 font-semibold">{{ t('billing.feesCount', { n: fees.length }) }}</td>
            <td class="amount py-2 font-semibold" data-test="fees-total">{{ money(total) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="space-y-2">
      <h2 class="text-base font-semibold">{{ t('billing.documents') }}</h2>
      <Skeleton v-if="docs === null" height="6rem" />
      <div v-else-if="docs.length === 0" class="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm" data-test="docs-empty">
        <p class="font-medium">{{ t('billing.noDocuments') }}</p>
        <p v-if="s.canWrite" class="mt-1 text-slate-500">{{ t('billing.noDocumentsAction') }}</p>
      </div>
      <DataTable v-else :value="docs" data-key="id" size="small" data-test="documents">
        <Column :header="t('billing.number')">
          <template #body="{ data }">
            <span class="font-mono" :class="{ 'line-through text-slate-400': data.cancelled_by }" data-test="doc-number">{{ data.number }}</span>
          </template>
        </Column>
        <Column :header="t('billing.kindLabel')">
          <template #body="{ data }">
            <span data-test="doc-kind">{{ t(`billing.kind.${data.kind}` as Key) }}</span>
            <span v-if="data.generation > 1" class="ml-1 text-xs text-slate-500">({{ t('billing.generation', { n: data.generation }) }})</span>
            <span v-if="data.cancelled_by" class="ml-1 text-xs text-slate-500">· {{ t('billing.cancelledTag') }}</span>
          </template>
        </Column>
        <Column :header="t('billing.lease')">
          <template #body="{ data }"><RouterLink :to="`/leases/${data.lease_id}/billing`" class="hover:underline">{{ names.label(data.lease_id) }}</RouterLink></template>
        </Column>
        <Column :header="t('doc.issued')">
          <template #body="{ data }">{{ dayOf(data.issued_at) }}</template>
        </Column>
        <Column :header="t('billing.total')" class="amount">
          <template #body="{ data }"><span :class="{ negative: (data.total_cents ?? 0) < 0 }">{{ money(data.total_cents ?? 0) }}</span></template>
        </Column>
        <Column>
          <template #body="{ data }">
            <div class="flex justify-end gap-2">
              <Button v-if="data.document_id" icon="pi pi-download" size="small" text :aria-label="t('doc.download')" :title="t('doc.download')" data-test="doc-download" @click="open(data)" />
              <Button v-if="s.canWrite && data.kind === 'rent_call' && live(data)" :label="t('billing.cancelReissue')" size="small" severity="secondary" data-test="cancel-reissue" @click="askCancel(data)" />
            </div>
          </template>
        </Column>
      </DataTable>
      <p v-if="issued.length" class="text-xs text-slate-500">{{ t('billing.receiptsNote') }}</p>
    </div>

    <ConfirmDialog
      v-model:visible="confirmIssue"
      :title="t('billing.issueTitle', { month: monthLabel })"
      :body="t('billing.issueBody', { n: fees.length, total: money(total) })"
      :confirm="t('billing.issue')"
      :busy="busy"
      @confirm="issue"
    >
      <Message v-if="error" severity="error" :closable="false" data-test="issue-error">{{ error }}</Message>
    </ConfirmDialog>

    <ConfirmDialog
      v-model:visible="cancelVisible"
      :title="t('billing.cancelReissue')"
      :body="t('billing.cancelBody', { number: cancelling?.number ?? '' })"
      :confirm="t('billing.cancelReissue')"
      :busy="busy"
      :disabled="!reason.trim()"
      @confirm="cancel"
    >
      <FormField id="cancel_reason" :help="t('help.billing.reason')" :label="t('billing.reason')">
        <Textarea id="cancel_reason" v-model="reason" rows="3" class="w-full" :placeholder="t('billing.reasonPlaceholder')" />
      </FormField>
      <Message v-if="error" severity="error" :closable="false" class="mt-3" data-test="cancel-error">{{ error }}</Message>
    </ConfirmDialog>
  </section>
</template>
