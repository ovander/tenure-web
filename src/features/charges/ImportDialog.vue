<script setup lang="ts">
// Imports a syndic statement (S10, flow 3 step 1): the CSV the syndic exports
// and, optionally, the statement's PDF are uploaded first (scanned and
// archived), then read with a column mapping proposed for the usual French
// export. Every row becomes a draft charge keeping the syndic's recoverable
// split; a file the mapping cannot read whole imports nothing.
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Checkbox from 'primevue/checkbox'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import FilePicker from '@/components/FilePicker.vue'
import DayInput from '@/components/DayInput.vue'
import HelpTip from '@/components/HelpTip.vue'
import { ApiError } from '@/api/client'
import { useAssets, assetLabel } from '@/features/portfolio/store'
import { t } from '@/i18n'
import { defaultMapping, useCharges, type Charge, type Mapping } from './store'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ assetId?: string; year?: number }>()
const emit = defineEmits<{ imported: [rows: Charge[]] }>()
const store = useCharges()
const assets = useAssets()

const assetPick = ref('')
const exYear = ref<number>(new Date().getFullYear() - 1)
const chargedOn = ref<string | null>(null)
const csv = ref<File | null>(null)
const pdf = ref<File | null>(null)
const mapping = ref<Mapping>({ ...defaultMapping })
const busy = ref(false)
const error = ref('')
const fieldErrors = ref<Record<string, string>>({})
const assetOptions = computed(() => Object.values(assets.byId).map((a) => ({ value: a.id ?? '', label: assetLabel(a) })))

watch(visible, (v) => {
  if (!v) return
  assetPick.value = props.assetId ?? ''
  exYear.value = props.year ?? new Date().getFullYear() - 1
  chargedOn.value = `${exYear.value}-12-31`
  csv.value = null
  pdf.value = null
  mapping.value = { ...defaultMapping }
  error.value = ''
  fieldErrors.value = {}
})
// The charges are dated the last day of the exercise unless the owner says otherwise.
watch(exYear, (y) => (chargedOn.value = `${y}-12-31`))

async function run(): Promise<void> {
  if (!assetPick.value || !csv.value) return
  busy.value = true
  error.value = ''
  fieldErrors.value = {}
  try {
    const sheet = await store.upload(assetPick.value, csv.value)
    const statement = pdf.value ? await store.upload(assetPick.value, pdf.value) : undefined
    const rows = await store.importSyndic({
      asset_id: assetPick.value, document_id: sheet.id, statement_document_id: statement?.id, charged_on: chargedOn.value ?? undefined,
      exercise_year: exYear.value, mapping: { ...mapping.value, delimiter: mapping.value.delimiter || ';' },
    })
    visible.value = false
    emit('imported', rows)
  } catch (e) {
    if (e instanceof ApiError) {
      for (const f of e.problem.errors ?? []) if (f.field) fieldErrors.value[f.field] = f.message ?? ''
      error.value = [e.problem.title, e.problem.detail].filter(Boolean).join(' ')
    } else error.value = t('error.network')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="t('charges.import')" class="w-[40rem]" data-test="import-dialog">
    <p class="mb-4 text-sm text-slate-600">{{ t('charges.importBody') }}</p>
    <div class="space-y-4">
      <div class="grid gap-4 md:grid-cols-2">
        <FormField id="im_asset" :help="t('help.charge.asset')" :label="t('charges.asset')">
          <Select v-model="assetPick" input-id="im_asset" :options="assetOptions" option-label="label" option-value="value" class="w-full" />
        </FormField>
        <FormField id="im_year" :help="t('help.import.year')" :label="t('charges.exercise')">
          <InputNumber v-model="exYear" input-id="im_year" :use-grouping="false" :min="1990" :max="2100" />
        </FormField>
        <FormField id="im_csv" :help="t('help.import.csv')" :label="t('charges.csv')">
          <FilePicker id="im_csv" v-model="csv" accept=".csv,text/csv" />
        </FormField>
        <FormField id="im_pdf" :help="t('help.import.pdf')" :label="`${t('charges.pdf')} (${t('common.optional')})`">
          <FilePicker id="im_pdf" v-model="pdf" accept="application/pdf" />
        </FormField>
        <FormField id="im_on" :help="t('help.import.chargedOn')" :label="t('charges.chargedOn')">
          <DayInput id="im_on" v-model="chargedOn" />
        </FormField>
      </div>
      <fieldset class="rounded-md border border-slate-200 p-3">
        <legend class="flex items-center gap-1 px-1 text-sm font-medium">{{ t('charges.mapping') }} <HelpTip id="im_mapping" :text="t('help.import.mapping')" /></legend>
        <div class="grid gap-3 md:grid-cols-3">
          <FormField id="im_label" :label="t('charges.colLabel')" :error="fieldErrors['mapping.label']"><InputText id="im_label" v-model="mapping.label" /></FormField>
          <FormField id="im_amount" :label="t('charges.colAmount')" :error="fieldErrors['mapping.amount']"><InputText id="im_amount" v-model="mapping.amount" /></FormField>
          <FormField id="im_recoverable" :label="t('charges.colRecoverable')" :error="fieldErrors['mapping.recoverable']"><InputText id="im_recoverable" v-model="mapping.recoverable" /></FormField>
          <FormField id="im_delimiter" :label="t('charges.delimiter')"><InputText id="im_delimiter" v-model="mapping.delimiter" maxlength="1" class="w-16" /></FormField>
          <div class="flex items-center gap-2 md:col-span-2">
            <Checkbox v-model="mapping.decimal_point" input-id="im_point" binary />
            <label for="im_point" class="text-sm">{{ t('charges.decimalPoint') }}</label>
          </div>
        </div>
      </fieldset>
    </div>
    <Message v-if="error" severity="error" :closable="false" class="mt-3" data-test="import-error">{{ error }}</Message>
    <div class="mt-6 flex justify-end gap-2">
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button :label="t('charges.importRun')" :loading="busy" :disabled="!assetPick || !csv" data-test="run-import" @click="run" />
    </div>
  </Dialog>
</template>
