<script setup lang="ts">
// Records a payment (S09): the lease, the amount (proposed as what the lease
// still owes), the day (today), the method (transfer) and a reference; applied
// at once to the oldest unpaid rent calls unless the owner unticks it.
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Checkbox from 'primevue/checkbox'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import DecimalInput from '@/components/DecimalInput.vue'
import DayInput from '@/components/DayInput.vue'
import HelpTip from '@/components/HelpTip.vue'
import { useProblemForm } from '@/app/form'
import { t, type Key } from '@/i18n'
import { isoDay, money } from '@/i18n/format'
import { paymentMethods, useBilling, type Payment, type PaymentInput } from './store'
import { useLeaseNames } from './names'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ leaseId?: string }>()
const emit = defineEmits<{ saved: [p: Payment] }>()
const store = useBilling()
const names = useLeaseNames()

const blank = (): PaymentInput => ({ lease_id: props.leaseId ?? '', amount_cents: undefined, paid_on: isoDay(new Date()), method: 'transfer', reference: '', auto_match: true })
const form = ref<PaymentInput>(blank())
const owed = ref<number | null>(null)
const amountTouched = ref(false)
const badAmount = ref(false)
const { errors, summary, busy, submit, reset } = useProblemForm()

const leases = computed(() => names.billable().map((l) => ({ value: l.id ?? '', label: names.label(l.id) })))
const methods = paymentMethods.map((m) => ({ value: m, label: t(`payments.method.${m}` as Key) }))

watch(visible, async (v) => {
  if (!v) return
  reset()
  form.value = blank()
  amountTouched.value = false
  owed.value = null
  await names.load()
  const only = leases.value.length === 1 ? leases.value[0] : undefined
  if (!form.value.lease_id && only) form.value.lease_id = only.value
})
// The amount follows what the chosen lease still owes until the owner touches
// the field: focusing it or typing in it is enough, so an arrears answer that
// lands while the owner types never replaces what they typed.
watch(
  () => form.value.lease_id,
  async (id) => {
    owed.value = null
    if (!id) return
    try {
      const a = await store.arrears(id)
      if (form.value.lease_id !== id) return
      owed.value = a.outstanding_cents ?? 0
      if (!amountTouched.value && owed.value > 0) form.value.amount_cents = owed.value
    } catch {
      owed.value = null
    }
  },
)
function touch(): void {
  amountTouched.value = true
}
function typed(v: number | null | undefined): void {
  amountTouched.value = true
  form.value.amount_cents = v ?? undefined
}

async function save(): Promise<void> {
  const local: Record<string, string> = {}
  if (badAmount.value) local.amount_cents = t('common.invalidNumber')
  let saved: Payment | undefined
  const ok = await submit(async () => {
    saved = await store.record({ ...form.value, reference: form.value.reference?.trim() || undefined })
  }, local)
  if (ok && saved) {
    visible.value = false
    emit('saved', saved)
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="t('payments.add')" class="w-[34rem]" data-test="payment-dialog">
    <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
    <div class="space-y-4">
      <FormField id="pay_lease" :help="t('help.payment.lease')" :label="t('billing.lease')" :error="errors.lease_id">
        <Select v-model="form.lease_id" input-id="pay_lease" :options="leases" option-label="label" option-value="value" :placeholder="t('payments.chooseLease')" class="w-full" />
      </FormField>
      <div class="grid gap-4 md:grid-cols-2">
        <FormField
          id="pay_amount" :help="t('help.payment.amount')" :label="t('payments.amount')" :error="errors.amount_cents"
          :hint="owed != null ? t('payments.owed', { amount: money(owed) }) : undefined"
        >
          <!-- focusin and input bubble from the field: the amount is the owner's from the first focus or key, before DecimalInput commits on blur. -->
          <div @focusin="touch" @input="touch">
            <DecimalInput id="pay_amount" :model-value="form.amount_cents" suffix="€" :invalid="!!errors.amount_cents" @update:model-value="typed" @invalid-input="(b) => (badAmount = b)" />
          </div>
        </FormField>
        <FormField id="pay_on" :help="t('help.payment.paidOn')" :label="t('payments.paidOn')" :error="errors.paid_on">
          <DayInput id="pay_on" v-model="form.paid_on" :invalid="!!errors.paid_on" />
        </FormField>
        <FormField id="pay_method" :help="t('help.payment.method')" :label="t('payments.methodLabel')" :error="errors.method">
          <Select v-model="form.method" input-id="pay_method" :options="methods" option-label="label" option-value="value" class="w-full" />
        </FormField>
        <FormField id="pay_reference" :help="t('help.payment.reference')" :label="`${t('payments.reference')} (${t('common.optional')})`" :error="errors.reference">
          <InputText id="pay_reference" v-model="form.reference" :placeholder="t('payments.referencePlaceholder')" />
        </FormField>
      </div>
      <div class="flex items-center gap-2">
        <Checkbox v-model="form.auto_match" input-id="pay_auto" binary />
        <label for="pay_auto" class="text-sm">{{ t('payments.autoMatch') }}</label>
        <HelpTip id="pay_auto" :text="t('help.payment.autoMatch')" />
      </div>
    </div>
    <div class="mt-6 flex justify-end gap-2">
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button :label="t('common.save')" :loading="busy" data-test="save-payment" @click="save" />
    </div>
  </Dialog>
</template>
