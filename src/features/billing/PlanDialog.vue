<script setup lang="ts">
// A payment plan of a lease's overdue rent (tenure-api Q-122; Q-W36): the
// day agreed, the instalments (spread evenly to start, each editable),
// checked by the API (they must add up to the overdue debt), then recorded.
// While respected, the plan suspends the recovery.
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import DayInput from '@/components/DayInput.vue'
import DecimalInput from '@/components/DecimalInput.vue'
import { useProblemForm } from '@/app/form'
import { t } from '@/i18n'
import { money, parisToday } from '@/i18n/format'
import { addMonths, recordPlan, splitDebt, type Instalment, type Recovery } from './recovery'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ leaseId: string; debtCents: number }>()
const emit = defineEmits<{ saved: [r: Recovery] }>()
const agreedOn = ref<string | null>(parisToday())
const count = ref(3)
const first = ref<string | null>(addMonths(parisToday(), 1))
const rows = ref<{ due_on: string | null; amountCents: number | null | undefined }[]>([])
const checked = ref(false)
const { errors, summary, busy, submit, reset } = useProblemForm()

function spread(): void {
  rows.value = splitDebt(props.debtCents, count.value, first.value ?? parisToday()).map((x) => ({ due_on: x.due_on ?? null, amountCents: x.amount_cents }))
}
watch(visible, (v) => {
  if (!v) return
  reset()
  agreedOn.value = parisToday()
  count.value = 3
  first.value = addMonths(parisToday(), 1)
  spread()
}, { immediate: true })
watch([agreedOn, rows], () => (checked.value = false), { deep: true })
const total = computed(() => rows.value.reduce((s, r) => s + (r.amountCents ?? 0), 0))

function input(dryRun: boolean) {
  const instalments: Instalment[] = rows.value.map((r) => ({ due_on: r.due_on ?? '', amount_cents: r.amountCents ?? 0 }))
  return { agreed_on: agreedOn.value ?? '', instalments, dry_run: dryRun }
}
function checks(): Record<string, string> {
  const local: Record<string, string> = {}
  if (!agreedOn.value) local.agreed_on = t('plan.agreedRequired')
  if (rows.value.some((r) => !r.due_on || !r.amountCents)) local.instalments = t('plan.rowsIncomplete')
  else if (total.value !== props.debtCents) local.instalments = t('plan.totalMismatch', { total: money(total.value), debt: money(props.debtCents) })
  return local
}
async function check(): Promise<void> {
  checked.value = await submit(async () => { await recordPlan(props.leaseId, input(true)) }, checks())
}
async function save(): Promise<void> {
  let r: Recovery | undefined
  const ok = await submit(async () => { r = await recordPlan(props.leaseId, input(false)) }, checks())
  if (ok && r) {
    visible.value = false
    emit('saved', r)
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="t('plan.title')" class="w-[40rem]" data-test="plan-dialog">
    <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
    <p class="mb-4 text-sm text-slate-600">{{ t('plan.intro', { debt: money(debtCents) }) }}</p>
    <div class="grid gap-4 sm:grid-cols-3">
      <FormField id="plan_agreed" :help="t('help.plan.agreedOn')" :label="t('plan.agreedOn')" :error="errors.agreed_on">
        <DayInput id="plan_agreed" v-model="agreedOn" :invalid="!!errors.agreed_on" />
      </FormField>
      <FormField id="plan_count" :help="t('help.plan.count')" :label="t('plan.count')">
        <InputNumber v-model="count" input-id="plan_count" :min="1" :max="36" show-buttons class="w-full" data-test="plan-count" />
      </FormField>
      <FormField id="plan_first" :help="t('help.plan.first')" :label="t('plan.first')">
        <DayInput id="plan_first" v-model="first" />
      </FormField>
    </div>
    <Button :label="t('plan.spread')" icon="pi pi-refresh" text size="small" class="mt-2" data-test="plan-spread" @click="spread" />
    <p v-if="errors.instalments" class="mt-2 text-sm text-red-700" data-test="plan-rows-error">{{ errors.instalments }}</p>
    <div v-for="(r, i) in rows" :key="i" class="mt-2 grid grid-cols-[2rem_1fr_10rem] items-center gap-2" data-test="plan-row">
      <span class="text-sm text-slate-500">{{ i + 1 }}.</span>
      <DayInput :id="`plan_due_${i}`" v-model="r.due_on" />
      <DecimalInput :id="`plan_amount_${i}`" v-model="r.amountCents" suffix="€" data-test="plan-amount" />
    </div>
    <p class="mt-3 text-sm" data-test="plan-total">{{ t('plan.total', { total: money(total), debt: money(debtCents) }) }}</p>
    <Message v-if="checked" severity="success" :closable="false" class="mt-3" data-test="plan-checked">{{ t('plan.checked') }}</Message>
    <div class="mt-6 flex justify-end gap-2">
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button :label="t('plan.check')" severity="secondary" :loading="busy" data-test="plan-check" @click="check" />
      <Button :label="t('plan.save')" icon="pi pi-check" :loading="busy" data-test="plan-save" @click="save" />
    </div>
  </Dialog>
</template>
