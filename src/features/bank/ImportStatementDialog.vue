<script setup lang="ts">
// Imports a bank statement into an account (tenure-api Q-123; Q-W37): the
// file is uploaded first (scanned and archived). An OFX is read as it is; a
// CSV's columns are read from its header here and a French mapping is
// proposed, which the owner checks. « Vérifier » reads it on the API (dry
// run: new lines and those the account already holds), then « Importer ».
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Checkbox from 'primevue/checkbox'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import FilePicker from '@/components/FilePicker.vue'
import { useProblemForm } from '@/app/form'
import { t } from '@/i18n'
import { formatOf, guessDelimiter, guessMapping, header, importStatement, uploadStatement, type ImportResult, type Mapping } from './bank'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ accountId: string }>()
const emit = defineEmits<{ imported: [r: ImportResult] }>()
const file = ref<File | null>(null)
const cols = ref<string[]>([])
const mapping = ref<Mapping>({})
const docId = ref('')
const preview = ref<ImportResult | null>(null)
const { errors, summary, busy, submit, reset } = useProblemForm()
const format = computed(() => (file.value ? formatOf(file.value.name) : null))
const colOptions = computed(() => [{ value: '', label: t('bank.noColumn') }, ...cols.value.map((c) => ({ value: c, label: c }))])
const dateFormats = [
  { value: '02/01/2006', label: 'JJ/MM/AAAA' }, { value: '2006-01-02', label: 'AAAA-MM-JJ' }, { value: '02/01/06', label: 'JJ/MM/AA' }, { value: '02-01-2006', label: 'JJ-MM-AAAA' },
]

watch(visible, (v) => {
  if (!v) return
  reset()
  file.value = null
  cols.value = []
  mapping.value = {}
  docId.value = ''
  preview.value = null
})
watch(file, async (f) => {
  docId.value = ''
  preview.value = null
  cols.value = []
  if (!f || formatOf(f.name) !== 'csv') return
  const text = await f.slice(0, 4096).text()
  const d = guessDelimiter(text)
  cols.value = header(text, d)
  mapping.value = { ...guessMapping(cols.value, d), date_format: '02/01/2006' }
})
watch(mapping, () => (preview.value = null), { deep: true })

function clean(m: Mapping): Mapping {
  const out: Mapping = { ...m }
  for (const k of ['amount', 'debit', 'credit', 'reference'] as const) if (!out[k]) delete out[k]
  return out
}
function checks(): Record<string, string> {
  const local: Record<string, string> = {}
  if (!file.value) local.file = t('bank.fileRequired')
  else if (!format.value) local.file = t('bank.fileFormat')
  return local
}
async function run(dryRun: boolean): Promise<void> {
  let r: ImportResult | undefined
  const ok = await submit(async () => {
    if (!docId.value) docId.value = (await uploadStatement(file.value!)).id ?? ''
    r = await importStatement({ account_id: props.accountId, document_id: docId.value, format: format.value!, mapping: format.value === 'csv' ? clean(mapping.value) : undefined, dry_run: dryRun })
  }, checks())
  if (!ok || !r) return
  if (dryRun) preview.value = r
  else {
    visible.value = false
    emit('imported', r)
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="t('bank.import')" class="w-[42rem]" data-test="statement-dialog">
    <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
    <p class="mb-4 text-sm text-slate-600">{{ t('bank.importBody') }}</p>
    <FormField id="st_file" :help="t('help.bank.file')" :label="t('bank.file')" :error="errors.file">
      <FilePicker id="st_file" v-model="file" accept=".csv,.ofx,.qfx,text/csv" />
    </FormField>
    <fieldset v-if="format === 'csv'" class="mt-4 rounded-md border border-slate-200 p-3" data-test="statement-mapping">
      <legend class="px-1 text-sm font-medium">{{ t('bank.mapping') }}</legend>
      <div class="grid gap-3 md:grid-cols-3">
        <FormField id="st_date" :label="t('bank.colDate')"><Select v-model="mapping.date" input-id="st_date" :options="colOptions" option-label="label" option-value="value" class="w-full" data-test="map-date" /></FormField>
        <FormField id="st_label" :label="t('bank.colLabel')"><Select v-model="mapping.label" input-id="st_label" :options="colOptions" option-label="label" option-value="value" class="w-full" /></FormField>
        <FormField id="st_format" :label="t('bank.dateFormat')"><Select v-model="mapping.date_format" input-id="st_format" :options="dateFormats" option-label="label" option-value="value" class="w-full" /></FormField>
        <FormField id="st_amount" :label="t('bank.colAmount')"><Select v-model="mapping.amount" input-id="st_amount" :options="colOptions" option-label="label" option-value="value" class="w-full" /></FormField>
        <FormField id="st_debit" :label="t('bank.colDebit')"><Select v-model="mapping.debit" input-id="st_debit" :options="colOptions" option-label="label" option-value="value" class="w-full" /></FormField>
        <FormField id="st_credit" :label="t('bank.colCredit')"><Select v-model="mapping.credit" input-id="st_credit" :options="colOptions" option-label="label" option-value="value" class="w-full" /></FormField>
        <FormField id="st_ref" :label="`${t('bank.colReference')} (${t('common.optional')})`"><Select v-model="mapping.reference" input-id="st_ref" :options="colOptions" option-label="label" option-value="value" class="w-full" /></FormField>
        <FormField id="st_delim" :label="t('charges.delimiter')"><InputText id="st_delim" v-model="mapping.delimiter" maxlength="1" class="w-16" /></FormField>
        <div class="flex items-center gap-2">
          <Checkbox v-model="mapping.decimal_point" input-id="st_point" binary />
          <label for="st_point" class="text-sm">{{ t('charges.decimalPoint') }}</label>
        </div>
      </div>
    </fieldset>
    <p v-else-if="format === 'ofx'" class="mt-4 text-sm text-slate-600" data-test="statement-ofx">{{ t('bank.ofx') }}</p>
    <Message v-if="preview" severity="success" :closable="false" class="mt-3" data-test="statement-preview">{{ t('bank.preview', { n: preview.new ?? 0, d: preview.duplicates ?? 0 }) }}</Message>
    <div class="mt-6 flex justify-end gap-2">
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button :label="t('bank.check')" severity="secondary" :loading="busy" data-test="statement-check" @click="run(true)" />
      <Button :label="t('bank.importRun')" icon="pi pi-upload" :loading="busy" data-test="statement-import" @click="run(false)" />
    </div>
  </Dialog>
</template>
