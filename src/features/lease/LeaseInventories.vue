<script setup lang="ts">
// The inventories tab: the entry inventory (needed to activate) and the
// exit one. The entry is captured in Tenure from the asset layout (S15b,
// Q-W26) or, like the exit for now, recorded from its signed PDF, uploaded
// and scanned.
import { computed, onMounted, ref, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import FormField from '@/components/FormField.vue'
import DayInput from '@/components/DayInput.vue'
import FilePicker from '@/components/FilePicker.vue'
import { ApiError } from '@/api/client'
import { useRouter } from 'vue-router'
import Tag from 'primevue/tag'
import { useLeases, download, type Inventory, type Lease } from './store'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'
import { date } from '@/i18n/format'

const props = defineProps<{ lease: Lease }>()
const emit = defineEmits<{ changed: [] }>()
const store = useLeases()
const s = useSession()
const toast = useToast()
const rows = ref<Inventory[]>([])
const adding = ref(false)
const kind = ref<'entry' | 'exit'>('entry')
const mode = ref<'amicable' | 'upload'>('amicable')
const router = useRouter()
// Only the entry is captured in Tenure for now (tenure-api Q-111).
const modes = computed(() => (kind.value === 'entry' ? (['amicable', 'upload'] as const) : (['upload'] as const))
  .map((m) => ({ value: m, label: t(`inventory.mode.${m}` as Key) })))
const capturing = computed(() => kind.value === 'entry' && mode.value === 'amicable')
const doneOn = ref<string | null>(null)
const file = ref<File | null>(null)
const busy = ref(false)
const error = ref('')
// The date is proposed: the lease start for the entry inventory, the lease
// end (or today) for the exit one; the user's own date is kept.
let proposedDay: string | null = null
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Paris' }).format(new Date())
}
function proposeDay(): void {
  if (doneOn.value && doneOn.value !== proposedDay) return
  proposedDay = kind.value === 'entry' ? (props.lease.start_on ?? null) : (props.lease.end_on || today())
  doneOn.value = proposedDay
}
watch([kind, adding], proposeDay)
watch(kind, () => {
  if (kind.value === 'exit') mode.value = 'upload'
})
const kinds = computed(() => (['entry', 'exit'] as const).filter((k) => !rows.value.some((r) => r.kind === k)).map((k) => ({ value: k, label: t(`inventory.kind.${k}` as Key) })))

async function load(): Promise<void> {
  if (props.lease.id) rows.value = await store.inventories(props.lease.id)
  kind.value = rows.value.some((r) => r.kind === 'entry') ? 'exit' : 'entry'
}
onMounted(load)

async function save(): Promise<void> {
  if (!props.lease.id || (!capturing.value && !file.value)) return
  busy.value = true
  error.value = ''
  try {
    if (capturing.value) {
      const inv = await store.recordInventory(props.lease.id, { kind: 'entry', mode: 'amicable' })
      emit('changed')
      await router.push(`/inventories/${inv.id}/capture`)
      return
    }
    if (!file.value) return
    const doc = await store.upload('inventory', props.lease, file.value)
    await store.recordInventory(props.lease.id, { kind: kind.value, mode: 'upload', done_on: doneOn.value ?? undefined, document_id: doc.id })
    toast.add({ severity: 'success', summary: t('common.saved'), life: 3000 })
    adding.value = false
    file.value = null
    doneOn.value = null
    await load()
    emit('changed')
  } catch (e) {
    error.value = e instanceof ApiError ? [e.problem.title, ...(e.problem.errors ?? []).map((x) => x.message), e.problem.detail].filter(Boolean).join(' ') : t('error.network')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex justify-end">
      <Button v-if="s.canWrite && kinds.length && lease.state !== 'closed'" :label="t('inventory.add')" icon="pi pi-plus" size="small" severity="secondary" data-test="add-inventory" @click="adding = !adding" />
    </div>
    <div v-if="adding" class="space-y-4 rounded-md border border-slate-200 bg-white p-5" data-test="inventory-form">
      <Message v-if="error" severity="error" :closable="false" data-test="inventory-error">{{ error }}</Message>
      <div class="grid gap-4 md:grid-cols-2">
        <FormField id="inv_kind" :help="t('help.inventory.kind')" :label="t('inventory.kind')"><Select v-model="kind" input-id="inv_kind" :options="kinds" option-label="label" option-value="value" /></FormField>
        <FormField id="inv_mode" :help="t('help.inventory.mode')" :label="t('inventory.mode')"><Select v-model="mode" input-id="inv_mode" :options="modes" option-label="label" option-value="value" data-test="inventory-mode" /></FormField>
      </div>
      <template v-if="!capturing">
        <FormField id="inv_done" :help="t('help.inventory.doneOn')" :label="t('inventory.doneOn')"><DayInput id="inv_done" v-model="doneOn" /></FormField>
        <FormField id="inv_file" :help="t('help.inventory.file')" :label="t('inventory.file')"><FilePicker id="inventory" v-model="file" accept="application/pdf" /></FormField>
      </template>
      <Button v-if="capturing" :label="t('inventory.create')" icon="pi pi-pencil" :loading="busy" data-test="create-capture" @click="save" />
      <Button v-else :label="t('common.save')" :disabled="!file || !doneOn" :loading="busy" data-test="save-inventory" @click="save" />
    </div>
    <DataTable :value="rows" size="small" data-key="id" data-test="inventories">
      <template #empty>{{ t('inventory.none') }}</template>
      <Column :header="t('inventory.kind')"><template #body="{ data }">{{ t('inventory.kind') }} {{ t(`inventory.kind.${data.kind}` as Key) }}</template></Column>
      <Column :header="t('inventory.doneOn')"><template #body="{ data }">{{ data.done_on ? date(data.done_on) : '' }}</template></Column>
      <Column :header="t('inventory.state')">
        <template #body="{ data }"><Tag :value="t(`inventory.state.${data.state}` as Key)" :severity="data.state === 'issued' ? 'success' : 'secondary'" data-test="inventory-state" /></template>
      </Column>
      <Column class="w-1">
        <template #body="{ data }">
          <div class="flex justify-end gap-1 whitespace-nowrap">
            <Button v-if="data.mode !== 'upload' && data.state === 'completed'" :label="t('inventory.signAction')" icon="pi pi-pen-to-square" text size="small" data-test="open-review" @click="router.push(`/inventories/${data.id}/review`)" />
            <Button v-if="data.mode !== 'upload'" :label="data.state === 'issued' ? t('inventory.open') : t('inventory.capture')" icon="pi pi-pencil" text size="small" data-test="open-capture" @click="router.push(`/inventories/${data.id}/capture`)" />
            <Button v-if="data.document_id" icon="pi pi-download" text size="small" :aria-label="t('doc.download')" @click="download(data.document_id)" />
          </div>
        </template>
      </Column>
    </DataTable>
  </div>
</template>
