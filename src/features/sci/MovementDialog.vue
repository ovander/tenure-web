<script setup lang="ts">
// A movement of parts (tenure-api Q-133; Q-W42): a subscription gives new
// parts within the capital; a transfer, a gift or a succession moves parts
// of an open holding to another associate on its day — the API closes the
// holding, opens the receiver's and what the giver keeps. A movement is not
// undone, and none is dated in a year whose 2072 is issued.
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import DayInput from '@/components/DayInput.vue'
import { useProblemForm } from '@/app/form'
import { t, type Key } from '@/i18n'
import { date } from '@/i18n/format'
import { openHoldings, recordMovement, type Associate, type Movement, type Reason } from './sci'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ associates: Associate[] }>()
const emit = defineEmits<{ saved: [m: Movement] }>()
const reason = ref<Reason>('subscription')
const onDate = ref<string | null>(null)
const parts = ref<number | null>(null)
const from = ref<string | null>(null)
const to = ref<string | null>(null)
const note = ref('')
const { errors, summary, busy, submit, reset } = useProblemForm(async () => {
  visible.value = false
})

const reasons = computed(() => (['subscription', 'transfer', 'gift', 'succession'] as const).map((r) => ({ value: r, label: t(`sci.reason.${r}` as Key) })))
const holdings = computed(() => openHoldings(props.associates).map((x) => ({
  value: x.holding.id, label: t('sci.holdingOption', { name: x.associate.name ?? '', parts: x.holding.parts ?? 0, from: date(x.holding.from_on) }),
})))
const receivers = computed(() => props.associates.map((a) => ({ value: a.id, label: a.name })))

watch(visible, (v) => {
  if (!v) return
  reset()
  reason.value = 'subscription'
  onDate.value = null
  parts.value = null
  from.value = null
  to.value = null
  note.value = ''
}, { immediate: true })

async function save(): Promise<void> {
  const local: Record<string, string> = {}
  if (!onDate.value) local.on_date = t('sci.dateRequired')
  if (!parts.value || parts.value <= 0) local.parts = t('sci.partsRequired')
  if (!to.value) local.to_associate_id = t('sci.toRequired')
  if (reason.value !== 'subscription' && !from.value) local.from_holding_id = t('sci.fromRequired')
  let saved: Movement | undefined
  const ok = await submit(async () => {
    saved = await recordMovement({ reason: reason.value, on_date: onDate.value ?? '', parts: parts.value ?? 0, to_associate_id: to.value ?? '',
      from_holding_id: reason.value === 'subscription' ? undefined : (from.value ?? undefined), note: note.value.trim() || undefined })
  }, local)
  if (ok && saved) {
    visible.value = false
    emit('saved', saved)
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="t('sci.movementAdd')" class="w-[34rem]" data-test="movement-dialog">
    <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField id="mv_reason" :label="t('sci.reasonLabel')" :help="t('help.sci.reason')" class="sm:col-span-2">
        <Select v-model="reason" input-id="mv_reason" :options="reasons" option-label="label" option-value="value" class="w-full" data-test="movement-reason" />
      </FormField>
      <FormField id="mv_date" :label="t('sci.onDate')" :help="t('help.sci.onDate')" :error="errors.on_date">
        <DayInput id="mv_date" v-model="onDate" :invalid="!!errors.on_date" />
      </FormField>
      <FormField id="mv_parts" :label="t('sci.parts')" :error="errors.parts">
        <InputNumber v-model="parts" input-id="mv_parts" :min="1" :use-grouping="false" class="w-full" :invalid="!!errors.parts" data-test="movement-parts" />
      </FormField>
      <FormField v-if="reason !== 'subscription'" id="mv_from" :label="t('sci.fromHolding')" :error="errors.from_holding_id" class="sm:col-span-2">
        <Select v-model="from" input-id="mv_from" :options="holdings" option-label="label" option-value="value" class="w-full" data-test="movement-from" />
      </FormField>
      <FormField id="mv_to" :label="t('sci.toAssociate')" :error="errors.to_associate_id" class="sm:col-span-2">
        <Select v-model="to" input-id="mv_to" :options="receivers" option-label="label" option-value="value" class="w-full" data-test="movement-to" />
      </FormField>
      <FormField id="mv_note" :label="t('sci.note')" :hint="t('common.optional')" class="sm:col-span-2">
        <InputText id="mv_note" v-model="note" class="w-full" />
      </FormField>
    </div>
    <template #footer>
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button :label="t('common.save')" icon="pi pi-check" :loading="busy" data-test="movement-save" @click="save" />
    </template>
  </Dialog>
</template>
