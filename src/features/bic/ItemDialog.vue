<script setup lang="ts">
// Furniture or works capitalised on an asset (tenure-api Q-132). The API
// decides expense or fixed asset: works by their nature, furniture against
// the small-equipment threshold; the owner may force the other treatment,
// with a reason the audit trail keeps.
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import DayInput from '@/components/DayInput.vue'
import DecimalInput from '@/components/DecimalInput.vue'
import { useProblemForm } from '@/app/form'
import { t, type Key } from '@/i18n'
import { isoDay } from '@/i18n/format'
import { saveItem, type Item, type ItemInput } from './bic'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ assetId: string; item?: Item | null }>()
const emit = defineEmits<{ saved: [i: Item] }>()
// treatment '' is « by the rule »: sent as no override.
const form = ref<Omit<ItemInput, 'treatment'> & { treatment?: ItemInput['treatment'] | '' }>({})
const { errors, summary, busy, submit, reset } = useProblemForm(async () => {
  visible.value = false
})
const opts = (keys: string[], prefix: string) => keys.map((k) => ({ value: k, label: t(`${prefix}.${k}` as Key) }))
const kindOptions = computed(() => opts(['furniture', 'works'], 'bic.kind'))
const worksOptions = computed(() => opts(['repair', 'improvement', 'construction'], 'bic.works'))
const treatmentOptions = computed(() => [{ value: '', label: t('bic.treatmentAuto') }, ...opts(['asset', 'expense'], 'bic.treatment')])

watch(visible, (v) => {
  if (!v) return
  reset()
  const i = props.item
  form.value = i
    ? { kind: i.kind, works: i.works, label: i.label, cost_cents: i.cost_cents, in_service_on: i.in_service_on, months: i.months,
        treatment: i.overridden ? i.treatment : '', override_reason: i.override_reason, disposed_on: i.disposed_on }
    : { kind: 'furniture', label: '', in_service_on: isoDay(new Date()), treatment: '' }
}, { immediate: true })

async function save(): Promise<void> {
  const local: Record<string, string> = {}
  if (!form.value.label?.trim()) local.label = t('bic.labelRequired')
  if (form.value.kind === 'works' && !form.value.months) local.months = t('bic.monthsRequired')
  let saved: Item | undefined
  const ok = await submit(async () => {
    const body: ItemInput = { ...form.value, label: form.value.label?.trim(), works: form.value.kind === 'works' ? form.value.works : undefined,
      treatment: form.value.treatment || undefined, override_reason: form.value.override_reason?.trim() || undefined,
      months: form.value.months || undefined, disposed_on: form.value.disposed_on || undefined }
    saved = await saveItem(props.assetId, body, props.item)
  }, local)
  if (ok && saved) {
    visible.value = false
    emit('saved', saved)
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="item ? t('bic.itemEdit') : t('bic.itemAdd')" class="w-[38rem]" data-test="item-dialog">
    <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField id="it_kind" :label="t('bic.kindLabel')" :error="errors.kind">
        <SelectButton v-model="form.kind" :options="kindOptions" option-label="label" option-value="value" :allow-empty="false" data-test="item-kind" />
      </FormField>
      <FormField v-if="form.kind === 'works'" id="it_works" :label="t('bic.worksLabel')" :help="t('help.bic.works')" :error="errors.works">
        <Select v-model="form.works" input-id="it_works" :options="worksOptions" option-label="label" option-value="value" class="w-full" data-test="item-works" />
      </FormField>
      <FormField id="it_label" :label="t('bic.label')" :error="errors.label" class="sm:col-span-2">
        <InputText id="it_label" v-model="form.label" class="w-full" :invalid="!!errors.label" data-test="item-label" />
      </FormField>
      <FormField id="it_cost" :label="t('bic.cost')" :error="errors.cost_cents">
        <DecimalInput id="it_cost" v-model="form.cost_cents" suffix="€" :invalid="!!errors.cost_cents" />
      </FormField>
      <FormField id="it_in" :label="t('bic.inServiceItem')" :error="errors.in_service_on">
        <DayInput id="it_in" v-model="form.in_service_on" :invalid="!!errors.in_service_on" />
      </FormField>
      <FormField id="it_months" :label="t('bic.months')" :hint="form.kind === 'furniture' ? t('bic.monthsDefault') : undefined" :error="errors.months">
        <InputNumber v-model="form.months" input-id="it_months" :min="1" :max="1200" class="w-full" :invalid="!!errors.months" data-test="item-months" />
      </FormField>
      <FormField id="it_disposed" :label="t('bic.disposedOn')" :hint="t('common.optional')" :error="errors.disposed_on">
        <DayInput id="it_disposed" v-model="form.disposed_on" />
      </FormField>
      <FormField id="it_treat" :label="t('bic.treatmentLabel')" :help="t('help.bic.treatment')" :error="errors.treatment">
        <Select v-model="form.treatment" input-id="it_treat" :options="treatmentOptions" option-label="label" option-value="value" class="w-full" data-test="item-treatment" />
      </FormField>
      <FormField v-if="form.treatment" id="it_reason" :label="t('bic.overrideReason')" :error="errors.override_reason" class="sm:col-span-2">
        <Textarea id="it_reason" v-model="form.override_reason" rows="2" class="w-full" data-test="item-reason" />
      </FormField>
    </div>
    <template #footer>
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button :label="t('common.save')" icon="pi pi-check" :loading="busy" data-test="item-save" @click="save" />
    </template>
  </Dialog>
</template>
