<script setup lang="ts">
// S07 Guarantees of a lease: status, amount, guarantor, document; add, edit,
// settle the deposit, generate the DG (deposit receipt) or CA (surety act).
// An accountant gets no guarantor data from the API (RENT-FE-001 §5).
import { onMounted, ref } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import { ApiError } from '@/api/client'
import { useLeases, guarantorOf, download, type Guarantee, type Lease } from './store'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'
import { date, money } from '@/i18n/format'
import GuaranteeDialog from './GuaranteeDialog.vue'

const props = defineProps<{ lease: Lease }>()
const emit = defineEmits<{ changed: [] }>()
const store = useLeases()
const s = useSession()
const toast = useToast()
const rows = ref<Guarantee[]>([])
const editing = ref<Guarantee | null | undefined>(undefined)
const error = ref('')

async function load(): Promise<void> {
  if (props.lease.id) rows.value = await store.guarantees(props.lease.id)
}
onMounted(load)
async function changed(): Promise<void> {
  await load()
  emit('changed')
}

function who(g: Guarantee): string {
  const x = guarantorOf(g)
  if (g.kind === 'surety') return [x.name, x.address].filter(Boolean).join(', ')
  if (g.kind === 'visale') return x.visa_number ?? ''
  if (g.kind === 'insurance') return [x.insurer, x.policy].filter(Boolean).join(' · ')
  return ''
}
const documentable = (g: Guarantee) => (g.kind === 'deposit' || g.kind === 'surety') && !g.document_id
const editable = () => s.canWrite && props.lease.state !== 'closed'

async function act(f: () => Promise<unknown>): Promise<void> {
  error.value = ''
  try {
    await f()
    toast.add({ severity: 'success', summary: t('common.saved'), life: 3000 })
    await changed()
  } catch (e) {
    error.value = e instanceof ApiError ? [e.problem.title, e.problem.detail].filter(Boolean).join(' ') : t('error.network')
  }
}
const settle = (g: Guarantee) =>
  act(() => store.saveGuarantee(props.lease.id ?? '', { kind: g.kind, amount_cents: g.amount_cents, status: 'settled', guarantor: g.guarantor }, g))
const generate = (g: Guarantee) => act(() => store.guaranteeDocument(g.id ?? ''))
</script>

<template>
  <div class="space-y-3">
    <div class="flex justify-end">
      <Button v-if="editable()" :label="t('guarantee.add')" icon="pi pi-plus" size="small" severity="secondary" data-test="add-guarantee" @click="editing = null" />
    </div>
    <Message v-if="error" severity="error" :closable="false" data-test="guarantees-error">{{ error }}</Message>
    <Message v-if="s.role === 'accountant'" severity="info" :closable="false">{{ t('guarantee.hidden') }}</Message>
    <DataTable :value="rows" size="small" data-key="id" data-test="guarantees">
      <template #empty>{{ t('guarantee.none') }}</template>
      <Column :header="t('guarantee.kind')"><template #body="{ data }">{{ t(`guarantee.kind.${data.kind}` as Key) }}</template></Column>
      <Column :header="t('guarantee.amount')" class="amount"><template #body="{ data }">{{ data.kind === 'deposit' ? money(data.amount_cents ?? 0) : '' }}</template></Column>
      <Column :header="t('guarantee.status')"><template #body="{ data }"><Tag :severity="data.status === 'expired' ? 'danger' : data.status === 'settled' ? 'contrast' : 'success'" :value="t(`guarantee.status.${data.status}` as Key)" /></template></Column>
      <Column :header="t('guarantee.guarantor')"><template #body="{ data }">{{ who(data) }}</template></Column>
      <Column :header="t('guarantee.validFrom')"><template #body="{ data }">{{ date(data.valid_from) }}<span v-if="data.valid_to"> → {{ date(data.valid_to) }}</span></template></Column>
      <Column class="w-1 whitespace-nowrap">
        <template #body="{ data }">
          <Button v-if="data.document_id" icon="pi pi-download" text size="small" :aria-label="t('doc.download')" data-test="guarantee-download" @click="download(data.document_id)" />
          <template v-if="editable()">
            <Button v-if="documentable(data)" :label="t('guarantee.document')" text size="small" data-test="guarantee-document" @click="generate(data)" />
            <Button v-if="data.kind === 'deposit' && data.status === 'held' && ['ended', 'notice'].includes(lease.state ?? '')" :label="t('guarantee.settle')" text size="small" data-test="settle" @click="settle(data)" />
            <Button icon="pi pi-pencil" text size="small" :aria-label="t('common.edit')" data-test="edit-guarantee" @click="editing = data" />
          </template>
        </template>
      </Column>
    </DataTable>
    <GuaranteeDialog v-if="editing !== undefined && lease.id" :lease-id="lease.id" :guarantee="editing" :deposit-cents="lease.deposit_cents" @saved="changed" @close="editing = undefined" />
  </div>
</template>
