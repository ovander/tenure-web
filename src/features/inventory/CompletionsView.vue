<script setup lang="ts">
// Completions of an issued entry (RENT-INV-001 §5 step 5, slice 7; tenure-api
// Q-114; Q-W29). The windows the law opens (ten days after the entry, the
// first month of the heating season when the entry was done outside it); the
// owner records a tenant's request as received, item by item, then accepts
// or refuses each line, which issues the EC document. The issued entry is
// never edited. The co-owner reads; an accountant has no access.
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import DayInput from '@/components/DayInput.vue'
import FilePicker from '@/components/FilePicker.vue'
import FormField from '@/components/FormField.vue'
import HelpTip from '@/components/HelpTip.vue'
import { ApiError } from '@/api/client'
import { useProblemForm } from '@/app/form'
import { useSession } from '@/stores/session'
import { useLeases, download, type Lease } from '@/features/lease/store'
import { t, type Key } from '@/i18n'
import { date, parisToday } from '@/i18n/format'
import { conditions, getCapture, worksValues, type Capture, type Condition, type ItemState, type Works } from './capture'
import {
  asked, decideCompletion, eligible, getCompletions, outcome, requestCompletion,
  type Completion, type Completions, type Reason,
} from './completions'

const route = useRoute()
const toast = useToast()
const s = useSession()
const leases = useLeases()
const id = computed(() => route.params.id as string)
const inv = ref<Capture | null>(null)
const view = ref<Completions | null>(null)
const lease = ref<Lease | null>(null)
const denied = ref(false)

async function reload(): Promise<void> {
  view.value = await getCompletions(id.value)
  inv.value ??= await getCapture(id.value)
  if (!lease.value && inv.value.lease_id) lease.value = await leases.get(inv.value.lease_id)
  for (const c of view.value.completions ?? []) decided[c.id ?? ''] ??= {}
}
const { errors, summary, busy, submit } = useProblemForm(reload)

onMounted(async () => {
  try {
    await reload()
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) denied.value = true
    else summary.value = e instanceof ApiError ? e.problem.title ?? t('error.title') : t('error.network')
  }
})

const canWrite = computed(() => s.canWrite && !!view.value?.windows)
const conditionOptions = conditions.map((c) => ({ value: c, label: t(`inventory.condition.${c}` as Key) }))
const worksOptions = worksValues.map((w) => ({ value: w, label: t(`inventory.works.${w === 'n/a' ? 'na' : w}` as Key) }))
const reasonOptions = (['ten_day', 'heating'] as const).map((r) => ({ value: r, label: t(`completion.reason.${r}` as Key) }))
const decisionOptions = [{ value: true, label: t('completion.accept') }, { value: false, label: t('completion.refuse') }]

// Every entry item, labelled by its room.
const items = computed(() => (inv.value?.rooms ?? []).flatMap((r) => (r.items ?? []).map((it) => ({ ...it, room: r.label ?? '' }))))

// The request being recorded.
interface Line { entry_item_id: string; condition?: Condition; works?: Works; comment: string }
const form = reactive({ open: false, reason: 'ten_day' as Reason, requested_on: parisToday() as string | null, lines: [] as Line[] })
const file = ref<File | null>(null)
const itemOptions = computed(() => eligible(items.value, form.reason).map((it) => ({ value: it.id ?? '', label: `${it.room} · ${it.label}` })))
function startRequest(): void {
  form.open = true
  form.reason = (view.value?.open?.[0] as Reason | undefined) ?? 'ten_day'
  form.requested_on = parisToday()
  form.lines = [{ entry_item_id: '', comment: '' }]
  file.value = null
}
function addLine(): void {
  form.lines.push({ entry_item_id: '', comment: '' })
}
function removeLine(i: number): void {
  form.lines.splice(i, 1)
}
async function record(): Promise<void> {
  const local: Record<string, string> = {}
  if (!form.requested_on) local.requested_on = t('completion.dateRequired')
  if (!form.lines.length) local.lines = t('completion.lineRequired')
  form.lines.forEach((l, i) => {
    if (!l.entry_item_id) local[`lines[${i}].entry_item_id`] = t('completion.itemRequired')
    else if (!asked(l)) local[`lines[${i}].comment`] = t('completion.askRequired')
  })
  const ok = await submit(async () => {
    let letter: string | undefined
    if (file.value && lease.value) letter = (await leases.upload('inventory', lease.value, file.value)).id
    await requestCompletion(id.value, {
      reason: form.reason, requested_on: form.requested_on ?? '', request_document_id: letter,
      lines: form.lines.map((l) => ({ entry_item_id: l.entry_item_id, condition: l.condition || undefined,
        works: l.works || undefined, comment: l.comment.trim() || undefined })),
    })
    form.open = false
    await reload()
  }, local)
  if (ok) toast.add({ severity: 'success', summary: t('completion.recorded'), life: 4000 })
}

// The decision being taken, per request: entry item id → accepted.
const decided = reactive<Record<string, Record<string, boolean | undefined>>>({})
const decidedOn = reactive<Record<string, string | null>>({})
function lineIds(c: Completion): string[] {
  return (c.lines ?? []).map((l) => l.entry_item_id ?? '')
}
async function decide(c: Completion): Promise<void> {
  const d = decided[c.id ?? ''] ?? {}
  const local: Record<string, string> = {}
  if (!outcome(lineIds(c), d)) local[`decide-${c.id}`] = t('completion.decideAll')
  const ok = await submit(async () => {
    await decideCompletion(c, lineIds(c).map((l) => ({ entry_item_id: l, accepted: !!d[l] })), decidedOn[c.id ?? ''] ?? undefined)
    await reload()
  }, local)
  if (ok) toast.add({ severity: 'success', summary: t('completion.decided'), life: 4000 })
}

function stateLabel(st: ItemState | undefined): string {
  if (!st) return '—'
  const parts = [st.condition ? t(`inventory.condition.${st.condition}` as Key) : '', st.works ? t(`inventory.works.${st.works === 'n/a' ? 'na' : st.works}` as Key) : '']
  return parts.filter(Boolean).join(' · ') || '—'
}
const decisionSeverity: Record<string, string> = { pending: 'warn', accepted: 'success', refused: 'secondary', partial: 'info' }
</script>

<template>
  <section class="max-w-4xl space-y-4" data-test="completions">
    <nav class="text-sm text-slate-500" aria-label="breadcrumb">
      <RouterLink v-if="inv?.lease_id" :to="`/leases/${inv.lease_id}/inventories`" class="hover:underline" data-test="crumb-lease">{{ t('inventory.backToLease') }}</RouterLink>
    </nav>
    <Message v-if="denied" severity="warn" :closable="false" data-test="completions-denied">{{ t('inventory.denied') }}</Message>
    <Message v-else-if="summary && !view" severity="error" :closable="false" data-test="completions-error">{{ summary }}</Message>
    <Skeleton v-else-if="!view || !inv" height="12rem" />
    <template v-else>
      <header class="flex flex-wrap items-center gap-3">
        <h1 class="flex items-center gap-2 text-xl font-semibold">{{ t('completion.title') }} <HelpTip id="completions" :text="t('help.completion')" /></h1>
        <span v-if="view.done_on" class="text-sm text-slate-500">{{ t('completion.entryOf', { day: date(view.done_on) }) }}</span>
      </header>

      <div class="space-y-1 rounded-md border border-slate-200 bg-white p-4 text-sm" data-test="windows">
        <template v-if="view.windows">
          <p data-test="window-ten-day">
            {{ t('completion.tenDayUntil', { day: date(view.windows.ten_day_ends_on) }) }}
            <Tag :value="t(view.open?.includes('ten_day') ? 'completion.open' : 'completion.closed')" :severity="view.open?.includes('ten_day') ? 'success' : 'secondary'" />
          </p>
          <p v-if="view.windows.heating_starts_on" data-test="window-heating">
            {{ t('completion.heatingFromTo', { from: date(view.windows.heating_starts_on), to: date(view.windows.heating_ends_on ?? '') }) }}
            <Tag :value="t(view.open?.includes('heating') ? 'completion.open' : 'completion.closed')" :severity="view.open?.includes('heating') ? 'success' : 'secondary'" />
          </p>
          <p v-else class="text-slate-500" data-test="window-heating-none">{{ t('completion.noHeating') }}</p>
        </template>
        <p v-else class="text-slate-500" data-test="windows-none">{{ t('completion.notIssued') }}</p>
      </div>

      <Message v-if="summary" severity="error" :closable="false" data-test="form-error">{{ summary }}</Message>

      <!-- Record a request. -->
      <div v-if="canWrite" class="space-y-3 rounded-md border border-slate-200 bg-white p-4" data-test="request">
        <Button v-if="!form.open" :label="t('completion.record')" icon="pi pi-plus" data-test="start-request" @click="startRequest" />
        <template v-else>
          <h2 class="font-medium">{{ t('completion.newRequest') }}</h2>
          <div class="grid gap-3 md:grid-cols-2">
            <FormField id="cmp_reason" :label="t('completion.reason')" :help="t('help.completionReason')" :error="errors.reason">
              <Select v-model="form.reason" input-id="cmp_reason" :options="reasonOptions" option-label="label" option-value="value" data-test="reason" />
            </FormField>
            <FormField id="cmp_on" :label="t('completion.requestedOn')" :error="errors.requested_on">
              <DayInput id="cmp_on" v-model="form.requested_on" :invalid="!!errors.requested_on" />
            </FormField>
          </div>
          <FormField id="cmp_letter" :label="t('completion.letter')" :hint="t('completion.letterHint')" :error="errors.request_document_id">
            <FilePicker id="cmp_letter" v-model="file" accept="application/pdf,image/jpeg,image/png" />
          </FormField>
          <div v-for="(l, i) in form.lines" :key="i" class="space-y-2 rounded border border-slate-100 p-3" data-test="request-line">
            <div class="flex flex-wrap items-end gap-2">
              <FormField :id="`cmp_item_${i}`" :label="t('completion.item')" :error="errors[`lines[${i}].entry_item_id`]" class="min-w-64 flex-1">
                <Select v-model="l.entry_item_id" :input-id="`cmp_item_${i}`" :options="itemOptions" option-label="label" option-value="value" filter :placeholder="t('completion.pickItem')" data-test="line-item" />
              </FormField>
              <Button icon="pi pi-trash" severity="secondary" text :aria-label="t('completion.removeLine')" data-test="remove-line" @click="removeLine(i)" />
            </div>
            <SelectButton v-model="l.condition" :options="conditionOptions" option-label="label" option-value="value" :allow-empty="true" :aria-label="t('inventory.condition')" class="flex-wrap" data-test="line-condition" />
            <SelectButton v-model="l.works" :options="worksOptions" option-label="label" option-value="value" :allow-empty="true" :aria-label="t('inventory.works')" data-test="line-works" />
            <InputText v-model="l.comment" :placeholder="t('completion.commentHint')" :aria-label="t('inventory.comment')" class="w-full" data-test="line-comment" />
            <small v-if="errors[`lines[${i}].comment`]" class="block text-red-700">{{ errors[`lines[${i}].comment`] }}</small>
          </div>
          <small v-if="errors.lines" class="block text-red-700">{{ errors.lines }}</small>
          <div class="flex flex-wrap gap-2">
            <Button :label="t('completion.addLine')" icon="pi pi-plus" severity="secondary" data-test="add-line" @click="addLine" />
            <Button :label="t('completion.save')" icon="pi pi-check" :loading="busy" data-test="save-request" @click="record" />
            <Button :label="t('common.cancel')" severity="secondary" text data-test="cancel-request" @click="form.open = false" />
          </div>
        </template>
      </div>

      <!-- The requests. -->
      <p v-if="!view.completions?.length" class="text-sm text-slate-500" data-test="no-requests">{{ t('completion.none') }}</p>
      <article v-for="c in view.completions" :key="c.id" class="space-y-3 rounded-md border border-slate-200 bg-white p-4" data-test="completion">
        <header class="flex flex-wrap items-center gap-2">
          <h2 class="font-medium">{{ t(`completion.reason.${c.reason}` as Key) }} · {{ t('completion.askedOn', { day: date(c.requested_on ?? '') }) }}</h2>
          <Tag :value="t(`completion.decision.${c.decision}` as Key)" :severity="decisionSeverity[c.decision ?? 'pending']" data-test="decision" />
          <span v-if="c.decided_on" class="text-sm text-slate-500">{{ t('completion.decidedOn', { day: date(c.decided_on) }) }}</span>
          <Button v-if="c.request_document_id" :label="t('completion.openLetter')" icon="pi pi-file" size="small" text data-test="letter" @click="download(c.request_document_id)" />
          <Button v-if="c.document_id" :label="t('completion.downloadEC')" icon="pi pi-download" size="small" data-test="download-ec" @click="download(c.document_id)" />
        </header>
        <table class="w-full text-sm">
          <thead class="text-left text-slate-500">
            <tr>
              <th class="py-1 pr-2 font-normal">{{ t('completion.item') }}</th>
              <th class="py-1 pr-2 font-normal">{{ t('compare.entry') }}</th>
              <th class="py-1 pr-2 font-normal">{{ t('completion.asked') }}</th>
              <th class="py-1 font-normal">{{ t('completion.decisionCol') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in c.lines" :key="l.entry_item_id" class="border-t border-slate-100 align-top" data-test="completion-line">
              <td class="py-2 pr-2"><span class="text-slate-500">{{ l.room }} ·</span> {{ l.label }}</td>
              <td class="py-2 pr-2">{{ stateLabel(l.entry) }}<span v-if="l.entry?.comment" class="block text-xs text-slate-500">{{ l.entry.comment }}</span></td>
              <td class="py-2 pr-2">{{ stateLabel(l.requested) }}<span v-if="l.requested?.comment" class="block text-xs text-slate-500">{{ l.requested.comment }}</span></td>
              <td class="py-2">
                <Tag v-if="l.accepted !== undefined" :value="t(l.accepted ? 'completion.accepted' : 'completion.refused')" :severity="l.accepted ? 'success' : 'secondary'" data-test="line-decision" />
                <SelectButton
                  v-else-if="s.canWrite" v-model="decided[c.id ?? '']![l.entry_item_id ?? '']" :options="decisionOptions" option-label="label" option-value="value"
                  :allow-empty="false" :aria-label="t('completion.decisionCol')" data-test="line-decide"
                />
                <span v-else class="text-slate-500">{{ t('completion.decision.pending') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="c.decision === 'pending' && s.canWrite" class="flex flex-wrap items-end gap-3" data-test="decide">
          <FormField :id="`cmp_decided_${c.id}`" :label="t('completion.decidedOnLabel')" :error="errors.decided_on">
            <DayInput :id="`cmp_decided_${c.id}`" v-model="decidedOn[c.id ?? '']" />
          </FormField>
          <Button :label="t('completion.saveDecision')" icon="pi pi-check" :loading="busy" data-test="save-decision" @click="decide(c)" />
          <small v-if="errors[`decide-${c.id}`]" class="text-red-700">{{ errors[`decide-${c.id}`] }}</small>
          <p class="w-full text-xs text-slate-500">{{ t('completion.decisionHint') }}</p>
        </div>
      </article>
    </template>
  </section>
</template>
