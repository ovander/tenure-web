<script setup lang="ts">
// A loan of an asset, recorded or changed (tenure-api Q-126; Q-W38); with
// no asset, a loan for the owner's parts of an SCI, which names the SCI
// (tenure-api Q-133; Q-W42). Two
// ways: computed (a fixed rate repaid in constant monthly instalments,
// previewed before saving) or the bank's own table pasted from a
// spreadsheet or its export, which the API checks repays the principal. A
// change touching a closed year is refused (ledger/period-locked).
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import SelectButton from 'primevue/selectbutton'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import DayInput from '@/components/DayInput.vue'
import DecimalInput from '@/components/DecimalInput.vue'
import { useProblemForm } from '@/app/form'
import { t } from '@/i18n'
import { money } from '@/i18n/format'
import { create, parseRate, parseTable, preview, rate, update, type Input, type Loan } from './loans'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ assetId?: string; loan?: Loan | null }>()
const parts = computed(() => !props.assetId)
const sciName = ref('')
const emit = defineEmits<{ saved: [l: Loan] }>()

type Mode = 'computed' | 'imported'
const mode = ref<Mode>('computed')
const label = ref('')
const lender = ref('')
const principal = ref<number | null | undefined>(null)
const rateText = ref('')
const term = ref<number | null>(240)
const firstDue = ref<string | null>(null)
const insurance = ref<number | null | undefined>(0)
const pasted = ref('')
const shown = ref<Loan | null>(null)
const { errors, summary, busy, submit, reset } = useProblemForm()

const modes = computed(() => [
  { value: 'computed', label: t('loans.modeComputed') },
  { value: 'imported', label: t('loans.modeImported') },
])
const table = computed(() => parseTable(pasted.value))
const tablePrincipal = computed(() => table.value.rows.reduce((s, r) => s + (r.principal_cents ?? 0), 0))

watch(visible, (v) => {
  if (!v) return
  reset()
  shown.value = null
  const l = props.loan
  mode.value = (l?.source as Mode | undefined) ?? 'computed'
  label.value = l?.label ?? ''
  sciName.value = l?.sci_name ?? ''
  lender.value = l?.lender ?? ''
  principal.value = l?.principal_cents ?? null
  rateText.value = l?.annual_rate_ppm != null ? rate(l.annual_rate_ppm).replace(' %', '') : ''
  term.value = l?.term_months ?? 240
  firstDue.value = l?.first_due_on ?? null
  insurance.value = l?.insurance_cents ?? 0
  pasted.value = l?.source === 'imported'
    ? (l.instalments ?? []).map((i) => [i.due_on, cents(i.principal_cents), cents(i.interest_cents), cents(i.insurance_cents)].join(';')).join('\n')
    : ''
}, { immediate: true })
// The preview stays on screen while the figures it was computed from are the
// ones the dialog holds: a field that commits its value again on blur (or
// passes through null and back) no longer wipes it, and a real change hides it.
const shownFor = ref('')
const previewKey = computed(() => (mode.value === 'computed' ? JSON.stringify(previewInput()) : ''))
const current = computed(() => (shown.value && shownFor.value === previewKey.value ? shown.value : null))

function cents(c: number | undefined): string {
  const v = c ?? 0
  return `${Math.trunc(v / 100)},${String(v % 100).padStart(2, '0')}`
}

function checks(): Record<string, string> {
  const local: Record<string, string> = {}
  if (!label.value.trim()) local.label = t('loans.labelRequired')
  if (parts.value && !sciName.value.trim()) local.sci_name = t('loans.sciNameRequired')
  if (!principal.value || principal.value <= 0) local.principal_cents = t('loans.principalRequired')
  if (mode.value === 'computed') {
    const r = parseRate(rateText.value)
    if (r === null || Number.isNaN(r)) local.annual_rate_ppm = t('loans.rateInvalid')
    if (!term.value) local.term_months = t('loans.termRequired')
    if (!firstDue.value) local.first_due_on = t('loans.firstDueRequired')
  } else if (!table.value.rows.length || table.value.bad.length) {
    local.instalments = table.value.bad.length ? t('loans.tableBadLines', { lines: table.value.bad.join(', ') }) : t('loans.tableEmpty')
  }
  return local
}

function input(): Input {
  const base: Input = { label: label.value.trim(), lender: lender.value.trim() || undefined, principal_cents: principal.value ?? 0,
    ...(parts.value ? { kind: 'parts' as const, sci_name: sciName.value.trim() } : { asset_id: props.assetId }) }
  if (mode.value === 'imported') return { ...base, instalments: table.value.rows }
  return { ...base, annual_rate_ppm: parseRate(rateText.value) ?? 0, term_months: term.value ?? 0, first_due_on: firstDue.value ?? '', insurance_cents: insurance.value ?? 0 }
}

function previewInput() {
  const i = input()
  return { principal_cents: i.principal_cents ?? 0, annual_rate_ppm: i.annual_rate_ppm ?? 0, term_months: i.term_months ?? 0,
    first_due_on: i.first_due_on ?? '', insurance_cents: i.insurance_cents ?? 0 }
}

async function check(): Promise<void> {
  await submit(async () => {
    if (mode.value !== 'computed') {
      shown.value = null
      return
    }
    const key = previewKey.value
    shown.value = await preview(previewInput())
    shownFor.value = key
  }, checks())
}

async function save(): Promise<void> {
  let l: Loan | undefined
  const ok = await submit(async () => {
    l = props.loan?.id ? await update(props.loan.id, props.loan.version ?? 0, input()) : await create(input())
  }, checks())
  if (ok && l) {
    visible.value = false
    emit('saved', l)
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="loan ? t('loans.editTitle') : t('loans.newTitle')" class="w-[44rem]" data-test="loan-dialog">
    <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
    <div class="space-y-4">
      <SelectButton v-model="mode" :options="modes" option-label="label" option-value="value" :allow-empty="false" data-test="loan-mode" />
      <div class="grid gap-4 sm:grid-cols-2">
        <FormField id="loan_label" :help="t('help.loans.label')" :label="t('loans.label')" :error="errors.label">
          <InputText id="loan_label" v-model="label" class="w-full" :invalid="!!errors.label" data-test="loan-label" />
        </FormField>
        <FormField v-if="parts" id="loan_sci" :help="t('help.loans.sciName')" :label="t('loans.sciName')" :error="errors.sci_name">
          <InputText id="loan_sci" v-model="sciName" class="w-full" :invalid="!!errors.sci_name" data-test="loan-sci" />
        </FormField>
        <FormField id="loan_lender" :help="t('help.loans.lender')" :label="t('loans.lender')" :hint="t('common.optional')">
          <InputText id="loan_lender" v-model="lender" class="w-full" data-test="loan-lender" />
        </FormField>
        <FormField id="loan_principal" :help="t('help.loans.principal')" :label="t('loans.principal')" :error="errors.principal_cents">
          <DecimalInput id="loan_principal" v-model="principal" suffix="€" :invalid="!!errors.principal_cents" />
        </FormField>
      </div>
      <div v-if="mode === 'computed'" class="grid gap-4 sm:grid-cols-2">
        <FormField id="loan_rate" :help="t('help.loans.rate')" :label="t('loans.rate')" :error="errors.annual_rate_ppm">
          <InputText id="loan_rate" v-model="rateText" class="w-full" placeholder="3,45" :invalid="!!errors.annual_rate_ppm" data-test="loan-rate" />
        </FormField>
        <FormField id="loan_term" :help="t('help.loans.term')" :label="t('loans.term')" :error="errors.term_months">
          <InputNumber v-model="term" input-id="loan_term" :min="1" :max="600" class="w-full" data-test="loan-term" />
        </FormField>
        <FormField id="loan_first" :help="t('help.loans.firstDue')" :label="t('loans.firstDue')" :error="errors.first_due_on">
          <DayInput id="loan_first" v-model="firstDue" :invalid="!!errors.first_due_on" />
        </FormField>
        <FormField id="loan_insurance" :help="t('help.loans.insurance')" :label="t('loans.insurance')" :error="errors.insurance_cents">
          <DecimalInput id="loan_insurance" v-model="insurance" suffix="€" />
        </FormField>
      </div>
      <FormField v-else id="loan_table" :help="t('help.loans.table')" :label="t('loans.table')" :error="errors.instalments">
        <Textarea id="loan_table" v-model="pasted" rows="8" class="w-full font-mono text-xs" :placeholder="t('loans.tablePlaceholder')" :invalid="!!errors.instalments" data-test="loan-table" />
        <p class="mt-1 text-xs text-slate-600" data-test="table-summary">
          {{ t('loans.tableRead', { n: table.rows.length, principal: money(tablePrincipal) }) }}
          <span v-if="principal && tablePrincipal !== principal" class="text-orange-700"> · {{ t('loans.tableMismatch', { principal: money(principal) }) }}</span>
        </p>
      </FormField>
      <div v-if="current" class="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm" data-test="loan-preview">
        <p class="font-medium">{{ t('loans.previewInstalment', { amount: money((current.instalments?.[0]?.principal_cents ?? 0) + (current.instalments?.[0]?.interest_cents ?? 0)), last: current.last_due_on ?? '' }) }}</p>
        <p class="text-slate-600">{{ t('loans.previewTotals', { interest: money(current.interest_cents ?? 0), insurance: money(current.insurance_total_cents ?? 0) }) }}</p>
      </div>
    </div>
    <template #footer>
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button v-if="mode === 'computed'" :label="t('loans.preview')" icon="pi pi-calculator" severity="secondary" :loading="busy" data-test="loan-preview-btn" @click="check" />
      <Button :label="t('common.save')" icon="pi pi-check" :loading="busy" data-test="loan-save" @click="save" />
    </template>
  </Dialog>
</template>
