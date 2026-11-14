<script setup lang="ts">
// One step of an incident (tenure-api Q-130): a quote, the works scheduled,
// done, invoiced or cancelled. The invoice of a repair, or of an improvement
// of a dwelling, becomes a deductible repairs charge; construction,
// enlargement and the improvement of other premises are capitalised and
// deducted nowhere (tenure-api Q-130): the owner chooses the kind of works,
// with help, and the screen says what follows for this asset.
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Textarea from 'primevue/textarea'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import DayInput from '@/components/DayInput.vue'
import DecimalInput from '@/components/DecimalInput.vue'
import FilePicker from '@/components/FilePicker.vue'
import { useProblemForm } from '@/app/form'
import { useAssets } from '@/features/portfolio/store'
import { param } from '@/features/params/store'
import { t, type Key } from '@/i18n'
import { isoDay } from '@/i18n/format'
import { transition, treatmentOutcome, uploadSupporting, type Action, type Contractor, type Incident, type Transition } from './maintenance'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ incident: Incident | null; action: Action | null; contractors: Contractor[] }>()
const emit = defineEmits<{ saved: [i: Incident] }>()
const form = ref<Transition>({})
const amount = ref<number | null | undefined>(null)
const file = ref<File | null>(null)
const { errors, summary, busy, submit, reset } = useProblemForm(async () => {
  visible.value = false
})

const contractorOptions = computed(() => props.contractors.map((c) => ({ value: c.id ?? '', label: c.trade ? `${c.name} · ${c.trade}` : (c.name ?? '') })))
const treatmentOptions = computed(() => (['repair', 'improvement', 'construction'] as const).map((v) => ({ value: v, label: t(`maintenance.treatment.${v}` as Key) })))
const assets = useAssets()
// The asset kinds whose improvements are deductible: the legal parameter
// tax.improvement_deductible, read from the API (never known here).
const deductibleKinds = ref<string[]>([])
const outcome = computed(() =>
  treatmentOutcome(form.value.treatment ?? 'repair', assets.byId[props.incident?.asset_id ?? '']?.kind, deductibleKinds.value))
const needsContractor = computed(() => props.action === 'quote' || props.action === 'schedule')

watch(visible, (v) => {
  if (!v) return
  reset()
  file.value = null
  amount.value = null
  const i = props.incident
  const today = isoDay(new Date())
  form.value = { action: props.action ?? undefined, contractor_id: i?.contractor_id }
  if (props.action === 'schedule') form.value.scheduled_on = i?.scheduled_on ?? today
  if (props.action === 'done') form.value.done_on = i?.scheduled_on && i.scheduled_on <= (today ?? '') ? i.scheduled_on : today
  if (props.action === 'invoice') {
    form.value.treatment = 'repair'
    amount.value = i?.quote_cents ?? null
    void param<{ asset_kinds?: string[] }>('tax.improvement_deductible', i?.done_on).then((p) => (deductibleKinds.value = p?.asset_kinds ?? []))
  }
}, { immediate: true })

async function save(): Promise<void> {
  const i = props.incident
  if (!i) return
  const local: Record<string, string> = {}
  if (needsContractor.value && !form.value.contractor_id) local.contractor_id = t('maintenance.contractorRequired')
  if ((props.action === 'quote' || props.action === 'invoice') && !(amount.value && amount.value > 0)) {
    local[props.action === 'quote' ? 'quote_cents' : 'invoice_cents'] = t('maintenance.amountRequired')
  }
  let saved: Incident | undefined
  const ok = await submit(async () => {
    const body: Transition = { ...form.value }
    const doc = file.value ? await uploadSupporting(i.asset_id ?? '', file.value) : undefined
    if (props.action === 'quote') Object.assign(body, { quote_cents: amount.value ?? 0, quote_document_id: doc })
    if (props.action === 'invoice') Object.assign(body, { invoice_cents: amount.value ?? 0, invoice_document_id: doc, paid_on: body.paid_on || undefined })
    if (!needsContractor.value) delete body.contractor_id
    saved = await transition(i, body)
  }, local)
  if (ok && saved) {
    visible.value = false
    emit('saved', saved)
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="action ? t(`maintenance.action.${action}` as Key) : ''" class="w-[36rem]" data-test="transition-dialog">
    <p class="mb-3 text-sm text-slate-600">{{ incident?.title }}</p>
    <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
    <div class="space-y-4">
      <FormField v-if="needsContractor" id="tr_contractor" :label="t('maintenance.contractor')" :error="errors.contractor_id">
        <Select
          v-model="form.contractor_id" input-id="tr_contractor" :options="contractorOptions" option-label="label" option-value="value" class="w-full"
          :placeholder="contractors.length ? '' : t('maintenance.noContractor')" :invalid="!!errors.contractor_id" data-test="transition-contractor"
        />
      </FormField>
      <template v-if="action === 'quote'">
        <FormField id="tr_quote" :label="t('maintenance.quoteAmount')" :error="errors.quote_cents">
          <DecimalInput id="tr_quote" v-model="amount" suffix="€" :invalid="!!errors.quote_cents" />
        </FormField>
        <FormField id="tr_quote_doc" :label="t('maintenance.quoteDocument')" :hint="t('common.optional')" :error="errors.quote_document_id">
          <FilePicker id="tr_quote_doc" v-model="file" />
        </FormField>
      </template>
      <FormField v-if="action === 'schedule'" id="tr_scheduled" :label="t('maintenance.scheduledOn')" :error="errors.scheduled_on">
        <DayInput id="tr_scheduled" v-model="form.scheduled_on" :invalid="!!errors.scheduled_on" />
      </FormField>
      <FormField v-if="action === 'done'" id="tr_done" :label="t('maintenance.doneOn')" :error="errors.done_on">
        <DayInput id="tr_done" v-model="form.done_on" :invalid="!!errors.done_on" />
      </FormField>
      <template v-if="action === 'invoice'">
        <FormField id="tr_treatment" :label="t('maintenance.treatmentLabel')" :help="t('help.maintenance.treatment')" :error="errors.treatment">
          <SelectButton v-model="form.treatment" :options="treatmentOptions" option-label="label" option-value="value" :allow-empty="false" data-test="transition-treatment" />
        </FormField>
        <p class="text-xs text-slate-600" data-test="treatment-hint">{{ t(`maintenance.treatmentHint.${outcome}` as Key) }}</p>
        <div class="grid gap-4 sm:grid-cols-2">
          <FormField id="tr_invoice" :label="t('maintenance.invoiceAmount')" :error="errors.invoice_cents">
            <DecimalInput id="tr_invoice" v-model="amount" suffix="€" :invalid="!!errors.invoice_cents" />
          </FormField>
          <FormField id="tr_paid" :label="t('maintenance.paidOn')" :hint="t('common.optional')" :error="errors.paid_on">
            <DayInput id="tr_paid" v-model="form.paid_on" />
          </FormField>
        </div>
        <FormField id="tr_invoice_doc" :label="t('maintenance.invoiceDocument')" :hint="t('common.optional')" :error="errors.invoice_document_id">
          <FilePicker id="tr_invoice_doc" v-model="file" />
        </FormField>
      </template>
      <FormField v-if="action === 'cancel'" id="tr_reason" :label="t('maintenance.cancelReason')" :hint="t('common.optional')" :error="errors.reason">
        <Textarea id="tr_reason" v-model="form.reason" rows="2" class="w-full" data-test="transition-reason" />
      </FormField>
    </div>
    <template #footer>
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button :label="action === 'cancel' ? t('maintenance.confirmCancel') : t('common.save')" icon="pi pi-check" :loading="busy" :severity="action === 'cancel' ? 'danger' : undefined" data-test="transition-save" @click="save" />
    </template>
  </Dialog>
</template>
