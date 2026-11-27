<script setup lang="ts">
// S15b Inventory capture (RENT-INV-001 §5, §8; tenure-api Q-111; Q-W26), the
// tablet-first screen of phase 2. Left: the rooms with how many items are
// assessed, then the meters, the keys and the general observations. Right:
// one card per item, saved as soon as it changes (condition, works) or is
// left (quantity, comment); a failed save stays « not saved » to retry.
// Photos are resized on the device and sent in the background; a preview
// shows at once (blob:), then the archived photo through its signed link.
// The owner moves the inventory along: schedule, start, complete (the
// blocking checks listed), reopen. The co-owner reads; an accountant has no
// access (the API refuses).
import { computed, onBeforeUnmount, onMounted, reactive, ref, watchEffect } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import DayInput from '@/components/DayInput.vue'
import FormField from '@/components/FormField.vue'
import HelpTip from '@/components/HelpTip.vue'
import { ApiError } from '@/api/client'
import { useProblemForm } from '@/app/form'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'
import { date } from '@/i18n/format'
import { categories, type Category } from './layout'
import {
  PhotoQueue, addItem, blocking, conditions, fresher, getCapture, hasWorks, headerEditable, itemsEditable, keyKinds, meterKinds,
  photoLink, progress, resize, saveHeader, saveItem, saveKeys, saveMeters, serialByKey, transition, uploadPhoto, worksValues,
  type Action, type Capture, type Item, type KeyLine, type MeterInput,
} from './capture'

const route = useRoute()
const toast = useToast()
const s = useSession()
const id = computed(() => route.params.id as string)
const inv = ref<Capture | null>(null)
const denied = ref(false)
const section = ref<string>('room:0')

// The meters, keys and header forms as a capture fills them.
function formsOf(c: Capture) {
  return {
    meters: (c.meters ?? []).map((m): MeterInput => ({ id: m.id, kind: m.kind, meter_number: m.meter_number ?? '', reading: m.reading ?? '', unit: m.unit ?? '' })),
    keys: (c.keys ?? []).map((k): KeyLine => ({ ...k })),
    header: {
      done_on: c.done_on ?? null, scheduled_at: localDateTime(c.scheduled_at), place: c.place ?? '', observations: c.observations ?? '',
      keys_returned_on: c.keys_returned_on ?? null, tenant_new_address: c.tenant_new_address ?? '',
    },
  }
}
// What the server last gave for each form, to tell the owner's edits apart.
let loaded = { meters: '', keys: '', header: '' }
function remember(c: Capture): void {
  const f = formsOf(c)
  loaded = { meters: JSON.stringify(f.meters), keys: JSON.stringify(f.keys), header: JSON.stringify(f.header) }
}
// reload reads the capture again. With keepEdits (a 412 on one item: only its
// items and versions need refreshing), the meters, keys and header the owner
// changed and has not saved yet are kept instead of reset; it says whether
// any was kept.
async function reload(keepEdits = false): Promise<boolean> {
  const fresh = await getCapture(id.value)
  const f = formsOf(fresh)
  const keepMeters = keepEdits && JSON.stringify(meters.value) !== loaded.meters
  const keepKeys = keepEdits && JSON.stringify(keys.value) !== loaded.keys
  const keepHeader = keepEdits && JSON.stringify({ ...header }) !== loaded.header
  inv.value = fresh
  if (!keepMeters) meters.value = f.meters
  if (!keepKeys) keys.value = f.keys
  if (!keepHeader) Object.assign(header, f.header)
  remember(fresh)
  return keepMeters || keepKeys || keepHeader
}
const { errors, summary, busy, submit } = useProblemForm(async () => {
  await reload()
})

onMounted(async () => {
  try {
    await reload()
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) denied.value = true
    else summary.value = t('error.network')
  }
})

const canEditItems = computed(() => s.canWrite && !!inv.value && itemsEditable(inv.value.state))
const canEditHeader = computed(() => s.canWrite && !!inv.value && headerEditable(inv.value.state))
const rooms = computed(() => inv.value?.rooms ?? [])
const current = computed(() => {
  const m = /^room:(\d+)$/.exec(section.value)
  return m ? rooms.value[Number(m[1])] : undefined
})
const totals = computed(() => rooms.value.reduce((a, r) => {
  const p = progress(r)
  return { done: a.done + p.done, total: a.total + p.total }
}, { done: 0, total: 0 }))
const completeChecks = computed(() => (inv.value ? blocking(inv.value, 'complete') : []))
const conditionOptions = conditions.map((c) => ({ value: c, label: t(`inventory.condition.${c}` as Key) }))
const worksOptions = worksValues.map((w) => ({ value: w, label: t(`inventory.works.${w === 'n/a' ? 'na' : w}` as Key) }))
const meterOptions = meterKinds.map((k) => ({ value: k, label: t(`inventory.meter.${k}` as Key) }))
const keyOptions = keyKinds.map((k) => ({ value: k, label: t(`inventory.key.${k}` as Key) }))
const categoryOptions = categories.map((c) => ({ value: c, label: t(`element.category.${c}` as Key) }))

// Items: each card edits a draft of its item and saves it on its own.
interface Draft { condition: Item['condition'] | null; works: Item['works'] | null; quantity: number; comment: string }
const drafts = reactive<Record<string, Draft>>({})
const unsaved = reactive<Record<string, string>>({})
// stale: items whose edit gave way to the server's version after a 412. Only
// the owner clears it, by acting on the card again; a retry never does, so a
// transition cannot go ahead over an edit the owner has not seen dropped.
const stale = reactive<Record<string, boolean>>({})
const saving = reactive<Record<string, boolean>>({})
function draft(it: Item): Draft {
  const k = it.id ?? ''
  drafts[k] ??= { condition: it.condition ?? null, works: it.works ?? null, quantity: it.quantity ?? 0, comment: it.comment ?? '' }
  return drafts[k]
}
function itemAt(itemId: string): Item | undefined {
  for (const r of rooms.value) for (const it of r.items ?? []) if (it.id === itemId) return it
  return undefined
}
const save = serialByKey(saveOnce)
async function saveOnce(itemId: string): Promise<void> {
  const it = itemAt(itemId)
  const d = drafts[itemId]
  if (stale[itemId]) return
  if (it && !d) {
    // Its edit gave way to the server's version after a 412: the card shows
    // what the server holds, nothing of it is left to save.
    delete unsaved[itemId]
    return
  }
  if (!it || !d || !inv.value) return
  saving[itemId] = true
  try {
    const saved = await saveItem(inv.value.id ?? '', it, { condition: d.condition ?? undefined, works: d.works ?? undefined, quantity: d.quantity ?? 0, comment: d.comment })
    // A reload meanwhile (a 412 on another item) replaced the item: update the
    // one on screen, unless it was read after this save.
    const target = itemAt(itemId) ?? it
    if ((saved.version ?? 0) >= (target.version ?? 0)) Object.assign(target, saved)
    delete unsaved[itemId]
    scheduleChecks()
  } catch (e) {
    if (e instanceof ApiError && e.status === 412) {
      stale[itemId] = true
      unsaved[itemId] = t('error.stale')
      // What the card held when the conflict came back: an edit made while
      // the reload runs (edit() queues its own save) is kept, not dropped.
      const before = JSON.stringify(drafts[itemId])
      try {
        if (await reload(true)) toast.add({ severity: 'warn', summary: t('inventory.editsKept'), life: 6000 })
      } catch {
        // the item stays « not saved »; the next save shows the network state
      }
      // Dropped once the server's version is on screen: the card then builds
      // its draft from that version, not from the item this save started on.
      if (JSON.stringify(drafts[itemId]) === before) delete drafts[itemId]
    } else {
      unsaved[itemId] = e instanceof ApiError ? ([e.problem.title, ...(e.problem.errors ?? []).map((x) => x.message)].filter(Boolean).join(' ') || t('error.title')) : t('inventory.notSaved')
    }
  } finally {
    saving[itemId] = false
  }
}
const unsavedCount = computed(() => Object.keys(unsaved).length)
async function retryAll(): Promise<void> {
  for (const k of Object.keys(unsaved)) if (!stale[k]) await save(k)
}
// edit saves a card after the owner acted on it, which also acknowledges a
// stale mark: the card then shows, and saves, what the server holds plus
// the owner's new choice.
function edit(itemId: string): Promise<void> {
  delete stale[itemId]
  return save(itemId)
}

// Photos: resized, queued, previewed from blob:, then shown from the archive.
const links = reactive<Record<string, string>>({})
const tick = ref(0)
const queue = new PhotoQueue(
  (target, file) => uploadPhoto(id.value, target, file),
  (photo, q) => {
    if (photo.id) links[photo.id] = q.preview
    const it = photo.item_id ? itemAt(photo.item_id) : undefined
    if (it && photo.id) it.photos = [...(it.photos ?? []), photo.id]
    const m = photo.meter_id ? inv.value?.meters?.find((x) => x.id === photo.meter_id) : undefined
    if (m && photo.id) m.photos = [...(m.photos ?? []), photo.id]
    void refreshChecks()
  },
  (_q, e) => (e instanceof ApiError ? e.problem.title ?? t('error.title') : t('inventory.notSaved')),
  () => tick.value++,
)
const queued = computed(() => (tick.value, [...queue.items]))
function queuedFor(target: { item_id?: string; meter_id?: string }) {
  return queued.value.filter((q) => (target.item_id && q.target.item_id === target.item_id) || (target.meter_id && q.target.meter_id === target.meter_id))
}
async function takePhoto(target: { item_id?: string; meter_id?: string }, ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  for (const f of files) {
    let small: File
    try {
      small = await resize(f)
    } catch {
      toast.add({ severity: 'error', summary: t('inventory.photoUnreadable'), life: 5000 })
      continue
    }
    queue.add(target, small, URL.createObjectURL(small))
  }
}
async function thumb(photo: string): Promise<void> {
  if (links[photo] || !inv.value?.id) return
  links[photo] = 'loading'
  try {
    links[photo] = (await photoLink(inv.value.id, photo)).url
  } catch {
    delete links[photo]
  }
}
function src(photo: string): string | undefined {
  const l = links[photo]
  return l && l !== 'loading' ? l : undefined
}
// Every archived photo of the inventory gets its signed link once.
watchEffect(() => {
  for (const r of inv.value?.rooms ?? []) for (const it of r.items ?? []) for (const p of it.photos ?? []) void thumb(p)
})
onBeforeUnmount(() => {
  clearTimeout(checksTimer)
  for (const l of Object.values(links)) if (l.startsWith('blob:')) URL.revokeObjectURL(l)
  for (const q of queue.items) URL.revokeObjectURL(q.preview)
})

// The checks follow the photos and items: read them again from the server,
// once a burst of saves has settled.
let checksTimer: ReturnType<typeof setTimeout> | undefined
function scheduleChecks(): void {
  clearTimeout(checksTimer)
  checksTimer = setTimeout(() => void refreshChecks(), 300)
}
async function refreshChecks(): Promise<void> {
  if (!inv.value?.id) return
  try {
    const fresh = await getCapture(inv.value.id)
    if (inv.value && fresher(inv.value, fresh)) {
      inv.value.checks = fresh.checks
      inv.value.version = fresh.version
    }
  } catch {
    // the next save shows the network state
  }
}

// An item found on site, in the current room.
const extra = reactive({ label: '', category: 'other' as Category, quantity: 0 })
async function addFound(): Promise<void> {
  const r = current.value
  if (!r || !inv.value?.id) return
  const ok = await submit(async () => {
    await addItem(inv.value?.id ?? '', { room_id: r.room_id, room_label: r.label, category: extra.category, label: extra.label.trim(), quantity: extra.quantity })
    await reload()
  })
  if (ok) {
    extra.label = ''
    extra.quantity = 0
  }
}

// Meters, keys and the header are saved as a whole, with If-Match.
const meters = ref<MeterInput[]>([])
const keys = ref<KeyLine[]>([])
const header = reactive({ done_on: null as string | null, scheduled_at: '', place: '', observations: '', keys_returned_on: null as string | null, tenant_new_address: '' })
const isExit = computed(() => inv.value?.kind === 'exit')
// entryLabel is an exit item's state at entry, in words.
function entryLabel(it: Item): string {
  const e = it.entry
  if (!e) return ''
  return [e.condition ? t(`inventory.condition.${e.condition}` as Key) : t('inventory.notAssessed'),
    e.works ? t(`inventory.works.${e.works === 'n/a' ? 'na' : e.works}` as Key) : '', e.comment ?? ''].filter(Boolean).join(' · ')
}
function localDateTime(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
function isoOf(local: string): string | undefined {
  return local ? new Date(local).toISOString() : undefined
}
async function saveMeterList(): Promise<void> {
  const ok = await submit(async () => {
    inv.value = await saveMeters(id.value, inv.value?.version ?? 0, meters.value.map((m) => ({ ...m, reading: (m.reading ?? '').trim() })))
    remember(inv.value)
  })
  if (ok) toast.add({ severity: 'success', summary: t('common.saved'), life: 3000 })
}
async function saveKeyList(): Promise<void> {
  const ok = await submit(async () => {
    inv.value = await saveKeys(id.value, inv.value?.version ?? 0, keys.value)
    remember(inv.value)
  })
  if (ok) toast.add({ severity: 'success', summary: t('common.saved'), life: 3000 })
}
async function saveHead(): Promise<void> {
  const ok = await submit(async () => {
    inv.value = await saveHeader(id.value, inv.value?.version ?? 0, {
      done_on: header.done_on ?? undefined, scheduled_at: isoOf(header.scheduled_at), place: header.place, observations: header.observations,
      ...(isExit.value ? { keys_returned_on: header.keys_returned_on ?? undefined, tenant_new_address: header.tenant_new_address } : {}),
    })
    remember(inv.value)
  })
  if (ok) toast.add({ severity: 'success', summary: t('common.saved'), life: 3000 })
}

// Transitions: only once every item is saved. Wait for the saves in flight,
// retry those that failed, and refuse while one is still not saved.
async function move(action: Action): Promise<void> {
  await save.idle()
  if (unsavedCount.value) {
    await retryAll()
    await save.idle()
  }
  if (unsavedCount.value) {
    summary.value = t('inventory.unsavedBlocks', { n: unsavedCount.value })
    return
  }
  const extraBody = action === 'schedule' ? { scheduled_at: isoOf(header.scheduled_at), place: header.place } : {}
  const ok = await submit(async () => {
    inv.value = await transition(id.value, action, extraBody)
    await reload()
  })
  if (ok) toast.add({ severity: 'success', summary: t(`inventory.moved.${action}` as Key), life: 3000 })
}
function checkLabel(c: { code?: string; room?: string; item?: string; party?: string }): string {
  const where = [c.room, c.item, c.party].filter(Boolean).join(' · ')
  return t(`inventory.check.${c.code}` as Key) + (where ? ` — ${where}` : '')
}
const conditionSeverity: Record<string, string> = { new: 'success', good: 'success', fair: 'info', poor: 'warn', broken: 'danger' }
const stateSeverity: Record<string, string> = { draft: 'secondary', scheduled: 'info', in_progress: 'warn', completed: 'contrast', signed: 'contrast', issued: 'success' }
</script>

<template>
  <section class="space-y-4" data-test="capture">
    <nav class="text-sm text-slate-500" aria-label="breadcrumb">
      <RouterLink v-if="inv" :to="`/leases/${inv.lease_id}/inventories`" class="hover:underline" data-test="crumb-lease">{{ t('inventory.backToLease') }}</RouterLink>
    </nav>
    <Message v-if="denied" severity="warn" :closable="false" data-test="capture-denied">{{ t('inventory.denied') }}</Message>
    <Skeleton v-else-if="!inv" height="12rem" />
    <template v-else>
      <header class="flex flex-wrap items-center gap-3">
        <h1 class="flex items-center gap-2 text-xl font-semibold">
          {{ t('inventory.kind') }} {{ t(`inventory.kind.${inv.kind}` as Key) }}
          <HelpTip id="capture" :text="t('help.capture')" />
        </h1>
        <Tag :value="t(`inventory.state.${inv.state}` as Key)" :severity="stateSeverity[inv.state ?? 'draft']" data-test="capture-state" />
        <span v-if="inv.done_on" class="text-sm text-slate-500">{{ t('inventory.doneOn') }} {{ date(inv.done_on) }}</span>
        <RouterLink v-if="isExit" :to="`/inventories/${id}/compare`" class="text-sm text-emerald-800 underline" data-test="to-compare">{{ t('compare.open') }}</RouterLink>
        <span class="text-sm text-slate-500" data-test="capture-progress">{{ t('inventory.progress', { done: totals.done, total: totals.total }) }}</span>
      </header>

      <Message v-if="summary" severity="error" :closable="false" data-test="form-error">{{ summary }}</Message>
      <Message v-if="unsavedCount" severity="warn" :closable="false" data-test="not-saved">
        <span>{{ t('inventory.unsaved', { n: unsavedCount }) }}</span>
        <Button class="ml-3" :label="t('inventory.retry')" size="small" severity="warn" data-test="retry-saves" @click="retryAll" />
      </Message>

      <!-- The next step for the owner. -->
      <div v-if="s.canWrite" class="rounded-md border border-slate-200 bg-white p-4" data-test="next-step">
        <p v-if="inv.state === 'draft' || inv.state === 'scheduled'" class="mb-3 text-sm text-slate-600" data-test="inventory-steps">{{ t('inventory.steps') }}</p>
        <div v-if="inv.state === 'draft'" class="grid items-end gap-3 md:grid-cols-[14rem_1fr_auto]">
          <FormField id="cap_when" :label="t('inventory.scheduledAt')" :error="errors.scheduled_at">
            <InputText id="cap_when" v-model="header.scheduled_at" type="datetime-local" data-test="scheduled-at" />
          </FormField>
          <FormField id="cap_place" :label="t('inventory.place')" :error="errors.place">
            <InputText id="cap_place" v-model="header.place" data-test="place" />
          </FormField>
          <Button :label="t('inventory.action.schedule')" icon="pi pi-calendar" :loading="busy" data-test="schedule" @click="move('schedule')" />
        </div>
        <div v-else-if="inv.state === 'scheduled'" class="flex flex-wrap items-center gap-3">
          <span class="text-sm">{{ t('inventory.scheduledFor', { when: new Date(inv.scheduled_at ?? '').toLocaleString(), place: inv.place ?? '' }) }}</span>
          <Button :label="t('inventory.action.start')" icon="pi pi-play" :loading="busy" data-test="start" @click="move('start')" />
        </div>
        <div v-else-if="inv.state === 'in_progress'" class="space-y-2">
          <ul v-if="completeChecks.length" class="list-disc space-y-1 pl-5 text-sm text-amber-800" data-test="blocking">
            <li v-for="(c, i) in completeChecks.slice(0, 8)" :key="i">{{ checkLabel(c) }}</li>
            <li v-if="completeChecks.length > 8">{{ t('inventory.moreChecks', { n: completeChecks.length - 8 }) }}</li>
          </ul>
          <Button :label="t('inventory.action.complete')" icon="pi pi-check" :disabled="completeChecks.length > 0 || queue.pending > 0" :loading="busy" data-test="complete" @click="move('complete')" />
        </div>
        <div v-else-if="inv.state === 'completed'" class="flex flex-wrap items-center gap-3">
          <span class="text-sm text-slate-600">{{ t('inventory.completedNext') }}</span>
          <RouterLink :to="`/inventories/${id}/review`" data-test="to-review"><Button :label="t('inventory.signAction')" icon="pi pi-pen-to-square" /></RouterLink>
          <Button :label="t('inventory.action.reopen')" icon="pi pi-replay" severity="secondary" :loading="busy" data-test="reopen" @click="move('reopen')" />
        </div>
        <div v-else-if="inv.state === 'signed'">
          <Button :label="t('inventory.action.issue')" icon="pi pi-file-check" :loading="busy" data-test="issue" @click="move('issue')" />
        </div>
        <p v-else class="text-sm text-slate-600" data-test="issued">{{ t('inventory.issuedNote') }}</p>
      </div>

      <div class="grid gap-4 md:grid-cols-[15rem_1fr]">
        <!-- Rooms, then meters, keys, observations. -->
        <nav class="space-y-1 self-start md:sticky md:top-0" :aria-label="t('inventory.sections')" data-test="sections">
          <button
            v-for="(r, i) in rooms" :key="i" type="button" class="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm"
            :class="section === `room:${i}` ? 'bg-emerald-50 font-medium text-emerald-900' : 'hover:bg-slate-100'" data-test="section-room" @click="section = `room:${i}`"
          >
            <span>{{ r.label }}</span>
            <span class="text-xs" :class="progress(r).done === progress(r).total ? 'text-emerald-700' : 'text-slate-500'">{{ progress(r).done }}/{{ progress(r).total }}</span>
          </button>
          <button
            v-for="x in ['meters', 'keys', 'observations']" :key="x" type="button" class="w-full rounded-md px-3 py-2 text-left text-sm"
            :class="section === x ? 'bg-emerald-50 font-medium text-emerald-900' : 'hover:bg-slate-100'" :data-test="`section-${x}`" @click="section = x"
          >
            {{ t(`inventory.section.${x}` as Key) }}
          </button>
        </nav>

        <div class="min-w-0 space-y-3">
          <!-- One card per item of the room. -->
          <template v-if="current">
            <h2 class="text-lg font-medium" data-test="room-title">{{ current.label }}</h2>
            <article v-for="it in current.items" :key="it.id" class="space-y-3 rounded-md border border-slate-200 bg-white p-4" data-test="item">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <h3 class="font-medium" data-test="item-label">{{ it.label }} <span class="text-sm font-normal text-slate-500">· {{ t(`element.category.${it.category}` as Key) }}</span></h3>
                <Tag v-if="it.condition" :value="t(`inventory.condition.${it.condition}` as Key)" :severity="conditionSeverity[it.condition]" data-test="item-condition" />
                <span v-if="saving[it.id ?? '']" class="text-xs text-slate-500">{{ t('inventory.saving') }}</span>
                <span v-else-if="unsaved[it.id ?? '']" class="text-xs text-amber-700" data-test="item-unsaved">{{ unsaved[it.id ?? ''] }}</span>
                <span v-else-if="it.to_check" class="text-xs text-sky-700" data-test="to-check">{{ t('inventory.toCheck') }}</span>
              </div>
              <p v-if="it.entry" class="flex flex-wrap items-center gap-2 text-sm text-slate-500" data-test="item-entry-row">
                <span data-test="item-entry">{{ t('inventory.atEntry') }} : {{ entryLabel(it) }}</span>
                <Button v-if="it.to_check && canEditItems" :label="t('inventory.sameAsEntry')" icon="pi pi-check" size="small" text data-test="same-as-entry" @click="edit(it.id ?? '')" />
              </p>
              <template v-if="canEditItems">
                <SelectButton
                  v-model="draft(it).condition" :options="conditionOptions" option-label="label" option-value="value" :allow-empty="true"
                  :aria-label="t('inventory.condition')" class="flex-wrap" data-test="condition" @change="edit(it.id ?? '')"
                />
                <div class="flex flex-wrap items-end gap-3">
                  <div v-if="hasWorks(it.category)">
                    <span class="mb-1 block text-sm text-slate-600">{{ t('inventory.works') }}</span>
                    <SelectButton v-model="draft(it).works" :options="worksOptions" option-label="label" option-value="value" :allow-empty="true" data-test="works" @change="edit(it.id ?? '')" />
                  </div>
                  <FormField :id="`qty_${it.id}`" :label="t('inventory.quantity')">
                    <InputNumber v-model="draft(it).quantity" :input-id="`qty_${it.id}`" :min="0" input-class="w-20" @blur="edit(it.id ?? '')" />
                  </FormField>
                  <label class="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50" data-test="camera">
                    <i class="pi pi-camera" aria-hidden="true" />{{ t('inventory.photo') }}
                    <input type="file" accept="image/*" capture="environment" multiple class="sr-only" data-test="camera-input" @change="takePhoto({ item_id: it.id }, $event)">
                  </label>
                </div>
                <Textarea v-model="draft(it).comment" :aria-label="t('inventory.comment')" :placeholder="t('inventory.comment')" auto-resize rows="1" class="w-full" data-test="comment" @blur="edit(it.id ?? '')" />
              </template>
              <p v-else class="text-sm" data-test="item-read">
                {{ it.condition ? t(`inventory.condition.${it.condition}` as Key) : t('inventory.notAssessed') }}
                <template v-if="it.works"> · {{ t(`inventory.works.${it.works === 'n/a' ? 'na' : it.works}` as Key) }}</template>
                <template v-if="it.comment"> · {{ it.comment }}</template>
              </p>
              <div v-if="(it.photos ?? []).length || queuedFor({ item_id: it.id }).length" class="flex flex-wrap gap-2" data-test="photos">
                <img v-for="p in it.photos" :key="p" :src="src(p)" :alt="t('inventory.photoOf', { label: it.label ?? '' })" class="h-20 w-20 rounded object-cover" data-test="photo">
                <figure v-for="q in queuedFor({ item_id: it.id })" :key="q.key" class="relative">
                  <img :src="q.preview" alt="" class="h-20 w-20 rounded object-cover opacity-60" data-test="photo-queued">
                  <figcaption class="text-xs" :class="q.state === 'failed' ? 'text-red-700' : 'text-slate-500'">
                    {{ q.state === 'failed' ? q.error : t('inventory.sending') }}
                    <button v-if="q.state === 'failed'" type="button" class="underline" @click="queue.retry(q.key)">{{ t('inventory.retry') }}</button>
                  </figcaption>
                </figure>
              </div>
            </article>
            <div v-if="canEditItems" class="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-slate-300 p-3" data-test="add-found">
              <FormField id="found_label" :label="t('inventory.found')" :error="errors.label" class="min-w-0 flex-1">
                <InputText id="found_label" v-model="extra.label" data-test="found-label" />
              </FormField>
              <Select v-model="extra.category" :options="categoryOptions" option-label="label" option-value="value" :aria-label="t('layout.category')" class="w-44" />
              <Button :label="t('inventory.addFound')" icon="pi pi-plus" severity="secondary" :disabled="!extra.label.trim()" :loading="busy" data-test="add-found-item" @click="addFound" />
            </div>
          </template>

          <!-- Meters. -->
          <div v-else-if="section === 'meters'" class="space-y-3 rounded-md border border-slate-200 bg-white p-4" data-test="meters">
            <h2 class="text-lg font-medium">{{ t('inventory.section.meters') }}</h2>
            <div v-for="(m, i) in meters" :key="m.id ?? `new${i}`" class="grid items-end gap-2 md:grid-cols-[13rem_1fr_1fr_6rem_auto]" data-test="meter">
              <Select v-model="m.kind" :options="meterOptions" option-label="label" option-value="value" :aria-label="t('inventory.meterKind')" :disabled="!canEditHeader" />
              <InputText v-model="m.meter_number" :placeholder="t('inventory.meterNumber')" :aria-label="t('inventory.meterNumber')" :disabled="!canEditHeader" />
              <div>
                <InputText v-model="m.reading" :placeholder="t('inventory.reading')" :aria-label="t('inventory.reading')" inputmode="decimal" :invalid="!!errors[`meters[${i}].reading`]" :disabled="!canEditHeader" data-test="reading" />
                <small v-if="errors[`meters[${i}].reading`]" class="text-red-700">{{ errors[`meters[${i}].reading`] }}</small>
              </div>
              <InputText v-model="m.unit" :placeholder="t('inventory.unit')" :aria-label="t('inventory.unit')" :disabled="!canEditHeader" />
              <div class="flex items-center gap-1">
                <label v-if="m.id && canEditItems" class="cursor-pointer rounded-md px-2 py-2 hover:bg-slate-100" :aria-label="t('inventory.photo')">
                  <i class="pi pi-camera" aria-hidden="true" />
                  <input type="file" accept="image/*" capture="environment" class="sr-only" @change="takePhoto({ meter_id: m.id }, $event)">
                </label>
                <Button v-if="canEditHeader" icon="pi pi-times" text severity="danger" :aria-label="t('inventory.remove')" @click="meters.splice(i, 1)" />
              </div>
            </div>
            <div v-if="canEditHeader" class="flex gap-2">
              <Button :label="t('inventory.addMeter')" icon="pi pi-plus" text data-test="add-meter" @click="meters.push({ kind: 'elec_base', meter_number: '', reading: '', unit: '' })" />
              <Button :label="t('common.save')" icon="pi pi-check" :loading="busy" data-test="save-meters" @click="saveMeterList" />
            </div>
          </div>

          <!-- Keys. -->
          <div v-else-if="section === 'keys'" class="space-y-3 rounded-md border border-slate-200 bg-white p-4" data-test="keys">
            <h2 class="text-lg font-medium">{{ t('inventory.section.keys') }}</h2>
            <div v-for="(k, i) in keys" :key="i" class="grid items-end gap-2 md:grid-cols-[10rem_1fr_6rem_1fr_auto]" data-test="key">
              <Select v-model="k.kind" :options="keyOptions" option-label="label" option-value="value" :aria-label="t('inventory.keyKind')" :disabled="!canEditHeader" />
              <InputText v-model="k.destination" :placeholder="t('inventory.keyOpens')" :aria-label="t('inventory.keyOpens')" :invalid="!!errors[`keys[${i}].destination`]" :disabled="!canEditHeader" data-test="key-opens" />
              <InputNumber v-model="k.quantity" :min="0" :aria-label="t('inventory.quantity')" input-class="w-20" :disabled="!canEditHeader" data-test="key-qty" />
              <InputText v-model="k.comment" :placeholder="t('inventory.comment')" :aria-label="t('inventory.comment')" :disabled="!canEditHeader" />
              <Button v-if="canEditHeader" icon="pi pi-times" text severity="danger" :aria-label="t('inventory.remove')" @click="keys.splice(i, 1)" />
            </div>
            <div v-if="canEditHeader" class="flex gap-2">
              <Button :label="t('inventory.addKey')" icon="pi pi-plus" text data-test="add-key" @click="keys.push({ kind: 'key', destination: '', quantity: 1, comment: '' })" />
              <Button :label="t('common.save')" icon="pi pi-check" :loading="busy" data-test="save-keys" @click="saveKeyList" />
            </div>
          </div>

          <!-- The header: date, appointment and general observations. -->
          <div v-else class="space-y-3 rounded-md border border-slate-200 bg-white p-4" data-test="observations">
            <h2 class="text-lg font-medium">{{ t('inventory.section.observations') }}</h2>
            <div class="grid gap-3 md:grid-cols-3">
              <FormField id="head_done" :help="t('help.capture.doneOn')" :label="t('inventory.doneOn')" :error="errors.done_on">
                <DayInput id="head_done" v-model="header.done_on" :disabled="!canEditHeader" />
              </FormField>
              <FormField id="head_when" :label="t('inventory.scheduledAt')" :error="errors.scheduled_at">
                <InputText id="head_when" v-model="header.scheduled_at" type="datetime-local" :disabled="!canEditHeader" />
              </FormField>
              <FormField id="head_place" :label="t('inventory.place')" :error="errors.place">
                <InputText id="head_place" v-model="header.place" :disabled="!canEditHeader" />
              </FormField>
            </div>
            <div v-if="isExit" class="grid gap-3 md:grid-cols-[14rem_1fr]" data-test="exit-header">
              <FormField id="head_keys" :help="t('help.capture.keysReturnedOn')" :label="t('inventory.keysReturnedOn')" :error="errors.keys_returned_on">
                <DayInput id="head_keys" v-model="header.keys_returned_on" :disabled="!canEditHeader" />
              </FormField>
              <FormField id="head_address" :label="t('inventory.tenantNewAddress')" :error="errors.tenant_new_address">
                <InputText id="head_address" v-model="header.tenant_new_address" :disabled="!canEditHeader" data-test="new-address" />
              </FormField>
            </div>
            <Textarea v-model="header.observations" :aria-label="t('inventory.section.observations')" auto-resize rows="4" class="w-full" :disabled="!canEditHeader" data-test="observations-text" />
            <Button v-if="canEditHeader" :label="t('common.save')" icon="pi pi-check" :loading="busy" data-test="save-header" @click="saveHead" />
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
