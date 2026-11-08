<script setup lang="ts">
// « Réévaluation du loyer au renouvellement » on the lease overview (Q-W35):
// the latest proposal of a new rent, its letter, where it stands, the steps
// of the increase; the owner prepares it, records its reception and the
// tenant's answer, then applies each step as it falls due.
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import FormField from '@/components/FormField.vue'
import DayInput from '@/components/DayInput.vue'
import { useProblemForm } from '@/app/form'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'
import { date, money, parisToday } from '@/i18n/format'
import { download, type Lease } from './store'
import { deliveries } from './notice'
import RenewalDialog from './RenewalDialog.vue'
import { applySteps, getRenewals, mayReevaluate, recordAnswer, recordReception, stepState, type Renewal, type RenewalLetter } from './renewal'

const props = defineProps<{ lease: Lease }>()
const emit = defineEmits<{ changed: [] }>()
const s = useSession()
const toast = useToast()
const list = ref<Renewal[]>([])
const latest = computed(() => list.value[0] ?? null)
async function load(): Promise<void> {
  list.value = props.lease.id && props.lease.kind === 'unfurnished' ? await getRenewals(props.lease.id).catch(() => []) : []
}
watch(() => [props.lease.id, props.lease.version], load, { immediate: true })
const canPropose = computed(() => s.canWrite && mayReevaluate(props.lease) && (!latest.value || latest.value.status === 'prepared' || latest.value.renewal_on! < parisToday()))
const shown = computed(() => props.lease.kind === 'unfurnished' && (!!latest.value || (s.canWrite && mayReevaluate(props.lease))))

const proposing = ref(false)
function issued(r: RenewalLetter): void {
  toast.add({ severity: 'success', summary: t('renewal.issued', { number: r.letter?.number ?? '' }), life: 6000 })
  void load()
}

// The reception and the answer, one small form each.
const step = ref<'reception' | 'answer' | null>(null)
const day = ref<string | null>(parisToday())
const delivery = ref('registered_letter')
const tracking = ref('')
const answer = ref('accepted')
const { errors, summary, busy, submit, reset } = useProblemForm()
const deliveryOptions = deliveries.map((d) => ({ value: d, label: t(`notice.delivery.${d}` as Key) }))
const answerOptions = ['accepted', 'refused'].map((a) => ({ value: a, label: t(`renewal.answer.${a}` as Key) }))
function open(kind: 'reception' | 'answer'): void {
  reset()
  day.value = parisToday()
  tracking.value = ''
  step.value = kind
}
async function record(): Promise<void> {
  const r = latest.value
  if (!r) return
  const local: Record<string, string> = {}
  if (!day.value) local[step.value === 'reception' ? 'received_on' : 'answered_on'] = t('renewal.dateRequired')
  const ok = await submit(async () => {
    if (step.value === 'reception') await recordReception(props.lease.id ?? '', r, { received_on: day.value ?? '', delivery: delivery.value, tracking_ref: tracking.value.trim() || undefined })
    else await recordAnswer(props.lease.id ?? '', r, { answer: answer.value, answered_on: day.value ?? '' })
  }, local)
  if (ok) {
    step.value = null
    toast.add({ severity: 'success', summary: t('common.saved'), life: 3000 })
    await load()
  }
}
const applying = ref(false)
async function apply(): Promise<void> {
  if (!latest.value) return
  applying.value = true
  try {
    const r = await applySteps(props.lease.id ?? '', latest.value)
    toast.add({ severity: 'success', summary: t('renewal.applied', { rent: money(r.rent_cents ?? 0) }), life: 5000 })
    emit('changed')
  } catch {
    toast.add({ severity: 'error', summary: t('error.title'), life: 5000 })
  } finally {
    applying.value = false
  }
}
const severity = (st?: string) => (st === 'accepted' ? 'success' : st === 'refused' ? 'danger' : st === 'received' ? 'info' : 'warn')
</script>

<template>
  <section v-if="shown" class="rounded-md border border-slate-200 bg-white p-5 lg:col-span-2" data-test="renewal-card">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 class="font-medium">{{ t('renewal.title') }}</h2>
      <Button v-if="canPropose" :label="latest?.status === 'prepared' ? t('renewal.replace') : t('renewal.propose')" icon="pi pi-pencil" size="small" severity="secondary" data-test="renewal-propose" @click="proposing = true" />
    </div>
    <p v-if="!latest" class="text-sm text-slate-500" data-test="renewal-none">{{ t('renewal.none') }}</p>
    <template v-else>
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span data-test="renewal-for">{{ t('renewal.for', { day: date(latest.renewal_on) }) }}</span>
        <Tag :value="t(`renewal.status.${latest.status}` as Key)" :severity="severity(latest.status)" data-test="renewal-status" />
        <Button :label="t('renewal.downloadLetter')" icon="pi pi-download" text size="small" data-test="renewal-letter" @click="download(latest.document_id ?? '')" />
      </div>
      <p class="mt-2 text-sm" data-test="renewal-rents">{{ t('renewal.rents', { current: money(latest.terms?.current_rent_cents ?? 0), proposed: money(latest.proposal?.proposed_rent_cents ?? 0) }) }}</p>
      <p v-if="latest.terms?.cap_cents" class="text-sm text-slate-600">{{ t('renewal.cap', { cap: money(latest.terms.cap_cents) }) }}</p>
      <p class="text-sm text-slate-600">
        <template v-if="latest.status === 'prepared'">{{ t('renewal.latest', { day: date(latest.terms?.latest_receipt_on) }) }}</template>
        <template v-if="latest.received_on">{{ t('renewal.receivedOn', { day: date(latest.received_on) }) }}</template>
        <template v-if="latest.answered_on"> · {{ t('renewal.answeredOn', { day: date(latest.answered_on) }) }}</template>
      </p>
      <h3 class="mb-1 mt-3 text-sm font-medium">{{ t('renewal.steps') }}</h3>
      <ol class="space-y-1 text-sm">
        <li v-for="(x, i) in latest.terms?.steps" :key="x.from" class="flex items-center gap-2" data-test="renewal-step">
          <span>{{ t('renewal.step', { day: date(x.from), rent: money(x.rent_cents ?? 0) }) }}</span>
          <Tag v-if="stepState(latest, i) === 'applied'" :value="t('renewal.stepApplied')" severity="success" />
        </li>
      </ol>
      <Message v-if="latest.status === 'refused'" severity="info" :closable="false" class="mt-3" data-test="renewal-refused">{{ t('renewal.refusedNote') }}</Message>
      <Message v-if="(latest.steps_due ?? 0) > 0" severity="warn" :closable="false" class="mt-3" data-test="renewal-due">{{ t('renewal.stepsDue', { n: latest.steps_due ?? 0 }) }}</Message>
      <div v-if="s.canWrite" class="mt-3 flex flex-wrap gap-2">
        <Button v-if="latest.status === 'prepared'" :label="t('renewal.recordReception')" size="small" data-test="renewal-reception" @click="open('reception')" />
        <Button v-if="latest.status === 'received'" :label="t('renewal.recordAnswer')" size="small" data-test="renewal-answer" @click="open('answer')" />
        <Button v-if="(latest.steps_due ?? 0) > 0" :label="t('renewal.applySteps')" icon="pi pi-check" size="small" :loading="applying" data-test="renewal-apply" @click="apply" />
      </div>
    </template>
    <RenewalDialog v-model:visible="proposing" :lease="lease" @saved="issued" />
    <Dialog :visible="step !== null" modal :header="step === 'answer' ? t('renewal.answer') : t('renewal.reception')" class="w-[30rem]" data-test="renewal-step-dialog" @update:visible="(v) => !v && (step = null)">
      <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
      <div class="space-y-4">
        <template v-if="step === 'reception'">
          <FormField id="renewal_received" :help="t('help.notice.receivedOn')" :label="t('notice.receivedOn')" :error="errors.received_on">
            <DayInput id="renewal_received" v-model="day" :invalid="!!errors.received_on" />
          </FormField>
          <FormField id="renewal_delivery" :help="t('help.notice.delivery')" :label="t('notice.deliveryLabel')" :error="errors.delivery">
            <Select v-model="delivery" input-id="renewal_delivery" :options="deliveryOptions" option-label="label" option-value="value" class="w-full" />
          </FormField>
          <FormField id="renewal_tracking" :help="t('help.notice.tracking')" :label="`${t('notice.tracking')} (${t('common.optional')})`" :error="errors.tracking_ref">
            <InputText id="renewal_tracking" v-model="tracking" class="w-full" />
          </FormField>
        </template>
        <template v-else>
          <FormField id="renewal_answer" :help="t('renewal.refusedNote')" :label="t('renewal.answerLabel')" :error="errors.answer">
            <Select v-model="answer" input-id="renewal_answer" :options="answerOptions" option-label="label" option-value="value" class="w-full" data-test="renewal-answer-select" />
          </FormField>
          <FormField id="renewal_answered" :help="t('renewal.answeredOnLabel')" :label="t('renewal.answeredOnLabel')" :error="errors.answered_on">
            <DayInput id="renewal_answered" v-model="day" :invalid="!!errors.answered_on" />
          </FormField>
        </template>
      </div>
      <div class="mt-6 flex justify-end gap-2">
        <Button :label="t('common.cancel')" severity="secondary" text @click="step = null" />
        <Button :label="t('common.save')" icon="pi pi-check" :loading="busy" data-test="renewal-step-save" @click="record" />
      </div>
    </Dialog>
  </section>
</template>
