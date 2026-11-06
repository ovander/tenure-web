<script setup lang="ts">
// The lease's deposit tab (RENT-INV-001 §6, slice 9; tenure-api Q-115;
// Q-W30): the wear grid annexed to the lease, the exit items worse or
// missing and the missing keys to retain deductions on, each with its quote
// or invoice, then the RD statement previewed and issued; in a collective
// building, the holdback released by a second statement once the accounts
// are approved. The co-owner reads; an accountant has no access.
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DayInput from '@/components/DayInput.vue'
import DecimalInput from '@/components/DecimalInput.vue'
import FilePicker from '@/components/FilePicker.vue'
import FormField from '@/components/FormField.vue'
import HelpTip from '@/components/HelpTip.vue'
import { ApiError } from '@/api/client'
import { useProblemForm } from '@/app/form'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'
import { date, money } from '@/i18n/format'
import { useLeases, download, type Lease } from './store'
import {
  addDeduction, attachGrid, createGrid, getDeposit, getGrids, needsApproval, removeDeduction, retained, settle, sharePct,
  type Deposit, type Grid, type GridLine, type SettleInput, type Statement,
} from './deposit'

const props = defineProps<{ lease: Lease }>()
const s = useSession()
const toast = useToast()
const leases = useLeases()
const dep = ref<Deposit | null>(null)
const grids = ref<Grid[]>([])
const denied = ref(false)
const leaseId = computed(() => props.lease.id ?? '')

async function reload(): Promise<void> {
  dep.value = await getDeposit(leaseId.value)
  grids.value = await getGrids()
  pickedGrid.value = dep.value.grid?.id ?? null
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

const settled = computed(() => (dep.value?.statements?.length ?? 0) > 0)
const canWrite = computed(() => s.canWrite && !settled.value)
const label = (c: string | undefined) => t(`element.category.${c ?? 'other'}` as Key)
const cond = (st?: { condition?: string }) => (st?.condition ? t(`inventory.condition.${st.condition}` as Key) : '—')

// The grid annexed to the lease, picked or entered.
const pickedGrid = ref<string | null>(null)
const gridOptions = computed(() => grids.value.map((g) => ({ value: g.id ?? '', label: g.name ?? '' })))
async function saveGrid(): Promise<void> {
  await submit(async () => {
    dep.value = await attachGrid(leaseId.value, pickedGrid.value || null)
  })
}
const newGrid = reactive({ open: false, name: '', source: '', lines: [] as GridLine[] })
const categoryOptions = ['floor', 'walls', 'ceiling', 'joinery', 'electrical', 'plumbing', 'heating', 'appliance', 'furniture', 'other'].map((c) => ({ value: c, label: label(c) }))
function openGrid(): void {
  Object.assign(newGrid, { open: true, name: '', source: '', lines: [{ category: 'floor', lifetime_years: 10, franchise_years: 0, yearly_rate_bp: 0, floor_bp: 0 }] })
}
async function recordGrid(): Promise<void> {
  const ok = await submit(async () => {
    const g = await createGrid({ name: newGrid.name, source: newGrid.source, lines: newGrid.lines as never })
    grids.value = await getGrids()
    pickedGrid.value = g.id ?? null
    dep.value = await attachGrid(leaseId.value, g.id ?? null)
    newGrid.open = false
  })
  if (ok) toast.add({ severity: 'success', summary: t('deposit.gridRecorded'), life: 4000 })
}

// The deduction being retained, on an item or a key.
interface Target { kind: 'item' | 'key'; id?: string; keyKind?: string; destination?: string; title: string }
const target = ref<Target | null>(null)
const ded = reactive({ description: '', cost: null as number | null, basis: 'quote' as 'quote' | 'invoice' })
const quote = ref<File | null>(null)
const basisOptions = [{ value: 'quote', label: t('deposit.basis.quote') }, { value: 'invoice', label: t('deposit.basis.invoice') }]
function retain(x: Target): void {
  target.value = x
  Object.assign(ded, { description: x.title, cost: null, basis: 'quote' })
  quote.value = null
}
async function saveDeduction(): Promise<void> {
  const x = target.value
  if (!x) return
  const local: Record<string, string> = {}
  if (!ded.cost) local.cost_cents = t('deposit.costRequired')
  if (!quote.value) local.document_id = t('deposit.quoteRequired')
  const ok = await submit(async () => {
    const doc = await leases.upload('supporting', props.lease, quote.value as File)
    await addDeduction(leaseId.value, {
      description: ded.description.trim(), cost_cents: ded.cost ?? 0, basis: ded.basis, document_id: doc.id,
      ...(x.kind === 'item' ? { exit_item_id: x.id } : { key: { kind: x.keyKind, destination: x.destination } }),
    })
    target.value = null
    await reload()
  }, local)
  if (ok) toast.add({ severity: 'success', summary: t('deposit.retained'), life: 4000 })
}
async function remove(id: string | undefined): Promise<void> {
  if (!id) return
  await submit(async () => {
    await removeDeduction(id)
    await reload()
  })
}

// The next statement: its inputs, a fresh preview, and the issue.
const st = reactive({ approvedOn: null as string | null, regularisation: null as number | null })
const regFile = ref<File | null>(null)
const preview = ref<Statement | null>(null)
const shown = computed(() => preview.value ?? dep.value?.preview ?? null)
const release = computed(() => dep.value?.next === 'release')
async function body(dryRun: boolean): Promise<SettleInput> {
  let regDoc: string | undefined
  if (!dryRun && (st.regularisation ?? 0) > 0 && regFile.value) regDoc = (await leases.upload('supporting', props.lease, regFile.value)).id
  return { dry_run: dryRun, release: release.value || undefined, accounts_approved_on: st.approvedOn || undefined,
    regularisation_cents: st.regularisation || undefined, regularisation_document_id: regDoc }
}
async function compute(): Promise<void> {
  await submit(async () => {
    preview.value = await settle(leaseId.value, await body(true))
  })
}
const confirmVisible = ref(false)
async function issue(): Promise<void> {
  const local: Record<string, string> = {}
  if (release.value && !st.approvedOn) local.accounts_approved_on = t('deposit.approvalRequired')
  if ((st.regularisation ?? 0) > 0 && !regFile.value) local.regularisation_document_id = t('deposit.regularisationProof')
  const ok = await submit(async () => {
    await settle(leaseId.value, await body(false))
    confirmVisible.value = false
    preview.value = null
    await reload()
  }, local)
  if (!ok) confirmVisible.value = false
  else toast.add({ severity: 'success', summary: t('deposit.issued'), life: 4000 })
}
</script>

<template>
  <section class="space-y-4" data-test="deposit">
    <Message v-if="denied" severity="warn" :closable="false" data-test="deposit-denied">{{ t('inventory.denied') }}</Message>
    <Skeleton v-else-if="!dep" height="10rem" />
    <template v-else>
      <Message v-if="summary" severity="error" :closable="false" data-test="deposit-error">{{ summary }}</Message>

      <div class="flex flex-wrap items-center gap-4 rounded-md border border-slate-200 bg-white p-4 text-sm" data-test="deposit-summary">
        <span>{{ t('deposit.held') }} <strong data-test="deposit-held">{{ money(dep.deposit_cents ?? 0) }}</strong></span>
        <Tag v-if="dep.collective_building" :value="t('deposit.collective')" severity="info" data-test="collective" />
        <RouterLink v-if="dep.exit_inventory_id" :to="`/inventories/${dep.exit_inventory_id}/compare`" class="text-emerald-800 underline" data-test="to-compare">{{ t('deposit.seeComparison') }}</RouterLink>
        <HelpTip id="deposit" :text="t('help.deposit')" />
      </div>

      <!-- The wear grid. -->
      <div class="space-y-3 rounded-md border border-slate-200 bg-white p-4" data-test="grid">
        <h2 class="flex items-center gap-2 font-medium">{{ t('deposit.grid') }} <HelpTip id="grid" :text="t('help.deposit.grid')" /></h2>
        <p v-if="dep.grid" class="text-sm" data-test="grid-name">{{ dep.grid.name }} · <span class="text-slate-500">{{ dep.grid.source }}</span></p>
        <p v-else class="text-sm text-slate-500" data-test="no-grid">{{ t('deposit.noGrid') }}</p>
        <div v-if="canWrite" class="flex flex-wrap items-end gap-2">
          <FormField id="grid_pick" :label="t('deposit.pickGrid')">
            <Select v-model="pickedGrid" input-id="grid_pick" :options="gridOptions" option-label="label" option-value="value" show-clear :placeholder="t('deposit.noGrid')" data-test="grid-pick" />
          </FormField>
          <Button :label="t('deposit.annex')" severity="secondary" :loading="busy" data-test="grid-annex" @click="saveGrid" />
          <Button v-if="!newGrid.open" :label="t('deposit.newGrid')" icon="pi pi-plus" text data-test="grid-new" @click="openGrid" />
        </div>
        <div v-if="newGrid.open" class="space-y-2 rounded border border-slate-100 p-3" data-test="grid-form">
          <div class="grid gap-2 md:grid-cols-2">
            <FormField id="grid_name" :label="t('deposit.gridName')" :error="errors.name"><InputText id="grid_name" v-model="newGrid.name" data-test="grid-name-input" /></FormField>
            <FormField id="grid_source" :label="t('deposit.gridSource')" :error="errors.source"><InputText id="grid_source" v-model="newGrid.source" data-test="grid-source" /></FormField>
          </div>
          <div v-for="(l, i) in newGrid.lines" :key="i" class="flex flex-wrap items-end gap-2" data-test="grid-line">
            <FormField :id="`gl_cat_${i}`" :label="t('deposit.category')" :error="errors[`lines[${i}].category`]">
              <Select v-model="l.category" :input-id="`gl_cat_${i}`" :options="categoryOptions" option-label="label" option-value="value" />
            </FormField>
            <FormField :id="`gl_life_${i}`" :label="t('deposit.lifetime')"><InputNumber v-model="l.lifetime_years" :input-id="`gl_life_${i}`" :min="0" :max="99" suffix=" ans" /></FormField>
            <FormField :id="`gl_fr_${i}`" :label="t('deposit.franchise')"><InputNumber v-model="l.franchise_years" :input-id="`gl_fr_${i}`" :min="0" :max="99" suffix=" ans" /></FormField>
            <FormField :id="`gl_rate_${i}`" :label="t('deposit.rate')"><DecimalInput :id="`gl_rate_${i}`" v-model="l.yearly_rate_bp" suffix="% / an" /></FormField>
            <FormField :id="`gl_floor_${i}`" :label="t('deposit.floor')" :error="errors[`lines[${i}].floor_bp`]"><DecimalInput :id="`gl_floor_${i}`" v-model="l.floor_bp" suffix="%" /></FormField>
            <Button icon="pi pi-trash" text severity="secondary" :aria-label="t('deposit.removeLine')" @click="newGrid.lines.splice(i, 1)" />
          </div>
          <div class="flex gap-2">
            <Button :label="t('deposit.addLine')" icon="pi pi-plus" severity="secondary" data-test="grid-add-line" @click="newGrid.lines.push({ category: 'walls', lifetime_years: 10, franchise_years: 0, yearly_rate_bp: 0, floor_bp: 0 })" />
            <Button :label="t('deposit.recordGrid')" icon="pi pi-check" :loading="busy" data-test="grid-save" @click="recordGrid" />
            <Button :label="t('common.cancel')" text severity="secondary" @click="newGrid.open = false" />
          </div>
        </div>
      </div>

      <!-- What the exit flagged. -->
      <div class="space-y-2 rounded-md border border-slate-200 bg-white p-4" data-test="flagged">
        <h2 class="font-medium">{{ t('deposit.flagged') }}</h2>
        <p v-if="dep.next === 'wait_exit'" class="text-sm text-slate-500" data-test="wait-exit">{{ t('deposit.waitExit') }}</p>
        <p v-else-if="!dep.flagged?.length && !dep.missing_keys?.length" class="text-sm text-slate-500" data-test="nothing-flagged">{{ t('deposit.nothingFlagged') }}</p>
        <div v-for="r in dep.flagged" :key="r.exit_item_id" class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-sm" data-test="flagged-item">
          <span><span class="text-slate-500">{{ r.room }} ·</span> {{ r.label }} — {{ cond(r.entry) }} → {{ cond(r.exit) }}</span>
          <span class="flex items-center gap-2">
            <Tag :value="t(`compare.result.${r.result}` as Key)" severity="danger" />
            <Tag v-if="retained(dep, r.exit_item_id)" :value="t('deposit.retainedTag')" severity="secondary" data-test="retained" />
            <Button v-else-if="canWrite" :label="t('deposit.retain')" size="small" severity="secondary" data-test="retain-item" @click="retain({ kind: 'item', id: r.exit_item_id, title: `${r.room} · ${r.label}` })" />
          </span>
        </div>
        <div v-for="k in dep.missing_keys" :key="`${k.kind}-${k.destination}`" class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-sm" data-test="missing-key">
          <span>{{ t(`inventory.key.${k.kind}` as Key) }} · {{ k.destination }} — {{ k.entry }} → {{ k.exit }}</span>
          <Button
            v-if="canWrite" :label="t('deposit.retain')" size="small" severity="secondary" data-test="retain-key"
            @click="retain({ kind: 'key', keyKind: k.kind, destination: k.destination, title: `${t(`inventory.key.${k.kind}` as Key)} · ${k.destination}` })"
          />
        </div>
        <div v-if="target" class="space-y-2 rounded border border-amber-200 bg-amber-50 p-3" data-test="deduction-form">
          <h3 class="text-sm font-medium">{{ t('deposit.retainOn', { what: target.title }) }}</h3>
          <div class="grid gap-2 md:grid-cols-3">
            <FormField id="ded_desc" :label="t('deposit.description')" :error="errors.description" class="md:col-span-3"><InputText id="ded_desc" v-model="ded.description" data-test="ded-description" /></FormField>
            <FormField id="ded_cost" :label="t('deposit.cost')" :error="errors.cost_cents"><DecimalInput id="ded_cost" v-model="ded.cost" suffix="€" data-test="ded-cost" /></FormField>
            <FormField id="ded_basis" :label="t('deposit.basis')"><Select v-model="ded.basis" input-id="ded_basis" :options="basisOptions" option-label="label" option-value="value" /></FormField>
            <FormField id="ded_doc" :label="t('deposit.quote')" :error="errors.document_id"><FilePicker id="ded_doc" v-model="quote" accept="application/pdf,image/jpeg,image/png" /></FormField>
          </div>
          <p class="text-xs text-slate-600">{{ t('deposit.shareHint') }}</p>
          <div class="flex gap-2">
            <Button :label="t('deposit.saveDeduction')" icon="pi pi-check" :loading="busy" data-test="ded-save" @click="saveDeduction" />
            <Button :label="t('common.cancel')" text severity="secondary" @click="target = null" />
          </div>
        </div>
      </div>

      <!-- The deductions retained. -->
      <div v-if="dep.deductions?.length" class="rounded-md border border-slate-200 bg-white p-4" data-test="deductions">
        <h2 class="mb-2 font-medium">{{ t('deposit.deductions') }}</h2>
        <table class="w-full text-sm">
          <thead class="text-left text-slate-500">
            <tr><th class="py-1 pr-2 font-normal">{{ t('deposit.description') }}</th><th class="py-1 pr-2 text-right font-normal">{{ t('deposit.cost') }}</th><th class="py-1 pr-2 text-right font-normal">{{ t('deposit.share') }}</th><th class="py-1 text-right font-normal">{{ t('deposit.amount') }}</th><th /></tr>
          </thead>
          <tbody>
            <tr v-for="d in dep.deductions" :key="d.id" class="border-t border-slate-100" data-test="deduction">
              <td class="py-2 pr-2">{{ d.description }}<span class="block text-xs text-slate-500">{{ t(`deposit.basis.${d.basis}` as Key) }}</span></td>
              <td class="py-2 pr-2 text-right">{{ money(d.cost_cents ?? 0) }}</td>
              <td class="py-2 pr-2 text-right" data-test="deduction-share">{{ sharePct(d.tenant_share_bp) }}</td>
              <td class="py-2 text-right" data-test="deduction-amount">{{ money(d.amount_cents ?? 0) }}</td>
              <td class="py-2 text-right"><Button v-if="canWrite" icon="pi pi-trash" text severity="secondary" :aria-label="t('deposit.removeDeduction')" data-test="deduction-remove" @click="remove(d.id)" /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- The next statement. -->
      <div v-if="shown && (dep.next === 'initial' || dep.next === 'release')" class="space-y-3 rounded-md border border-slate-200 bg-white p-4" data-test="statement-preview">
        <h2 class="font-medium">{{ t(release ? 'deposit.releaseTitle' : 'deposit.statementTitle') }}</h2>
        <dl class="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
          <dt>{{ t(release ? 'deposit.holdbackHeld' : 'deposit.held') }}</dt><dd class="text-right">{{ money(shown.deposit_cents ?? 0) }}</dd>
          <template v-if="!release">
            <dt>{{ t('deposit.deductions') }}</dt><dd class="text-right" data-test="pv-deductions">− {{ money(shown.deductions_cents ?? 0) }}</dd>
            <dt>{{ t('deposit.arrears') }}</dt><dd class="text-right" data-test="pv-arrears">− {{ money(shown.arrears_cents ?? 0) }}</dd>
            <template v-if="shown.holdback_cents"><dt>{{ t('deposit.holdback') }}</dt><dd class="text-right" data-test="pv-holdback">− {{ money(shown.holdback_cents) }}</dd></template>
          </template>
          <template v-if="shown.regularisation_cents"><dt>{{ t('deposit.regularisation') }}</dt><dd class="text-right" data-test="pv-regularisation">− {{ money(shown.regularisation_cents) }}</dd></template>
          <template v-if="shown.penalty_cents"><dt>{{ t('deposit.penalty', { n: shown.penalty_months ?? 0 }) }}</dt><dd class="text-right" data-test="pv-penalty">+ {{ money(shown.penalty_cents) }}</dd></template>
          <dt class="font-medium">{{ t((shown.total_cents ?? 0) < 0 ? 'deposit.owed' : 'deposit.toReturn') }}</dt>
          <dd class="text-right font-medium" data-test="pv-total">{{ money(Math.abs(shown.total_cents ?? 0)) }}</dd>
        </dl>
        <p class="text-sm" data-test="pv-deadline">{{ t('deposit.deadline', { day: date(shown.deadline) }) }}</p>
        <div v-if="s.canWrite" class="space-y-2">
          <div v-if="needsApproval(dep)" class="grid gap-2 md:grid-cols-3">
            <FormField id="st_approved" :label="t('deposit.approvedOn')" :help="t('help.deposit.approved')" :error="errors.accounts_approved_on">
              <DayInput id="st_approved" v-model="st.approvedOn" />
            </FormField>
            <FormField id="st_reg" :label="t('deposit.regularisation')" :error="errors.regularisation_cents"><DecimalInput id="st_reg" v-model="st.regularisation" suffix="€" /></FormField>
            <FormField id="st_reg_doc" :label="t('deposit.regularisationDoc')" :error="errors.regularisation_document_id"><FilePicker id="st_reg_doc" v-model="regFile" accept="application/pdf,image/jpeg,image/png" /></FormField>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button v-if="needsApproval(dep)" :label="t('deposit.compute')" severity="secondary" :loading="busy" data-test="compute" @click="compute" />
            <Button :label="t('deposit.issue')" icon="pi pi-file-check" :loading="busy" data-test="issue" @click="confirmVisible = true" />
          </div>
        </div>
      </div>

      <!-- The statements issued. -->
      <div v-if="dep.statements?.length" class="space-y-2 rounded-md border border-slate-200 bg-white p-4" data-test="statements">
        <h2 class="font-medium">{{ t('deposit.statements') }}</h2>
        <div v-for="x in dep.statements" :key="x.document_id" class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-sm" data-test="statement">
          <span>{{ t(`deposit.kind.${x.kind}` as Key) }} · {{ date(x.settled_on) }} · {{ t((x.total_cents ?? 0) < 0 ? 'deposit.owed' : 'deposit.toReturn') }} {{ money(Math.abs(x.total_cents ?? 0)) }}</span>
          <Button :label="t('deposit.downloadRD')" icon="pi pi-download" size="small" data-test="download-rd" @click="download(x.document_id ?? '')" />
        </div>
        <p v-if="dep.next === 'done'" class="text-sm text-emerald-800" data-test="deposit-done">{{ t('deposit.done') }}</p>
      </div>

      <ConfirmDialog v-model:visible="confirmVisible" :title="t('deposit.issue')" :body="t('deposit.issueConfirm')" :confirm="t('deposit.issue')" :busy="busy" @confirm="issue" />
    </template>
  </section>
</template>
