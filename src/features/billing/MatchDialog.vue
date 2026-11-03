<script setup lang="ts">
// Applies a payment's unapplied part to its lease's open rent calls (S09):
// one amount per call, proposed oldest first as the automatic match would,
// and editable to split the payment otherwise; or « Automatic » to let the
// API apply it oldest first.
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Message from 'primevue/message'
import DecimalInput from '@/components/DecimalInput.vue'
import HelpTip from '@/components/HelpTip.vue'
import { ApiError } from '@/api/client'
import { t } from '@/i18n'
import { date, money } from '@/i18n/format'
import { split, useBilling, type ArrearsItem, type Payment } from './store'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ payment: Payment | null }>()
const emit = defineEmits<{ saved: [p: Payment] }>()
const store = useBilling()

const open = ref<ArrearsItem[] | null>(null)
const amounts = ref<Record<string, number | undefined>>({})
const busy = ref(false)
const error = ref('')

const left = computed(() => props.payment?.unmatched_cents ?? 0)
const applied = computed(() => Object.values(amounts.value).reduce<number>((s, v) => s + (v ?? 0), 0))
const over = computed(() => applied.value > left.value)

watch(visible, async (v) => {
  if (!v || !props.payment?.lease_id) return
  error.value = ''
  open.value = null
  try {
    const a = await store.arrears(props.payment.lease_id)
    open.value = (a.items ?? []).filter((x) => (x.outstanding_cents ?? 0) > 0)
    amounts.value = Object.fromEntries(split(left.value, open.value).map((m) => [m.billing_document_id ?? '', m.amount_cents]))
  } catch {
    open.value = []
    error.value = t('error.network')
  }
})

async function save(auto: boolean): Promise<void> {
  if (!props.payment?.id) return
  busy.value = true
  error.value = ''
  try {
    const lines = Object.entries(amounts.value).filter(([, v]) => (v ?? 0) > 0).map(([id, v]) => ({ billing_document_id: id, amount_cents: v }))
    const p = await store.match(props.payment.id, auto ? 'auto' : lines)
    visible.value = false
    emit('saved', p)
  } catch (e) {
    error.value = e instanceof ApiError ? [e.problem.title, e.problem.detail].filter(Boolean).join(' ') : t('error.network')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="t('payments.match')" class="w-[38rem]" data-test="match-dialog">
    <p class="mb-3 flex items-center gap-1 text-sm">
      {{ t('payments.toApply', { amount: money(left) }) }}
      <HelpTip id="match_help" :text="t('help.payment.match')" />
    </p>
    <p v-if="open && open.length === 0" class="text-sm" data-test="nothing-open">{{ t('payments.nothingOpen') }}</p>
    <table v-else-if="open" class="w-full text-sm" data-test="open-calls">
      <thead>
        <tr class="border-b border-slate-300 text-left text-slate-600">
          <th class="py-1 pr-2 font-medium">{{ t('billing.number') }}</th>
          <th class="py-1 pr-2 font-medium">{{ t('payments.dueOn') }}</th>
          <th class="amount py-1 pr-2 font-medium">{{ t('payments.outstanding') }}</th>
          <th class="py-1 font-medium">{{ t('payments.apply') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="it in open" :key="it.billing_document_id" class="border-b border-slate-200" data-test="open-call">
          <td class="py-2 pr-2 font-mono">{{ it.number }}</td>
          <td class="py-2 pr-2">{{ date(it.due_on) }} <span v-if="it.overdue" class="text-orange-700">· {{ t('payments.late', { days: it.days_late ?? 0 }) }}</span></td>
          <td class="amount py-2 pr-2">{{ money(it.outstanding_cents ?? 0) }}</td>
          <td class="w-44 py-2">
            <DecimalInput :id="`apply_${it.number}`" v-model="amounts[it.billing_document_id ?? '']" suffix="€" />
          </td>
        </tr>
      </tbody>
    </table>
    <Message v-if="over" severity="warn" :closable="false" class="mt-3" data-test="over">{{ t('payments.overApplied', { amount: money(applied), left: money(left) }) }}</Message>
    <Message v-if="error" severity="error" :closable="false" class="mt-3" data-test="match-error">{{ error }}</Message>
    <div class="mt-6 flex flex-wrap justify-end gap-2">
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button :label="t('payments.autoApply')" severity="secondary" :loading="busy" :disabled="!open?.length" data-test="auto-match" @click="save(true)" />
      <Button :label="t('payments.apply')" :loading="busy" :disabled="!open?.length || applied <= 0 || over" data-test="save-match" @click="save(false)" />
    </div>
  </Dialog>
</template>
