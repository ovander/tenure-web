<script setup lang="ts">
// S12 Tax year (RENT-FE-001 §3, flow 4): an income year's summary with
// micro-foncier and the régime réel side by side, each 2044 line expandable to
// the charges and payments behind it, orange rows for what needs a look
// (charge without a supporting document, draft charge, unmatched payment).
// Computing and issuing are step_up actions; the issued year shows its RF-…
// PDF and the CSV of its lines. Line numbers and their categories come from
// the form_2044_line_map parameter; the app writes none.
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import RadioButton from 'primevue/radiobutton'
import { useToast } from 'primevue/usetoast'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DocumentCard from '@/components/DocumentCard.vue'
import HelpTip from '@/components/HelpTip.vue'
import { ApiError } from '@/api/client'
import { withStepUp } from '@/app/stepUp'
import { loanSource } from '@/features/loans/loans'
import { useSession } from '@/stores/session'
import { useAssets, assetLabel } from '@/features/portfolio/store'
import { useCharges, type Charge } from '@/features/charges/store'
import { useBilling, type Payment } from '@/features/billing/store'
import { t, type Key } from '@/i18n'
import { date, money, timestamp } from '@/i18n/format'
import { categoriesOf, flagsBySource, lineKind, lower, useTax, type LineMap, type OwnerSummary, type Regime, type TaxView } from './store'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const s = useSession()
const store = useTax()
const charges = useCharges()
const billing = useBilling()
const assets = useAssets()

const year = computed(() => Number(route.params.year))
const view = ref<TaxView | null | undefined>(undefined)
const map = ref<LineMap | undefined>()
const lockYears = ref<number | undefined>()
const chargeById = ref<Record<string, Charge>>({})
const paymentById = ref<Record<string, Payment>>({})
const open = ref<Record<string, boolean>>({})
const busy = ref(false)
const error = ref('')
const issuing = ref(false)
const regime = ref<Regime>('reel')

const summary = computed(() => view.value?.summary)
const issued = computed(() => view.value?.state === 'issued')
const flags = computed(() => summary.value?.flags ?? [])
const flagged = computed(() => flagsBySource(flags.value))
const owners = computed<OwnerSummary[]>(() => summary.value?.owners ?? [])
const mine = computed(() => owners.value.find((o) => o.owner_id === s.active?.owner_id) ?? owners.value[0])
const flagCounts = computed(() => flags.value.reduce<Record<string, number>>((m, f) => ({ ...m, [f.kind ?? '']: (m[f.kind ?? ''] ?? 0) + 1 }), {}))

// seq numbers loads and computations: a load answered after a newer load or
// a computation is dropped, so it cannot wipe what that one showed.
let seq = 0
async function load(): Promise<void> {
  const ticket = ++seq
  view.value = undefined
  error.value = ''
  open.value = {}
  const y = year.value
  const [v, m, lock] = await Promise.all([
    store.forYear(y).catch(() => undefined),
    store.lineMap(y),
    store.lockYears(y),
    assets.list(1, 100).catch(() => undefined),
    charges.list({ year: y }).then((p) => (chargeById.value = Object.fromEntries(p.items.map((c) => [c.id ?? '', c])))).catch(() => undefined),
    billing.payments({ size: 100 }).then((p) => (paymentById.value = Object.fromEntries(p.items.map((x) => [x.id ?? '', x])))).catch(() => undefined),
  ])
  if (year.value !== y) return
  map.value = m
  lockYears.value = lock
  if (ticket !== seq) return
  view.value = v ?? null
  regime.value = v?.regime === 'micro' || (mine.value && lower(mine.value) === 'micro') ? 'micro' : 'reel'
}
onMounted(load)
watch(year, load)

function problem(e: unknown): string {
  return e instanceof ApiError ? [e.problem.title, e.problem.detail].filter(Boolean).join(' ') : t('error.network')
}
async function compute(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    seq++
    const v = await withStepUp(() => store.compute(year.value))
    if (v) {
      view.value = v
      toast.add({ severity: 'success', summary: t('tax.computed'), life: 3000 })
    }
  } catch (e) {
    error.value = problem(e)
  } finally {
    busy.value = false
  }
}
async function issue(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const v = await withStepUp(() => store.issue(year.value, regime.value))
    issuing.value = false
    if (v) {
      view.value = v
      toast.add({ severity: 'success', summary: t('tax.issued'), life: 4000 })
    }
  } catch (e) {
    error.value = problem(e)
  } finally {
    busy.value = false
  }
}

function go(n: number): void {
  void router.push(`/tax/${year.value + n}`)
}
function lineLabel(line: string): string {
  const cats = categoriesOf(line, map.value)
  if (!cats.length) return ''
  return cats.map((c) => (c === 'rent' ? t('tax.cat.rent') : c === 'forfait_222' ? t('tax.cat.forfait') : t(`charge.category.${c}` as Key))).join(' · ')
}
function sourceText(id: string): string {
  const c = chargeById.value[id]
  if (c) return `${date(c.charged_on)} — ${c.label ?? ''} — ${money(c.amount_cents ?? 0)}`
  const p = paymentById.value[id]
  if (p) return `${date(p.paid_on)} — ${t('tax.payment')} — ${money(p.amount_cents ?? 0)}`
  const l = loanSource(id)
  if (l) return t(l.insurance ? 'tax.loanInsurance' : 'tax.loanInterest', { seq: l.seq })
  return id
}
function sourceLink(id: string): string | undefined {
  const c = chargeById.value[id]
  if (c) return `/charges?asset=${c.asset_id}&year=${c.exercise_year ?? year.value}`
  const p = paymentById.value[id]
  if (p) return `/leases/${p.lease_id}/billing`
  return undefined
}
function assetName(id: string | undefined): string {
  const a = id ? assets.byId[id] : undefined
  return a ? assetLabel(a) : id ?? ''
}
function ownerName(o: OwnerSummary): string {
  const sc = s.scopes.find((x) => x.owner_id === o.owner_id)
  return sc?.legal_name ?? t('tax.coOwner')
}
const issueBody = computed(() => {
  const r = regime.value === 'micro' ? t('tax.micro') : t('tax.reel')
  const lock = regime.value === 'reel' && lockYears.value ? ` ${t('tax.reelLock', { years: lockYears.value })}` : ''
  return `${t('tax.issueBody', { year: year.value, regime: r })}${lock}`
})
</script>

<template>
  <section class="max-w-6xl space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-2">
        <Button icon="pi pi-chevron-left" text rounded :aria-label="t('tax.previous')" data-test="prev-year" @click="go(-1)" />
        <h1 class="text-xl font-semibold" data-test="tax-title">{{ t('tax.title', { year }) }}</h1>
        <Button icon="pi pi-chevron-right" text rounded :aria-label="t('tax.next')" data-test="next-year" @click="go(1)" />
        <span v-if="view" class="rounded bg-slate-100 px-2 py-0.5 text-sm" data-test="tax-state">{{ issued ? t('tax.state.issued') : t('tax.state.draft') }}</span>
      </div>
      <div v-if="s.canWrite && !issued" class="flex flex-wrap gap-2">
        <Button :label="view ? t('tax.recompute') : t('tax.compute')" icon="pi pi-refresh" severity="secondary" :loading="busy && !issuing" :disabled="view === undefined" data-test="compute" @click="compute" />
        <Button v-if="view" :label="t('tax.issue')" icon="pi pi-lock" data-test="issue-tax" @click="issuing = true" />
      </div>
    </div>
    <p class="flex items-center gap-1 text-sm text-slate-600">{{ t('tax.intro', { year, filing: year + 1 }) }} <HelpTip id="tax_intro" :text="t('help.tax.stepUp')" /></p>
    <Message v-if="error && !issuing" severity="error" :closable="false" data-test="tax-error">{{ error }}</Message>

    <Skeleton v-if="view === undefined" height="10rem" />
    <div v-else-if="view === null" class="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm" data-test="tax-empty">
      <p class="font-medium">{{ t('tax.empty', { year }) }}</p>
      <p v-if="s.canWrite" class="mt-1 text-slate-500">{{ t('tax.emptyAction') }}</p>
    </div>
    <template v-else>
      <p class="text-xs text-slate-500" data-test="tax-inputs">
        {{ t('tax.inputs', { payments: view.inputs?.payments ?? 0, charges: view.inputs?.charges ?? 0 }) }} · {{ t('tax.computedAt', { at: timestamp(view.computed_at) }) }}
      </p>

      <div v-if="flags.length" class="space-y-1" data-test="tax-flags">
        <Message v-if="flagCounts.missing_document" severity="warn" :closable="false">{{ t('tax.flag.missing_document', { n: flagCounts.missing_document }) }}</Message>
        <Message v-if="flagCounts.draft_charge" severity="warn" :closable="false">
          {{ t('tax.flag.draft_charge', { n: flagCounts.draft_charge }) }} <RouterLink :to="{ path: '/charges', query: { year, status: 'draft' } }" class="underline">{{ t('tax.fix') }}</RouterLink>
        </Message>
        <Message v-if="flagCounts.unmatched_payment" severity="warn" :closable="false">
          {{ t('tax.flag.unmatched_payment', { n: flagCounts.unmatched_payment }) }} <RouterLink :to="{ path: '/billing/payments', query: { unmatched: '1' } }" class="underline">{{ t('tax.fix') }}</RouterLink>
        </Message>
        <Message v-if="flagCounts.superseded_by_loan" severity="info" :closable="false" data-test="flag-superseded">{{ t('tax.flag.superseded_by_loan', { n: flagCounts.superseded_by_loan }) }}</Message>
      </div>

      <template v-if="issued">
        <Message severity="success" :closable="false" data-test="tax-issued">{{ t('tax.issuedBody', { regime: view.regime === 'micro' ? t('tax.micro') : t('tax.reel'), at: timestamp(view.issued_at) }) }}</Message>
        <div class="grid gap-2 md:grid-cols-2" data-test="tax-documents">
          <DocumentCard v-if="view.document_id" :label="t('tax.pdf', { year })" :document-id="view.document_id" :issued-at="view.issued_at" />
          <DocumentCard v-if="view.csv_document_id" :label="t('tax.csv', { year })" :document-id="view.csv_document_id" :issued-at="view.issued_at" />
        </div>
      </template>

      <section v-for="o in owners" :key="o.owner_id" class="space-y-4" data-test="tax-owner">
        <h2 v-if="owners.length > 1" class="text-base font-semibold">{{ ownerName(o) }}</h2>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="rounded-md border bg-white p-4" :class="lower(o) === 'micro' ? 'border-emerald-500' : 'border-slate-200'" data-test="regime-micro">
            <h3 class="mb-2 flex items-center gap-2 font-semibold">
              {{ t('tax.micro') }}
              <span v-if="!o.micro?.eligible" class="rounded bg-slate-200 px-2 py-0.5 text-xs font-normal" data-test="micro-closed">{{ t('tax.notEligible') }}</span>
              <HelpTip id="help_micro" :text="t('help.tax.micro')" />
            </h3>
            <dl class="space-y-1 text-sm">
              <div class="flex justify-between"><dt>{{ t('tax.gross') }}</dt><dd class="amount">{{ money(o.micro?.gross_cents ?? 0) }}</dd></div>
              <div class="flex justify-between"><dt>{{ t('tax.allowance') }}</dt><dd class="amount">− {{ money(o.micro?.allowance_cents ?? 0) }}</dd></div>
              <div class="flex justify-between font-semibold"><dt>{{ t('tax.taxable') }}</dt><dd class="amount" data-test="micro-taxable">{{ money(o.micro?.taxable_cents ?? 0) }}</dd></div>
            </dl>
          </div>
          <div class="rounded-md border bg-white p-4" :class="lower(o) === 'reel' ? 'border-emerald-500' : 'border-slate-200'" data-test="regime-reel">
            <h3 class="mb-2 flex items-center gap-2 font-semibold">{{ t('tax.reel') }} <HelpTip id="help_reel" :text="t('help.tax.reel')" /></h3>
            <dl class="space-y-1 text-sm">
              <div class="flex justify-between"><dt>{{ t('tax.income') }}</dt><dd class="amount">{{ money(o.reel?.income_cents ?? 0) }}</dd></div>
              <div class="flex justify-between"><dt>{{ t('tax.expenses') }}</dt><dd class="amount">− {{ money(o.reel?.other_expenses_cents ?? 0) }}</dd></div>
              <div class="flex justify-between"><dt>{{ t('tax.interest') }}</dt><dd class="amount">− {{ money(o.reel?.interest_cents ?? 0) }}</dd></div>
              <div class="flex justify-between"><dt>{{ t('tax.net') }}</dt><dd class="amount" :class="{ negative: (o.reel?.net_cents ?? 0) < 0 }">{{ money(o.reel?.net_cents ?? 0) }}</dd></div>
              <div v-for="d in o.reel?.prior_used ?? []" :key="`u${d.year}`" class="flex justify-between text-slate-600"><dt>{{ t('tax.priorUsed', { year: d.year ?? '' }) }}</dt><dd class="amount">− {{ money(d.remaining_cents ?? 0) }}</dd></div>
              <div v-if="(o.reel?.global_imputable_cents ?? 0) > 0" class="flex justify-between text-slate-600"><dt>{{ t('tax.global') }}</dt><dd class="amount">{{ money(o.reel?.global_imputable_cents ?? 0) }}</dd></div>
              <div class="flex justify-between font-semibold"><dt>{{ t('tax.taxable') }}</dt><dd class="amount" data-test="reel-taxable">{{ money(o.reel?.taxable_cents ?? 0) }}</dd></div>
              <div v-for="d in o.reel?.carried_forward ?? []" :key="`c${d.year}`" class="flex justify-between text-xs text-slate-600" data-test="carried"><dt>{{ t('tax.carried', { year: d.year ?? '' }) }}</dt><dd class="amount">{{ money(d.remaining_cents ?? 0) }}</dd></div>
            </dl>
          </div>
        </div>
        <p v-if="lower(o)" class="text-xs text-slate-500" data-test="lower-note">{{ t('tax.lowerNote', { regime: lower(o) === 'micro' ? t('tax.micro') : t('tax.reel') }) }}</p>
        <p v-if="(o.furnished_gross_receipts_cents ?? 0) > 0" class="text-sm text-slate-600" data-test="furnished">{{ t('tax.furnished', { amount: money(o.furnished_gross_receipts_cents ?? 0) }) }}</p>

        <div>
          <h3 class="mb-2 flex items-center gap-1 font-semibold">{{ t('tax.lines', { millesime: summary?.millesime ?? '' }) }} <HelpTip id="help_lines" :text="t('help.tax.lines')" /></h3>
          <Message v-if="!map" severity="warn" :closable="false" data-test="no-line-map">{{ t('tax.noLineMap') }}</Message>
          <table class="w-full text-sm" data-test="lines">
            <tbody>
              <template v-for="l in o.totals ?? []" :key="l.line">
                <tr class="cursor-pointer border-b border-slate-200 hover:bg-slate-50" :class="{ 'bg-orange-50': (l.sources ?? []).some((x) => flagged[x]) }" data-test="line" @click="open[`${o.owner_id}${l.line}`] = !open[`${o.owner_id}${l.line}`]">
                  <td class="w-8 py-1.5"><i class="pi text-xs text-slate-400" :class="open[`${o.owner_id}${l.line}`] ? 'pi-chevron-down' : 'pi-chevron-right'" /></td>
                  <td class="w-20 py-1.5 font-mono" data-test="line-number">{{ l.line }}</td>
                  <td class="py-1.5">{{ lineLabel(l.line ?? '') }} <span v-if="lineKind(l.line ?? '', map) === 'income'" class="text-xs text-slate-500">({{ t('tax.incomeLine') }})</span></td>
                  <td class="amount py-1.5">{{ money(l.amount_cents ?? 0) }}</td>
                </tr>
                <tr v-if="open[`${o.owner_id}${l.line}`]" class="border-b border-slate-200 bg-slate-50" data-test="line-sources">
                  <td />
                  <td colspan="3" class="py-2">
                    <p v-if="!(l.sources ?? []).length" class="text-xs text-slate-500">{{ t('tax.noSources') }}</p>
                    <ul class="space-y-0.5 text-xs">
                      <li v-for="src in l.sources ?? []" :key="src" :class="{ 'font-medium text-orange-800': flagged[src] }" data-test="source">
                        <RouterLink v-if="sourceLink(src)" :to="sourceLink(src) ?? ''" class="hover:underline">{{ sourceText(src) }}</RouterLink>
                        <span v-else>{{ sourceText(src) }}</span>
                        <span v-for="k in flagged[src] ?? []" :key="k"> · {{ t(`tax.flagShort.${k}` as Key) }}</span>
                      </li>
                    </ul>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <details class="rounded-md border border-slate-200 bg-white p-3 text-sm" data-test="by-asset">
          <summary class="cursor-pointer font-medium">{{ t('tax.byAsset') }}</summary>
          <ul class="mt-2 space-y-1">
            <li v-for="a in o.assets ?? []" :key="a.asset_id" class="flex justify-between gap-4">
              <span>{{ assetName(a.asset_id) }} <span v-if="a.furnished" class="text-xs text-slate-500">({{ t('tax.furnishedTag') }})</span></span>
              <span class="amount">{{ a.furnished ? money(a.gross_receipts_cents ?? 0) : money(a.net_cents ?? 0) }}</span>
            </li>
          </ul>
        </details>
      </section>
    </template>

    <ConfirmDialog v-model:visible="issuing" :title="t('tax.issue')" :body="issueBody" :confirm="t('tax.issue')" :busy="busy" @confirm="issue">
      <fieldset class="space-y-2" data-test="regime-choice">
        <legend class="mb-1 text-sm font-medium">{{ t('tax.regime') }}</legend>
        <div class="flex items-center gap-2">
          <RadioButton v-model="regime" input-id="reg_micro" value="micro" :disabled="!mine?.micro?.eligible" />
          <label for="reg_micro" class="text-sm">{{ t('tax.micro') }} — {{ money(mine?.micro?.taxable_cents ?? 0) }} <span v-if="!mine?.micro?.eligible" class="text-slate-500">({{ t('tax.notEligible') }})</span></label>
        </div>
        <div class="flex items-center gap-2">
          <RadioButton v-model="regime" input-id="reg_reel" value="reel" />
          <label for="reg_reel" class="text-sm">{{ t('tax.reel') }} — {{ money(mine?.reel?.taxable_cents ?? 0) }}</label>
        </div>
      </fieldset>
      <Message v-if="error" severity="error" :closable="false" class="mt-3" data-test="issue-error">{{ error }}</Message>
    </ConfirmDialog>
  </section>
</template>
