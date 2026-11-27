<script setup lang="ts">
// S14 Settings › Parameters (RENT-FE-001 §3): every legal parameter as tenure
// holds it, each value with its effective date and its source, and the IRL
// series. Everyone reads them; an admin adds an effective-dated value (never
// edits one, never in the past), behind step-up. The app writes no value.
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { useToast } from 'primevue/usetoast'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FormField from '@/components/FormField.vue'
import DayInput from '@/components/DayInput.vue'
import { api, ApiError } from '@/api/client'
import { withStepUp } from '@/app/stepUp'
import { useSession } from '@/stores/session'
import type { IRL, ParamEntry } from '@/features/params/store'
import { t } from '@/i18n'
import { date, hundredths, isoDay } from '@/i18n/format'

const s = useSession()
const toast = useToast()
const rows = ref<ParamEntry[] | null>(null)
const irl = ref<IRL[]>([])
const filter = ref('')
const adding = ref<string | null>(null)
const form = ref({ effective_from: '' as string | null, value: '', source: '', source_url: '' })
const busy = ref(false)
const error = ref('')
const admin = computed(() => !!s.me?.admin)

async function load(): Promise<void> {
  try {
    const [p, i] = await Promise.all([api.get<ParamEntry[]>('/params'), api.get<IRL[]>('/params/irl').catch(() => ({ data: [] as IRL[] }))])
    rows.value = p.data
    irl.value = [...i.data].sort((a, b) => (b.quarter ?? '').localeCompare(a.quarter ?? ''))
  } catch {
    rows.value = []
  }
}
onMounted(load)

// The parameters by key, latest value first.
const byKey = computed(() => {
  const m = new Map<string, ParamEntry[]>()
  for (const r of rows.value ?? []) if (r.key) m.set(r.key, [...(m.get(r.key) ?? []), r])
  const f = filter.value.trim().toLowerCase()
  return [...m.entries()]
    .filter(([k]) => !f || k.toLowerCase().includes(f))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, list]) => ({ key: k, values: list.sort((a, b) => (b.effective_from ?? '').localeCompare(a.effective_from ?? '')) }))
})
function show(v: unknown): string {
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

function askAdd(key: string, last?: ParamEntry): void {
  error.value = ''
  form.value = { effective_from: isoDay(new Date()) ?? '', value: last ? JSON.stringify(last.value, null, 2) : '', source: last?.source ?? '', source_url: last?.source_url ?? '' }
  adding.value = key
}
const addVisible = computed({ get: () => adding.value !== null, set: (v: boolean) => (adding.value = v ? adding.value : null) })
async function add(): Promise<void> {
  if (!adding.value) return
  let value: unknown
  try {
    value = JSON.parse(form.value.value)
  } catch {
    error.value = t('params.badJSON')
    return
  }
  busy.value = true
  error.value = ''
  try {
    const key = adding.value
    const r = await withStepUp(() => api.put<ParamEntry>(`/params/${encodeURIComponent(key)}`, { effective_from: form.value.effective_from, value, source: form.value.source, source_url: form.value.source_url }))
    if (r) {
      adding.value = null
      toast.add({ severity: 'success', summary: t('params.added'), life: 4000 })
      await load()
    }
  } catch (e) {
    error.value = e instanceof ApiError ? ([e.problem.title, ...(e.problem.errors ?? []).map((x) => x.message)].filter(Boolean).join(' ') || t('error.title')) : t('error.network')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <p class="text-sm text-slate-600">{{ t('params.intro') }}</p>
    <FormField id="p_filter" :label="t('params.filter')">
      <InputText id="p_filter" v-model="filter" :placeholder="t('params.filterPlaceholder')" class="w-72" />
    </FormField>
    <Skeleton v-if="rows === null" height="8rem" />
    <div v-else class="space-y-3" data-test="params">
      <div v-for="p in byKey" :key="p.key" class="rounded-md border border-slate-200 bg-white p-3" data-test="param">
        <div class="flex items-center justify-between gap-3">
          <p class="font-mono text-sm font-medium" data-test="param-key">{{ p.key }}</p>
          <Button v-if="admin" :label="t('params.add')" size="small" text icon="pi pi-plus" data-test="param-add" @click="askAdd(p.key, p.values[0])" />
        </div>
        <ul class="mt-1 space-y-1 text-sm">
          <li v-for="v in p.values" :key="v.effective_from" class="flex flex-wrap gap-x-3">
            <span class="text-slate-500">{{ t('params.from', { date: date(v.effective_from) }) }}</span>
            <code class="break-all text-xs" data-test="param-value">{{ show(v.value) }}</code>
            <a v-if="v.source_url" :href="v.source_url" target="_blank" rel="noopener noreferrer" class="text-xs text-emerald-800 underline">{{ v.source || t('params.source') }}</a>
            <span v-else-if="v.source" class="text-xs text-slate-500">{{ v.source }}</span>
          </li>
        </ul>
      </div>
      <p v-if="!byKey.length" class="text-sm text-slate-500">{{ t('params.none') }}</p>
    </div>

    <section>
      <h2 class="mb-2 font-medium">{{ t('params.irl') }}</h2>
      <table class="text-sm" data-test="irl">
        <tbody>
          <tr v-for="i in irl.slice(0, 8)" :key="i.quarter" class="border-b border-slate-200">
            <td class="py-1 pr-6 font-mono">{{ i.quarter }}</td>
            <td class="amount py-1 pr-6">{{ hundredths(i.value ?? 0) }}</td>
            <td class="py-1 text-slate-500">{{ t('params.published', { date: date(i.published_on) }) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <ConfirmDialog
      v-model:visible="addVisible" :title="t('params.addTitle', { key: adding ?? '' })" :body="t('params.addBody')" :confirm="t('params.add')" :busy="busy"
      :disabled="!form.effective_from || !form.value.trim()" @confirm="add"
    >
      <div class="space-y-3">
        <FormField id="pa_from" :help="t('help.params.from')" :label="t('params.effectiveFrom')"><DayInput id="pa_from" v-model="form.effective_from" /></FormField>
        <FormField id="pa_value" :help="t('help.params.value')" :label="t('params.value')"><Textarea id="pa_value" v-model="form.value" rows="4" class="w-full font-mono text-xs" /></FormField>
        <FormField id="pa_source" :help="t('help.params.source')" :label="t('params.sourceLabel')"><InputText id="pa_source" v-model="form.source" class="w-full" /></FormField>
        <FormField id="pa_url" :label="t('params.sourceUrl')"><InputText id="pa_url" v-model="form.source_url" type="url" class="w-full" /></FormField>
      </div>
      <Message v-if="error" severity="error" :closable="false" class="mt-3" data-test="param-error">{{ error }}</Message>
    </ConfirmDialog>
  </div>
</template>
