<script setup lang="ts">
// « Recouvrement » on the lease's billing tab (RENT-SPEC-011; Q-W36): where
// the recovery of unpaid rent stands, as the API computes it: the next steps
// and their days, the letters to prepare (MD, IC), the steps recorded, the
// clause résolutoire's day, and the payment plan that suspends it.
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import FormField from '@/components/FormField.vue'
import DayInput from '@/components/DayInput.vue'
import FilePicker from '@/components/FilePicker.vue'
import { useProblemForm } from '@/app/form'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'
import { date, money, parisToday } from '@/i18n/format'
import { download, useLeases, type Lease } from '@/features/lease/store'
import PlanDialog from './PlanDialog.vue'
import {
  cancelPlan, deliveries, getRecovery, hasLetter, overdueDebt, prepareLetter, recordStep,
  type Letter, type NextStep, type Recovery,
} from './recovery'

const props = defineProps<{ lease: Lease }>()
const emit = defineEmits<{ changed: [] }>()
const s = useSession()
const leases = useLeases()
const toast = useToast()
const r = ref<Recovery | null>(null)
async function load(): Promise<void> {
  r.value = props.lease.id ? await getRecovery(props.lease.id).catch(() => null) : null
}
watch(() => [props.lease.id, props.lease.version], load, { immediate: true })
defineExpose({ load })

const shown = computed(() => !!r.value && (!!r.value.since || (r.value.steps ?? []).length > 0 || !!r.value.plan))
const suretyName = (id?: string) => r.value?.sureties?.find((x) => x.guarantee_id === id)?.name ?? ''
const stepLabel = (kind?: string, g?: string) => {
  const base = t(`recovery.step.${kind}` as Key)
  return g ? `${base} — ${suretyName(g)}` : base
}

// Letters prepared in this visit, by step and surety, waiting to be recorded.
const letters = ref<Record<string, Letter>>({})
const key = (n: Pick<NextStep, 'kind' | 'guarantee_id'>) => `${n.kind}:${n.guarantee_id ?? ''}`
const preparing = ref('')
async function letter(n: NextStep): Promise<void> {
  if (!hasLetter(n.kind)) return
  preparing.value = key(n)
  try {
    const l = await prepareLetter(props.lease.id ?? '', n.kind, n.guarantee_id)
    letters.value = { ...letters.value, [key(n)]: l }
    toast.add({ severity: 'success', summary: t('recovery.letterReady', { number: l.number ?? '' }), life: 5000 })
  } catch {
    toast.add({ severity: 'error', summary: t('error.title'), life: 5000 })
  } finally {
    preparing.value = ''
  }
}

// The step form.
const step = ref<NextStep | null>(null)
const doneOn = ref<string | null>(parisToday())
const delivery = ref<string>('registered_letter')
const tracking = ref('')
const deadline = ref<string | null>(null)
const note = ref('')
const file = ref<File | null>(null)
const { errors, summary, busy, submit, reset } = useProblemForm()
const deliveryOptions = deliveries.map((d) => ({ value: d, label: t(`recovery.delivery.${d}` as Key) }))
function open(n: NextStep): void {
  reset()
  step.value = n
  doneOn.value = parisToday()
  delivery.value = n.kind === 'commandement' || n.kind === 'surety_commandement' ? 'bailiff' : 'registered_letter'
  tracking.value = note.value = ''
  deadline.value = null
  file.value = null
}
async function save(): Promise<void> {
  const n = step.value
  if (!n) return
  const local: Record<string, string> = {}
  if (!doneOn.value) local.done_on = t('recovery.dateRequired')
  const letterDoc = letters.value[key(n)]?.document_id
  if (hasLetter(n.kind) && !letterDoc && !file.value) local.document_id = t('recovery.letterFirst')
  const ok = await submit(async () => {
    let doc = letterDoc
    if (file.value) doc = (await leases.upload('recovery', props.lease, file.value)).id
    r.value = await recordStep(props.lease.id ?? '', {
      kind: n.kind, done_on: doneOn.value ?? '', guarantee_id: n.guarantee_id, document_id: doc, delivery: delivery.value as (typeof deliveries)[number],
      tracking_ref: tracking.value.trim() || undefined, deadline_on: n.kind === 'insurance_claim' ? deadline.value ?? undefined : undefined, note: note.value.trim() || undefined,
    })
  }, local)
  if (ok) {
    step.value = null
    toast.add({ severity: 'success', summary: t('common.saved'), life: 3000 })
  }
}

const planning = ref(false)
const canPlan = computed(() => s.canWrite && overdueDebt(r.value ?? {}) > 0 && r.value?.plan?.status !== 'respected')
function planned(x: Recovery): void {
  r.value = x
  toast.add({ severity: 'success', summary: t('plan.saved'), life: 4000 })
  emit('changed')
}
async function cancel(): Promise<void> {
  if (!r.value?.plan) return
  try {
    r.value = await cancelPlan(props.lease.id ?? '', r.value.plan, parisToday())
  } catch {
    toast.add({ severity: 'error', summary: t('error.title'), life: 5000 })
  }
}
const planSeverity = (st?: string) => (st === 'respected' ? 'success' : st === 'broken' ? 'danger' : st === 'completed' ? 'info' : 'secondary')
</script>

<template>
  <section v-if="shown && r" class="space-y-3 rounded-md border border-orange-200 bg-white p-5" data-test="recovery-card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-base font-semibold">{{ t('recovery.title') }}</h2>
      <Button v-if="canPlan" :label="t('plan.propose')" icon="pi pi-calendar" size="small" severity="secondary" data-test="plan-propose" @click="planning = true" />
    </div>
    <p v-if="r.since" class="text-sm" data-test="recovery-since">{{ t('recovery.since', { day: date(r.since), amount: money(r.arrears?.overdue_cents ?? 0) }) }}</p>

    <div v-if="r.plan" class="rounded border border-slate-200 p-3 text-sm" data-test="plan-card">
      <div class="flex flex-wrap items-center gap-2">
        <span>{{ t('plan.agreed', { day: date(r.plan.agreed_on), debt: money(r.plan.debt_cents ?? 0), n: (r.plan.instalments ?? []).length }) }}</span>
        <Tag :value="t(`plan.status.${r.plan.status}` as Key)" :severity="planSeverity(r.plan.status)" data-test="plan-status" />
        <Button v-if="s.canWrite && (r.plan.status === 'respected' || r.plan.status === 'broken')" :label="t('plan.cancel')" text size="small" severity="secondary" data-test="plan-cancel" @click="cancel" />
      </div>
      <p class="mt-1 text-slate-600">{{ t('plan.paid', { paid: money(r.plan.paid_cents ?? 0), due: money(r.plan.due_cents ?? 0) }) }}<template v-if="r.plan.next_instalment"> · {{ t('plan.next', { day: date(r.plan.next_instalment.due_on), amount: money(r.plan.next_instalment.amount_cents ?? 0) }) }}</template></p>
      <p v-if="r.plan.reason" class="mt-1 text-red-700" data-test="plan-reason">{{ t(`plan.reason.${r.plan.reason}` as Key) }}</p>
    </div>
    <Message v-if="r.suspended" severity="info" :closable="false" data-test="recovery-suspended">{{ t('recovery.suspended') }}</Message>

    <div v-if="(r.next ?? []).length">
      <h3 class="mb-1 text-sm font-medium">{{ t('recovery.next') }}</h3>
      <ul class="space-y-2">
        <li v-for="n in r.next" :key="key(n)" class="flex flex-wrap items-center gap-2 text-sm" data-test="recovery-next">
          <span>{{ stepLabel(n.kind, n.guarantee_id) }}</span>
          <span class="text-slate-500">{{ t('recovery.dueOn', { day: date(n.due_on) }) }}</span>
          <Tag v-if="n.overdue" :value="t('recovery.overdue')" severity="warn" />
          <template v-if="s.canWrite">
            <Button v-if="hasLetter(n.kind) && !letters[key(n)]" :label="t('recovery.prepareLetter')" icon="pi pi-file" size="small" severity="secondary" :loading="preparing === key(n)" data-test="recovery-letter" @click="letter(n)" />
            <Button v-if="letters[key(n)]" :label="letters[key(n)]?.number" icon="pi pi-download" text size="small" data-test="recovery-letter-download" @click="download(letters[key(n)]?.document_id ?? '')" />
            <Button :label="t('recovery.record')" size="small" data-test="recovery-record" @click="open(n)" />
          </template>
        </li>
      </ul>
    </div>
    <p v-if="r.resolution_on" class="text-sm font-medium text-red-700" data-test="recovery-resolution">{{ t('recovery.resolution', { day: date(r.resolution_on) }) }}</p>

    <div v-if="(r.steps ?? []).length">
      <h3 class="mb-1 text-sm font-medium">{{ t('recovery.history') }}</h3>
      <ol class="space-y-1 text-sm">
        <li v-for="x in r.steps" :key="x.id" class="flex flex-wrap items-center gap-2" data-test="recovery-step">
          <span>{{ date(x.done_on) }}</span>
          <span>{{ stepLabel(x.kind, x.guarantee_id) }}</span>
          <span class="text-slate-500">{{ money(x.outstanding_cents ?? 0) }}</span>
          <span v-if="x.delivery" class="text-slate-500">· {{ t(`recovery.delivery.${x.delivery}` as Key) }}<template v-if="x.tracking_ref"> {{ x.tracking_ref }}</template></span>
          <span v-if="x.deadline_on" class="text-slate-500">· {{ t('recovery.deadline', { day: date(x.deadline_on) }) }}</span>
          <Button v-if="x.document_id" icon="pi pi-download" text size="small" :aria-label="t('doc.download')" @click="download(x.document_id)" />
        </li>
      </ol>
    </div>

    <PlanDialog v-model:visible="planning" :lease-id="lease.id ?? ''" :debt-cents="overdueDebt(r)" @saved="planned" />
    <Dialog :visible="step !== null" modal :header="step ? stepLabel(step.kind, step.guarantee_id) : ''" class="w-[32rem]" data-test="recovery-step-dialog" @update:visible="(v) => !v && (step = null)">
      <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
      <div class="space-y-4">
        <FormField id="recovery_done" :help="t('help.recovery.doneOn')" :label="t('recovery.doneOn')" :error="errors.done_on">
          <DayInput id="recovery_done" v-model="doneOn" :invalid="!!errors.done_on" />
        </FormField>
        <FormField id="recovery_delivery" :help="t('help.recovery.delivery')" :label="t('recovery.deliveryLabel')" :error="errors.delivery">
          <Select v-model="delivery" input-id="recovery_delivery" :options="deliveryOptions" option-label="label" option-value="value" class="w-full" />
        </FormField>
        <FormField id="recovery_tracking" :help="t('help.recovery.tracking')" :label="`${t('recovery.tracking')} (${t('common.optional')})`" :error="errors.tracking_ref">
          <InputText id="recovery_tracking" v-model="tracking" class="w-full" />
        </FormField>
        <FormField v-if="step?.kind === 'insurance_claim'" id="recovery_deadline" :help="t('help.recovery.deadline')" :label="`${t('recovery.deadlineLabel')} (${t('common.optional')})`" :error="errors.deadline_on">
          <DayInput id="recovery_deadline" v-model="deadline" />
        </FormField>
        <p v-if="step && hasLetter(step.kind) && letters[key(step)]" class="text-sm" data-test="recovery-step-letter">{{ t('recovery.onLetter', { number: letters[key(step)]?.number ?? '' }) }}</p>
        <FormField v-else id="recovery_file" :help="t('help.recovery.file')" :label="step && hasLetter(step.kind) ? t('recovery.letterFile') : `${t('recovery.deedFile')} (${t('common.optional')})`" :error="errors.document_id">
          <FilePicker id="recovery_file" v-model="file" accept="application/pdf,image/jpeg,image/png" />
        </FormField>
        <FormField id="recovery_note" :help="t('help.recovery.note')" :label="`${t('recovery.note')} (${t('common.optional')})`" :error="errors.note">
          <Textarea id="recovery_note" v-model="note" rows="2" class="w-full" />
        </FormField>
      </div>
      <div class="mt-6 flex justify-end gap-2">
        <Button :label="t('common.cancel')" severity="secondary" text @click="step = null" />
        <Button :label="t('common.save')" icon="pi pi-check" :loading="busy" data-test="recovery-step-save" @click="save" />
      </div>
    </Dialog>
  </section>
</template>
