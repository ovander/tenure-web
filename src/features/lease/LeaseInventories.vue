<script setup lang="ts">
// The inventories tab: the entry inventory (needed to activate) and the
// exit one, each with its signed document uploaded and scanned.
import { computed, onMounted, ref } from 'vue'
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
const doneOn = ref<string | null>(null)
const file = ref<File | null>(null)
const busy = ref(false)
const error = ref('')
const kinds = computed(() => (['entry', 'exit'] as const).filter((k) => !rows.value.some((r) => r.kind === k)).map((k) => ({ value: k, label: t(`inventory.kind.${k}` as Key) })))

async function load(): Promise<void> {
  if (props.lease.id) rows.value = await store.inventories(props.lease.id)
  kind.value = rows.value.some((r) => r.kind === 'entry') ? 'exit' : 'entry'
}
onMounted(load)

async function save(): Promise<void> {
  if (!props.lease.id || !file.value) return
  busy.value = true
  error.value = ''
  try {
    const doc = await store.upload('inventory', props.lease, file.value)
    await store.recordInventory(props.lease.id, { kind: kind.value, done_on: doneOn.value ?? undefined, document_id: doc.id })
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
        <FormField id="inv_kind" :label="t('inventory.kind')"><Select v-model="kind" input-id="inv_kind" :options="kinds" option-label="label" option-value="value" /></FormField>
        <FormField id="inv_done" :label="t('inventory.doneOn')"><DayInput id="inv_done" v-model="doneOn" /></FormField>
      </div>
      <FormField id="inv_file" :label="t('inventory.file')"><FilePicker id="inventory" v-model="file" accept="application/pdf" /></FormField>
      <Button :label="t('common.save')" :disabled="!file || !doneOn" :loading="busy" data-test="save-inventory" @click="save" />
    </div>
    <DataTable :value="rows" size="small" data-key="id" data-test="inventories">
      <template #empty>{{ t('inventory.none') }}</template>
      <Column :header="t('inventory.kind')"><template #body="{ data }">{{ t('inventory.kind') }} {{ t(`inventory.kind.${data.kind}` as Key) }}</template></Column>
      <Column :header="t('inventory.doneOn')"><template #body="{ data }">{{ date(data.done_on) }}</template></Column>
      <Column class="w-1"><template #body="{ data }"><Button v-if="data.document_id" icon="pi pi-download" text size="small" :aria-label="t('doc.download')" @click="download(data.document_id)" /></template></Column>
    </DataTable>
  </div>
</template>
