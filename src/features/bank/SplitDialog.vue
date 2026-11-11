<script setup lang="ts">
// Splits a bank credit across one or more leases (tenure-api Q-124; Q-W37):
// a third party paying, a transfer covering two leases, part allowance. The
// parts must add up to the line's amount; each becomes a payment of its
// lease applied to its oldest unpaid rent calls.
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Message from 'primevue/message'
import DecimalInput from '@/components/DecimalInput.vue'
import { useProblemForm } from '@/app/form'
import { t, type Key } from '@/i18n'
import { money } from '@/i18n/format'
import { useLeaseNames } from '@/features/billing/names'
import { matchRent, type Line } from './bank'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ line: Line | null }>()
const emit = defineEmits<{ matched: [] }>()
const names = useLeaseNames()
const rows = ref<{ leaseId: string; amountCents: number | null | undefined; method: string }[]>([])
const { summary, busy, submit, reset } = useProblemForm()
const leaseOptions = computed(() => names.billable().map((l) => ({ value: l.id ?? '', label: names.label(l.id) })))
const methodOptions = ['transfer', 'caf', 'cheque', 'other'].map((m) => ({ value: m, label: t(`payments.method.${m}` as Key) }))
const total = computed(() => rows.value.reduce((s, r) => s + (r.amountCents ?? 0), 0))
watch(visible, async (v) => {
  if (!v) return
  reset()
  rows.value = [{ leaseId: '', amountCents: props.line?.amount_cents ?? 0, method: 'transfer' }]
  await names.load()
}, { immediate: true })
async function save(): Promise<void> {
  if (!props.line) return
  const local: Record<string, string> = {}
  if (rows.value.some((r) => !r.leaseId || !r.amountCents)) local.allocations = t('bank.splitIncomplete')
  else if (total.value !== props.line.amount_cents) local.allocations = t('bank.splitTotal', { total: money(total.value), amount: money(props.line.amount_cents ?? 0) })
  const ok = await submit(async () => {
    await matchRent(props.line!, rows.value.map((r) => ({ lease_id: r.leaseId, amount_cents: r.amountCents ?? 0, method: r.method as 'transfer' })))
  }, local)
  if (ok) {
    visible.value = false
    emit('matched')
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="t('bank.split')" class="w-[40rem]" data-test="split-dialog">
    <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
    <p class="mb-3 text-sm text-slate-600">{{ t('bank.splitBody', { amount: money(line?.amount_cents ?? 0), label: line?.label ?? '' }) }}</p>
    <div v-for="(r, i) in rows" :key="i" class="mb-2 grid grid-cols-[1fr_9rem_8rem_auto] items-center gap-2" data-test="split-row">
      <Select v-model="r.leaseId" :options="leaseOptions" option-label="label" option-value="value" :placeholder="t('bank.lease')" class="w-full" data-test="split-lease" />
      <DecimalInput :id="`split_amount_${i}`" v-model="r.amountCents" suffix="€" data-test="split-amount" />
      <Select v-model="r.method" :options="methodOptions" option-label="label" option-value="value" />
      <Button icon="pi pi-times" text severity="secondary" :aria-label="t('renewal.removeReference')" :disabled="rows.length === 1" @click="rows.splice(i, 1)" />
    </div>
    <Button :label="t('bank.addPart')" icon="pi pi-plus" text size="small" data-test="split-add" @click="rows.push({ leaseId: '', amountCents: null, method: 'transfer' })" />
    <p class="mt-2 text-sm" data-test="split-total">{{ t('bank.splitTotal', { total: money(total), amount: money(line?.amount_cents ?? 0) }) }}</p>
    <div class="mt-6 flex justify-end gap-2">
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button :label="t('bank.match')" icon="pi pi-check" :loading="busy" data-test="split-save" @click="save" />
    </div>
  </Dialog>
</template>
