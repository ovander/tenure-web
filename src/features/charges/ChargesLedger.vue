<script setup lang="ts">
// S10 Charges ledger (RENT-FE-001 §3): charges by asset and exercise, with
// their category, recoverable part and status; filters in the URL
// (?asset=…&year=…&status=…). Add a charge, import a syndic statement, start
// or open the reconciliation of an exercise. Also the asset hub's Charges tab
// (embedded, one asset).
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { useToast } from 'primevue/usetoast'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FormField from '@/components/FormField.vue'
import DayInput from '@/components/DayInput.vue'
import { ApiError } from '@/api/client'
import { useSession } from '@/stores/session'
import { useAssets, assetLabel } from '@/features/portfolio/store'
import { t, type Key } from '@/i18n'
import { date, money } from '@/i18n/format'
import { exercise, totals, useCharges, type Charge, type Recon } from './store'
import ChargeDialog from './ChargeDialog.vue'
import ImportDialog from './ImportDialog.vue'

const props = defineProps<{ assetId?: string; embedded?: boolean }>()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const s = useSession()
const store = useCharges()
const assets = useAssets()

const rows = ref<Charge[] | null>(null)
const recons = ref<Recon[]>([])
const editing = ref<Charge | null>(null)
const adding = ref(false)
const importing = ref(false)
const starting = ref(false)
const start = ref<string | null>(null)
const end = ref<string | null>(null)
const busy = ref(false)
const error = ref('')

const lastYear = new Date().getFullYear() - 1
const asset = computed({
  get: () => props.assetId ?? ((route.query.asset as string) || ''),
  set: (v: string) => void router.replace({ query: { ...route.query, asset: v || undefined } }),
})
const year = computed({
  get: () => Number(route.query.year) || lastYear,
  set: (v: number | null) => void router.replace({ query: { ...route.query, year: v ? String(v) : undefined } }),
})
const status = computed({
  get: () => (route.query.status as string) || '',
  set: (v: string) => void router.replace({ query: { ...route.query, status: v || undefined } }),
})
const sum = computed(() => totals(rows.value ?? []))
const assetOptions = computed(() => [{ value: '', label: t('charges.allAssets') }, ...Object.values(assets.byId).map((a) => ({ value: a.id ?? '', label: assetLabel(a) }))])
const statusOptions = [{ value: '', label: t('charges.anyStatus') }, { value: 'draft', label: t('charges.status.draft') }, { value: 'confirmed', label: t('charges.status.confirmed') }]
const recon = computed(() => (asset.value ? recons.value.find((r) => r.asset_id === asset.value && r.exercise_year === year.value && r.state !== 'cancelled') : undefined))
const editVisible = computed({ get: () => editing.value !== null, set: (v: boolean) => (editing.value = v ? editing.value : null) })

async function load(): Promise<void> {
  rows.value = null
  const q = { asset_id: asset.value || undefined, year: year.value, status: status.value || undefined }
  try {
    const [c, r] = await Promise.all([store.list(q), store.recons({ asset_id: asset.value || undefined, year: year.value })])
    rows.value = c.items
    recons.value = r.items
  } catch {
    rows.value = []
    toast.add({ severity: 'error', summary: t('error.network'), life: 4000 })
  }
}
onMounted(async () => {
  await assets.list(1, 100).catch(() => undefined)
  await load()
})
watch(() => [route.query.asset, route.query.year, route.query.status, props.assetId], load)

function saved(): void {
  toast.add({ severity: 'success', summary: t('common.saved'), life: 3000 })
  void load()
}
function imported(list: Charge[]): void {
  toast.add({ severity: 'success', summary: t('charges.imported', { n: list.length }), life: 5000 })
  void router.replace({ query: { ...route.query, status: 'draft' } })
  void load()
}
function askStart(): void {
  const e = exercise(year.value)
  start.value = e.start
  end.value = e.end
  error.value = ''
  starting.value = true
}
async function startRecon(): Promise<void> {
  if (!asset.value || !start.value || !end.value) return
  busy.value = true
  error.value = ''
  try {
    const r = await store.startRecon(asset.value, start.value, end.value)
    starting.value = false
    await router.push(`/reconciliations/${r.id}`)
  } catch (e) {
    error.value = e instanceof ApiError ? [e.problem.title, e.problem.detail].filter(Boolean).join(' ') : t('error.network')
  } finally {
    busy.value = false
  }
}
function assetName(id: string | undefined): string {
  const a = id ? assets.byId[id] : undefined
  return a ? assetLabel(a) : ''
}
</script>

<template>
  <section :class="embedded ? 'space-y-3' : 'max-w-6xl space-y-5'">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <h1 v-if="!embedded" class="text-xl font-semibold">{{ t('charges.title') }}</h1>
      <div class="flex flex-wrap items-end gap-3" data-test="filters">
        <FormField v-if="!embedded" id="f_asset" :label="t('charges.asset')">
          <Select v-model="asset" input-id="f_asset" :options="assetOptions" option-label="label" option-value="value" class="w-64" />
        </FormField>
        <FormField id="f_year" :label="t('charges.exercise')">
          <InputNumber v-model="year" input-id="f_year" :use-grouping="false" :min="1990" :max="2100" show-buttons class="w-32" />
        </FormField>
        <FormField id="f_status" :label="t('charges.statusLabel')">
          <Select v-model="status" input-id="f_status" :options="statusOptions" option-label="label" option-value="value" class="w-40" />
        </FormField>
      </div>
      <div v-if="s.canWrite" class="flex flex-wrap gap-2">
        <Button :label="t('charges.import')" icon="pi pi-upload" severity="secondary" data-test="import" @click="importing = true" />
        <Button :label="t('charges.add')" icon="pi pi-plus" data-test="add-charge" @click="adding = true" />
      </div>
    </div>

    <div v-if="asset" class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-3" data-test="recon-bar">
      <p class="text-sm">
        <template v-if="recon">{{ t('charges.reconOf', { year }) }} — <strong>{{ t(`recon.state.${recon.state}` as Key) }}</strong></template>
        <template v-else>{{ t('charges.noRecon', { year }) }}</template>
      </p>
      <RouterLink v-if="recon" :to="`/reconciliations/${recon.id}`"><Button :label="t('charges.openRecon')" size="small" data-test="open-recon" /></RouterLink>
      <span v-else-if="s.canWrite" :title="sum.drafts ? t('charges.draftsFirst') : ''">
        <Button :label="t('charges.startRecon')" size="small" :disabled="!rows?.length || sum.drafts > 0" data-test="start-recon" @click="askStart" />
      </span>
    </div>
    <Message v-if="sum.drafts" severity="warn" :closable="false" data-test="drafts-warning">{{ t('charges.drafts', { n: sum.drafts }) }}</Message>

    <Skeleton v-if="rows === null" height="6rem" />
    <div v-else-if="rows.length === 0" class="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm" data-test="charges-empty">
      <p class="font-medium">{{ t('charges.empty', { year }) }}</p>
      <p v-if="s.canWrite" class="mt-1 text-slate-500">{{ t('charges.emptyAction') }}</p>
    </div>
    <DataTable v-else :value="rows" data-key="id" size="small" row-hover :class="{ 'cursor-pointer': s.canWrite }" data-test="charges" @row-click="(e) => s.canWrite && (editing = e.data)">
      <Column :header="t('charges.chargedOn')"><template #body="{ data }">{{ date(data.charged_on) }}</template></Column>
      <Column v-if="!embedded && !asset" :header="t('charges.asset')"><template #body="{ data }">{{ assetName(data.asset_id) }}</template></Column>
      <Column :header="t('charges.category')"><template #body="{ data }">{{ t(`charge.category.${data.category}` as Key) }}</template></Column>
      <Column :header="t('charges.label')"><template #body="{ data }"><span data-test="charge-label">{{ data.label }}</span></template></Column>
      <Column :header="t('charges.amount')" class="amount"><template #body="{ data }">{{ money(data.amount_cents ?? 0) }}</template></Column>
      <Column :header="t('charges.recoverable')" class="amount">
        <template #body="{ data }">
          <span data-test="charge-recoverable">{{ money(data.recoverable_cents ?? 0) }}</span>
          <span v-if="data.source === 'syndic' && data.syndic_recoverable_cents !== data.recoverable_cents" class="block text-xs text-slate-500">{{ t('charges.syndicSplit', { amount: money(data.syndic_recoverable_cents ?? 0) }) }}</span>
        </template>
      </Column>
      <Column :header="t('charges.statusLabel')">
        <template #body="{ data }">
          <span class="rounded px-2 py-0.5 text-xs" :class="data.status === 'draft' ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-800'" data-test="charge-status">{{ t(`charges.status.${data.status}` as Key) }}</span>
          <span v-if="data.reconciliation_id" class="ml-1 text-xs text-slate-500">· {{ t('charges.reconciled') }}</span>
        </template>
      </Column>
    </DataTable>
    <div v-if="rows?.length" class="flex justify-end gap-6 text-sm font-semibold" data-test="charges-totals">
      <span>{{ t('charges.total') }} {{ money(sum.amount) }}</span>
      <span>{{ t('charges.recoverableTotal') }} {{ money(sum.recoverable) }}</span>
    </div>

    <ChargeDialog v-model:visible="adding" :asset-id="asset" @saved="saved" />
    <ChargeDialog v-model:visible="editVisible" :charge="editing" @saved="saved" />
    <ImportDialog v-model:visible="importing" :asset-id="asset" :year="year" @imported="imported" />
    <ConfirmDialog v-model:visible="starting" :title="t('charges.startRecon')" :body="t('charges.startBody', { asset: assetName(asset) })" :confirm="t('charges.startRecon')" :busy="busy" :disabled="!start || !end" @confirm="startRecon">
      <div class="grid gap-4 md:grid-cols-2">
        <FormField id="ex_start" :help="t('help.recon.exercise')" :label="t('charges.exerciseStart')"><DayInput id="ex_start" v-model="start" /></FormField>
        <FormField id="ex_end" :label="t('charges.exerciseEnd')"><DayInput id="ex_end" v-model="end" /></FormField>
      </div>
      <Message v-if="error" severity="error" :closable="false" class="mt-3" data-test="start-error">{{ error }}</Message>
    </ConfirmDialog>
  </section>
</template>
