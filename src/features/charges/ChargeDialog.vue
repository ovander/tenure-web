<script setup lang="ts">
// Adds a charge to the ledger (S10) or edits one: the asset, the category,
// the whole amount and the part recoverable from the tenant, the day and the
// exercise. An imported line shows the syndic's own split beside the owner's
// and is confirmed here. A charge of an issued reconciliation is read only.
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import DecimalInput from '@/components/DecimalInput.vue'
import DayInput from '@/components/DayInput.vue'
import { useProblemForm } from '@/app/form'
import { useAssets, assetLabel } from '@/features/portfolio/store'
import { t, type Key } from '@/i18n'
import { isoDay, money } from '@/i18n/format'
import { categories, toChargeInput, useCharges, type Charge, type ChargeInput } from './store'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ charge?: Charge | null; assetId?: string }>()
const emit = defineEmits<{ saved: [c: Charge] }>()
const store = useCharges()
const assets = useAssets()

const form = ref<ChargeInput>({})
const bad = ref({ amount: false, recoverable: false })
const { errors, summary, busy, submit, reset } = useProblemForm(async () => {
  visible.value = false
})
const editing = computed(() => !!props.charge?.id)
const locked = computed(() => !!props.charge?.reconciliation_id)
const imported = computed(() => props.charge?.source === 'syndic')
const assetOptions = computed(() => Object.values(assets.byId).map((a) => ({ value: a.id ?? '', label: assetLabel(a) })))
const categoryOptions = categories.map((c) => ({ value: c, label: t(`charge.category.${c}` as Key) }))
const yearTouched = ref(false)

watch(visible, (v) => {
  if (!v) return
  reset()
  yearTouched.value = false
  const today = isoDay(new Date()) ?? ''
  form.value = props.charge
    ? toChargeInput(props.charge)
    : { asset_id: props.assetId ?? '', category: 'copro_statement', label: '', amount_cents: undefined, recoverable_cents: 0, charged_on: today, exercise_year: Number(today.slice(0, 4)), status: 'confirmed' }
  if (props.charge) yearTouched.value = true
})
// The exercise follows the day of the charge until the owner sets one.
watch(
  () => form.value.charged_on,
  (d) => {
    if (!yearTouched.value && d) form.value.exercise_year = Number(d.slice(0, 4))
  },
)

async function save(confirm = false): Promise<void> {
  const local: Record<string, string> = {}
  if (bad.value.amount) local.amount_cents = t('common.invalidNumber')
  if (bad.value.recoverable) local.recoverable_cents = t('common.invalidNumber')
  const body: ChargeInput = { ...form.value, label: form.value.label?.trim(), paid_on: form.value.paid_on || undefined }
  if (confirm) body.status = 'confirmed'
  let saved: Charge | undefined
  const ok = await submit(async () => {
    saved = props.charge?.id ? await store.update(props.charge.id, body, props.charge.version ?? 0) : await store.create(body)
  }, local)
  if (ok && saved) {
    visible.value = false
    emit('saved', saved)
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="editing ? t('charges.edit') : t('charges.add')" class="w-[38rem]" data-test="charge-dialog">
    <Message v-if="locked" severity="info" :closable="false" class="mb-3" data-test="charge-locked">{{ t('charges.locked') }}</Message>
    <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
    <div class="space-y-4">
      <div class="grid gap-4 md:grid-cols-2">
        <FormField id="ch_asset" :help="t('help.charge.asset')" :label="t('charges.asset')" :error="errors.asset_id">
          <Select v-model="form.asset_id" input-id="ch_asset" :options="assetOptions" option-label="label" option-value="value" :disabled="editing" class="w-full" />
        </FormField>
        <FormField id="ch_category" :help="t('help.charge.category')" :label="t('charges.category')" :error="errors.category">
          <Select v-model="form.category" input-id="ch_category" :options="categoryOptions" option-label="label" option-value="value" :disabled="locked" class="w-full" />
        </FormField>
      </div>
      <FormField id="ch_label" :help="t('help.charge.label')" :label="t('charges.label')" :error="errors.label">
        <InputText id="ch_label" v-model="form.label" :disabled="locked" :placeholder="t('charges.labelPlaceholder')" />
      </FormField>
      <div class="grid gap-4 md:grid-cols-2">
        <FormField id="ch_amount" :help="t('help.charge.amount')" :label="t('charges.amount')" :error="errors.amount_cents">
          <DecimalInput id="ch_amount" v-model="form.amount_cents" suffix="€" :disabled="locked" :invalid="!!errors.amount_cents" @invalid-input="(b) => (bad.amount = b)" />
        </FormField>
        <FormField
          id="ch_recoverable" :help="t('help.charge.recoverable')" :label="t('charges.recoverable')" :error="errors.recoverable_cents"
          :hint="imported ? t('charges.syndicSplit', { amount: money(charge?.syndic_recoverable_cents ?? 0) }) : undefined"
        >
          <DecimalInput id="ch_recoverable" v-model="form.recoverable_cents" suffix="€" :disabled="locked" :invalid="!!errors.recoverable_cents" @invalid-input="(b) => (bad.recoverable = b)" />
        </FormField>
        <FormField id="ch_on" :help="t('help.charge.chargedOn')" :label="t('charges.chargedOn')" :error="errors.charged_on">
          <DayInput id="ch_on" v-model="form.charged_on" :disabled="locked" />
        </FormField>
        <FormField id="ch_year" :help="t('help.charge.exercise')" :label="t('charges.exercise')" :error="errors.exercise_year">
          <InputNumber v-model="form.exercise_year" input-id="ch_year" :use-grouping="false" :min="1990" :max="2100" :disabled="locked" @input="yearTouched = true" />
        </FormField>
        <FormField id="ch_paid" :help="t('help.charge.paidOn')" :label="`${t('charges.paidOn')} (${t('common.optional')})`" :error="errors.paid_on">
          <DayInput id="ch_paid" v-model="form.paid_on" :disabled="locked" />
        </FormField>
      </div>
    </div>
    <div class="mt-6 flex justify-end gap-2">
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <template v-if="!locked">
        <Button v-if="charge?.status === 'draft'" :label="t('charges.confirm')" severity="secondary" :loading="busy" data-test="confirm-charge" @click="save(true)" />
        <Button :label="t('common.save')" :loading="busy" data-test="save-charge" @click="save()" />
      </template>
    </div>
  </Dialog>
</template>
