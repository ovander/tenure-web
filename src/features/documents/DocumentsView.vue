<script setup lang="ts">
// S13 Documents (RENT-FE-001 §3): the archive of the scope by asset, year and
// class, and a search by number; filters in the URL (?asset=…&year=…&class=…
// &number=…). Download goes through the 10-minute signed link; a year or an
// asset exports as a ZIP (step_up, built after the request, polled). Flow 5:
// a live rent call offers « Annuler et réémettre » from here too. Also the
// asset hub's Documents tab (embedded, one asset). Issued documents never
// show an edit control.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import RadioButton from 'primevue/radiobutton'
import Textarea from 'primevue/textarea'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { useToast } from 'primevue/usetoast'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FormField from '@/components/FormField.vue'
import { ApiError } from '@/api/client'
import { withStepUp } from '@/app/stepUp'
import { useSession } from '@/stores/session'
import { download } from '@/features/lease/store'
import { useAssets, assetLabel } from '@/features/portfolio/store'
import { useBilling, live, type BillingDoc } from '@/features/billing/store'
import { t, type Key } from '@/i18n'
import { useLatest } from '@/lib/async'
import { dayOf } from '@/i18n/format'
import { classes, useDocuments, waitExport, type ArchiveDoc, type ExportView } from './store'

const props = defineProps<{ assetId?: string; embedded?: boolean }>()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const s = useSession()
const store = useDocuments()
const billing = useBilling()
const assets = useAssets()

const rows = ref<ArchiveDoc[] | null>(null)
const total = ref(0)
const numberText = ref((route.query.number as string) || '')
const exporting = ref(false)
const exportBy = ref<'year' | 'asset'>('year')
const exportYear = ref<number>(new Date().getFullYear() - 1)
const exportAsset = ref('')
const exportState = ref<ExportView | null>(null)
const busy = ref(false)
const error = ref('')
const cancelling = ref<{ doc: ArchiveDoc; call: BillingDoc } | null>(null)
const reason = ref('')

function q(name: string): string {
  return (route.query[name] as string) || ''
}
function setQ(name: string, v: string | number | null | undefined): void {
  void router.replace({ query: { ...route.query, [name]: v === '' || v == null ? undefined : String(v) } })
}
const asset = computed({ get: () => props.assetId ?? q('asset'), set: (v: string) => setQ('asset', v) })
const year = computed({ get: () => (q('year') ? Number(q('year')) : null), set: (v: number | null) => setQ('year', v) })
const cls = computed({ get: () => q('class'), set: (v: string) => setQ('class', v) })
const assetOptions = computed(() => [{ value: '', label: t('charges.allAssets') }, ...Object.values(assets.byId).map((a) => ({ value: a.id ?? '', label: assetLabel(a) }))])
const classOptions = computed(() => [{ value: '', label: t('docs.allClasses') }, ...classes.map((c) => ({ value: c, label: t(`docs.class.${c}` as Key) }))])
const cancelVisible = computed({ get: () => cancelling.value !== null, set: (v: boolean) => (cancelling.value = v ? cancelling.value : null) })

// Only the answer for the filters shown is kept.
const latest = useLatest()
async function load(): Promise<void> {
  const token = latest.next()
  rows.value = null
  try {
    const p = await store.list({ asset_id: asset.value || undefined, year: year.value ?? undefined, class: cls.value || undefined, number: q('number') || undefined })
    if (!latest.isLatest(token)) return
    rows.value = p.items
    total.value = p.total
  } catch {
    if (!latest.isLatest(token)) return
    rows.value = []
    toast.add({ severity: 'error', summary: t('error.network'), life: 4000 })
  }
}
onMounted(async () => {
  await assets.list(1, 100).catch(() => undefined)
  await load()
})
watch(() => [route.query.asset, route.query.year, route.query.class, route.query.number, props.assetId], load)

function search(): void {
  setQ('number', numberText.value.trim())
}
function assetName(id: string | undefined): string {
  const a = id ? assets.byId[id] : undefined
  return a ? assetLabel(a) : ''
}
async function open(d: ArchiveDoc): Promise<void> {
  if (!d.id) return
  try {
    await download(d.id)
  } catch {
    toast.add({ severity: 'error', summary: t('error.network'), life: 4000 })
  }
}
function problem(e: unknown): string {
  return e instanceof ApiError ? [e.problem.title].filter(Boolean).join(' ') : t('error.network')
}

// Export: a year or an asset, step_up, then polled until its link is ready.
function askExport(): void {
  error.value = ''
  exportState.value = null
  exportBy.value = asset.value ? 'asset' : 'year'
  exportAsset.value = asset.value
  exportYear.value = year.value ?? new Date().getFullYear() - 1
  exporting.value = true
}
async function runExport(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const input = exportBy.value === 'asset' ? { asset_id: exportAsset.value } : { year: exportYear.value }
    const started = await withStepUp(() => store.startExport(input))
    if (!started?.id) return
    exportState.value = started
    const id = started.id
    exportState.value = await waitExport(() => store.exportState(id))
    if (exportState.value.state === 'failed') error.value = exportState.value.error || t('docs.exportFailed')
  } catch (e) {
    error.value = problem(e)
  } finally {
    busy.value = false
  }
}
function openExport(): void {
  const url = exportState.value?.link?.url
  if (url) window.open(url, '_blank', 'noopener')
}

// Flow 5 from the archive: a rent call's billing document is found by its
// period and lease, then cancelled and reissued as on S08.
async function askCancel(d: ArchiveDoc): Promise<void> {
  error.value = ''
  reason.value = ''
  try {
    const p = await billing.documents({ period: d.period, lease_id: d.lease_id })
    const call = p.items.find((x) => x.document_id === d.id && x.kind === 'rent_call')
    if (!call || !live(call)) {
      toast.add({ severity: 'warn', summary: t('docs.notCancellable'), life: 4000 })
      return
    }
    cancelling.value = { doc: d, call }
  } catch (e) {
    toast.add({ severity: 'error', summary: problem(e), life: 4000 })
  }
}
async function cancel(): Promise<void> {
  if (!cancelling.value?.call.id) return
  busy.value = true
  error.value = ''
  try {
    const r = await billing.cancel(cancelling.value.call.id, reason.value.trim())
    cancelling.value = null
    toast.add({ severity: 'success', summary: r.reissued ? t('billing.reissued', { number: r.reissued.number ?? '' }) : t('billing.cancelled'), life: 5000 })
    await load()
  } catch (e) {
    error.value = problem(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section :class="embedded ? 'space-y-3' : 'max-w-6xl space-y-5'">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <h1 v-if="!embedded" class="text-xl font-semibold">{{ t('docs.title') }}</h1>
      <div class="flex flex-wrap items-end gap-3" data-test="doc-filters">
        <FormField v-if="!embedded" id="d_asset" :label="t('charges.asset')">
          <Select v-model="asset" input-id="d_asset" :options="assetOptions" option-label="label" option-value="value" class="w-60" />
        </FormField>
        <FormField id="d_year" :label="t('docs.year')">
          <InputNumber v-model="year" input-id="d_year" :use-grouping="false" :min="1990" :max="2100" show-buttons class="w-32" />
        </FormField>
        <FormField id="d_class" :label="t('billing.kindLabel')">
          <Select v-model="cls" input-id="d_class" :options="classOptions" option-label="label" option-value="value" class="w-56" />
        </FormField>
        <FormField id="d_number" :help="t('help.docs.number')" :label="t('billing.number')">
          <span class="flex gap-1">
            <InputText id="d_number" v-model="numberText" :placeholder="t('docs.numberPlaceholder')" class="w-48" @keydown.enter="search" />
            <Button icon="pi pi-search" severity="secondary" :aria-label="t('docs.search')" data-test="search-number" @click="search" />
          </span>
        </FormField>
      </div>
      <Button :label="t('docs.export')" icon="pi pi-file-export" severity="secondary" data-test="export" @click="askExport" />
    </div>

    <Skeleton v-if="rows === null" height="6rem" />
    <div v-else-if="rows.length === 0" class="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm" data-test="docs-empty">{{ t('docs.empty') }}</div>
    <DataTable v-else :value="rows" data-key="id" size="small" data-test="archive">
      <Column :header="t('doc.issued')"><template #body="{ data }">{{ dayOf(data.issued_at) }}</template></Column>
      <Column :header="t('billing.kindLabel')"><template #body="{ data }"><span data-test="doc-class">{{ t(`docs.class.${data.class}` as Key) }}</span></template></Column>
      <Column :header="t('docs.period')"><template #body="{ data }">{{ data.period }}</template></Column>
      <Column v-if="!embedded" :header="t('charges.asset')"><template #body="{ data }">{{ assetName(data.asset_id) }}</template></Column>
      <Column :header="t('docs.name')">
        <template #body="{ data }">
          <span v-if="data.number" class="mr-2 font-mono" data-test="doc-number">{{ data.number }}</span>
          <span data-test="doc-name">{{ data.original_name || t('docs.generated', { version: data.template_version ?? '' }) }}</span>
          <span :title="`${t('doc.hash')} : ${data.sha256}`" class="ml-2 cursor-help text-xs text-slate-400 underline decoration-dotted">SHA-256</span>
        </template>
      </Column>
      <Column>
        <template #body="{ data }">
          <div class="flex justify-end gap-2">
            <Button icon="pi pi-download" size="small" text :aria-label="t('doc.download')" :title="t('doc.download')" data-test="archive-download" @click="open(data)" />
            <Button v-if="s.canWrite && data.class === 'rent_call'" :label="t('billing.cancelReissue')" size="small" severity="secondary" data-test="archive-cancel" @click="askCancel(data)" />
          </div>
        </template>
      </Column>
    </DataTable>
    <p v-if="rows && total > rows.length" class="text-xs text-slate-500">{{ t('docs.more', { shown: rows.length, total }) }}</p>

    <ConfirmDialog
      v-model:visible="exporting" :title="t('docs.export')" :body="t('docs.exportBody')" :confirm="t('docs.exportRun')" :busy="busy"
      :disabled="(exportBy === 'asset' && !exportAsset) || exportState?.state === 'ready'" @confirm="runExport"
    >
      <div class="space-y-3" data-test="export-form">
        <div class="flex items-center gap-2">
          <RadioButton v-model="exportBy" input-id="ex_year" value="year" />
          <label for="ex_year" class="text-sm">{{ t('docs.exportYear') }}</label>
          <InputNumber v-model="exportYear" input-id="ex_year_value" :use-grouping="false" :min="1990" :max="2100" :disabled="exportBy !== 'year'" class="w-28" />
        </div>
        <div class="flex items-center gap-2">
          <RadioButton v-model="exportBy" input-id="ex_asset" value="asset" />
          <label for="ex_asset" class="text-sm">{{ t('docs.exportAsset') }}</label>
          <Select v-model="exportAsset" input-id="ex_asset_value" :options="assetOptions.slice(1)" option-label="label" option-value="value" :disabled="exportBy !== 'asset'" class="w-56" />
        </div>
        <Message v-if="exportState?.state === 'pending'" severity="info" :closable="false" data-test="export-pending">{{ t('docs.exportPending') }}</Message>
        <div v-else-if="exportState?.state === 'ready'" class="space-y-2" data-test="export-ready">
          <Message severity="success" :closable="false">{{ t('docs.exportReady', { n: exportState.documents ?? 0 }) }}</Message>
          <Button :label="t('docs.exportDownload')" icon="pi pi-download" data-test="export-download" @click="openExport" />
        </div>
        <Message v-if="error" severity="error" :closable="false" data-test="export-error">{{ error }}</Message>
      </div>
    </ConfirmDialog>

    <ConfirmDialog
      v-model:visible="cancelVisible" :title="t('billing.cancelReissue')" :body="t('billing.cancelBody', { number: cancelling?.call.number ?? '' })"
      :confirm="t('billing.cancelReissue')" :busy="busy" :disabled="!reason.trim()" @confirm="cancel"
    >
      <FormField id="archive_reason" :help="t('help.billing.reason')" :label="t('billing.reason')">
        <Textarea id="archive_reason" v-model="reason" rows="3" class="w-full" :placeholder="t('billing.reasonPlaceholder')" />
      </FormField>
      <Message v-if="error" severity="error" :closable="false" class="mt-3" data-test="archive-cancel-error">{{ error }}</Message>
    </ConfirmDialog>
  </section>
</template>
