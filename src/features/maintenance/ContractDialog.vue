<script setup lang="ts">
// A recurring maintenance of an asset, recorded or changed (tenure-api
// Q-131). For a boiler or a chimney the API fills the legal interval and who
// must have it done when left empty, and refuses a longer interval; a
// chimney's rhythm depends on its fuel, required. For another kind both are
// needed.
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import DayInput from '@/components/DayInput.vue'
import { useProblemForm } from '@/app/form'
import { assetLabel, useAssets } from '@/features/portfolio/store'
import { t, type Key } from '@/i18n'
import { isoDay } from '@/i18n/format'
import { saveContract, type Contract, type ContractInput, type Contractor } from './maintenance'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ contract?: Contract | null; contractors: Contractor[] }>()
const emit = defineEmits<{ saved: [c: Contract] }>()
const assets = useAssets()
const form = ref<ContractInput>({})
const { errors, summary, busy, submit, reset } = useProblemForm(async () => {
  visible.value = false
})

const assetOptions = computed(() => Object.values(assets.byId).map((a) => ({ value: a.id ?? '', label: assetLabel(a) })))
const fuelOptions = computed(() => (['gas', 'wood', 'pellets', 'oil', 'other'] as const).map((f) => ({ value: f, label: t(`maintenance.fuel.${f}` as Key) })))
const kindOptions = computed(() => (['boiler', 'chimney', 'other'] as const).map((k) => ({ value: k, label: t(`maintenance.kind.${k}` as Key) })))
const responsibleOptions = computed(() => [
  ...(form.value.kind === 'other' ? [] : [{ value: '', label: t('maintenance.responsibleLegal') }]),
  { value: 'tenant', label: t('maintenance.responsible.tenant') },
  { value: 'owner', label: t('maintenance.responsible.owner') },
])
const contractorOptions = computed(() => [{ value: '', label: '—' }, ...props.contractors.map((c) => ({ value: c.id ?? '', label: c.name ?? '' }))])

watch(visible, (v) => {
  if (!v) return
  reset()
  if (!Object.keys(assets.byId).length) void assets.list(1, 100)
  const c = props.contract
  form.value = c
    ? { asset_id: c.asset_id, kind: c.kind, fuel: c.fuel, title: c.title, contractor_id: c.contractor_id ?? '', interval_months: c.interval_months, responsible: c.responsible,
        first_due_on: c.first_due_on, end_on: c.end_on, document_id: c.document_id, notes: c.notes }
    : { asset_id: '', kind: 'boiler', title: t('maintenance.kind.boiler'), contractor_id: '', responsible: undefined, first_due_on: isoDay(new Date()) }
}, { immediate: true })

// The title follows the kind until the owner types one.
watch(() => form.value.kind, (k, old) => {
  if (old && form.value.title === t(`maintenance.kind.${old}` as Key)) form.value.title = k === 'other' ? '' : t(`maintenance.kind.${k}` as Key)
})

async function save(): Promise<void> {
  const local: Record<string, string> = {}
  if (!form.value.asset_id) local.asset_id = t('maintenance.assetRequired')
  if (!form.value.title?.trim()) local.title = t('maintenance.titleRequired')
  if (form.value.kind === 'other' && !form.value.interval_months) local.interval_months = t('maintenance.intervalRequired')
  if (form.value.kind === 'chimney' && !form.value.fuel) local.fuel = t('maintenance.fuelRequired')
  let saved: Contract | undefined
  const ok = await submit(async () => {
    const body: ContractInput = { ...form.value, title: form.value.title?.trim(), contractor_id: form.value.contractor_id || undefined,
      responsible: form.value.responsible || undefined, fuel: form.value.kind === 'chimney' ? form.value.fuel : undefined, interval_months: form.value.interval_months || undefined, end_on: form.value.end_on || undefined }
    saved = await saveContract(body, props.contract)
  }, local)
  if (ok && saved) {
    visible.value = false
    emit('saved', saved)
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="contract ? t('maintenance.contractEdit') : t('maintenance.contractAdd')" class="w-[40rem]" data-test="contract-dialog">
    <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField id="ct_asset" :label="t('maintenance.asset')" :error="errors.asset_id">
        <Select v-model="form.asset_id" input-id="ct_asset" :options="assetOptions" option-label="label" option-value="value" :disabled="!!contract" class="w-full" data-test="contract-asset" />
      </FormField>
      <FormField id="ct_kind" :label="t('maintenance.kindLabel')" :error="errors.kind">
        <Select v-model="form.kind" input-id="ct_kind" :options="kindOptions" option-label="label" option-value="value" class="w-full" data-test="contract-kind" />
      </FormField>
      <FormField v-if="form.kind === 'chimney'" id="ct_fuel" :label="t('maintenance.fuelLabel')" :help="t('help.maintenance.fuel')" :error="errors.fuel" class="sm:col-span-2">
        <Select v-model="form.fuel" input-id="ct_fuel" :options="fuelOptions" option-label="label" option-value="value" class="w-full" :invalid="!!errors.fuel" data-test="contract-fuel" />
      </FormField>
      <FormField id="ct_title" :label="t('maintenance.title')" :error="errors.title" class="sm:col-span-2">
        <InputText id="ct_title" v-model="form.title" class="w-full" :invalid="!!errors.title" data-test="contract-title" />
      </FormField>
      <FormField
        id="ct_interval" :label="t('maintenance.interval')" :help="t('help.maintenance.interval')"
        :hint="form.kind === 'other' ? undefined : t('maintenance.intervalLegalHint')" :error="errors.interval_months"
      >
        <InputNumber v-model="form.interval_months" input-id="ct_interval" :min="1" :max="120" :suffix="t('maintenance.monthsSuffix')" class="w-full" :invalid="!!errors.interval_months" data-test="contract-interval" />
      </FormField>
      <FormField id="ct_responsible" :label="t('maintenance.responsibleLabel')" :help="t('help.maintenance.responsible')" :error="errors.responsible">
        <Select v-model="form.responsible" input-id="ct_responsible" :options="responsibleOptions" option-label="label" option-value="value" class="w-full" data-test="contract-responsible" />
      </FormField>
      <FormField id="ct_first" :label="t('maintenance.firstDueOn')" :help="t('help.maintenance.firstDue')" :error="errors.first_due_on">
        <DayInput id="ct_first" v-model="form.first_due_on" :invalid="!!errors.first_due_on" />
      </FormField>
      <FormField id="ct_end" :label="t('maintenance.endOn')" :hint="t('common.optional')" :error="errors.end_on">
        <DayInput id="ct_end" v-model="form.end_on" />
      </FormField>
      <FormField id="ct_contractor" :label="t('maintenance.contractor')" :hint="t('common.optional')" :error="errors.contractor_id">
        <Select v-model="form.contractor_id" input-id="ct_contractor" :options="contractorOptions" option-label="label" option-value="value" class="w-full" />
      </FormField>
      <FormField id="ct_notes" :label="t('maintenance.notes')" :hint="t('common.optional')" :error="errors.notes" class="sm:col-span-2">
        <Textarea id="ct_notes" v-model="form.notes" rows="2" class="w-full" />
      </FormField>
    </div>
    <template #footer>
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button :label="t('common.save')" icon="pi pi-check" :loading="busy" data-test="contract-save" @click="save" />
    </template>
  </Dialog>
</template>
