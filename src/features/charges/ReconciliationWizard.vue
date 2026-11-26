<script setup lang="ts">
// S11 Reconciliation wizard (RENT-FE-001 §3, flow 3): an asset's exercise in
// five steps kept in the URL (?step=), with a summary rail on the right.
//   charges     the exercise's charges, recoverable and not; drafts block
//   allocation  « Répartir »: one line per lease, its days and its share
//   balances    provisions collected against the share; sign and 12-month spread
//   provisions  per lease: the new provision (proposed, rounded up to the euro),
//               apply it from the next month, and how the balance is settled
//   issue       exactly what will be written, then RG-… statements; settle, or
//               cancel with a reason (a correction)
// Back never loses data: every choice is saved on the line as it is made.
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DecimalInput from '@/components/DecimalInput.vue'
import FormField from '@/components/FormField.vue'
import HelpTip from '@/components/HelpTip.vue'
import DocumentCard from '@/components/DocumentCard.vue'
import { ApiError } from '@/api/client'
import { useSession } from '@/stores/session'
import { useAssets, assetLabel } from '@/features/portfolio/store'
import { useLeaseNames } from '@/features/billing/names'
import { t, type Key } from '@/i18n'
import { queueByKey } from '@/lib/async'
import { date, money } from '@/i18n/format'
import { settlements, steps, totals, useCharges, type Charge, type Recon, type ReconAction, type ReconLine, type Step } from './store'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const s = useSession()
const store = useCharges()
const assets = useAssets()
const names = useLeaseNames()

const recon = ref<Recon | null>(null)
const charges = ref<Charge[]>([])
const missing = ref(false)
const busy = ref(false)
const error = ref('')
const confirming = ref<ReconAction | null>(null)
const reason = ref('')
const savingLine = ref('')
const id = computed(() => route.params.id as string)
const step = computed<Step>(() => (steps as readonly string[]).includes(route.query.step as string) ? (route.query.step as Step) : 'charges')
const state = computed(() => recon.value?.state ?? 'draft')
const allocated = computed(() => state.value !== 'draft')
const editable = computed(() => s.canWrite && state.value === 'allocated')
const lines = computed<ReconLine[]>(() => recon.value?.lines ?? [])
const sum = computed(() => totals(charges.value))
const asset = computed(() => (recon.value?.asset_id ? assets.byId[recon.value.asset_id] : undefined))
const settlementOptions = settlements.map((x) => ({ value: x, label: t(`recon.settlement.${x}` as Key) }))

async function load(): Promise<void> {
  missing.value = false
  try {
    recon.value = await store.recon(id.value)
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) {
      missing.value = true
      return
    }
    throw e
  }
  const r = recon.value
  await Promise.all([
    store.list({ asset_id: r.asset_id, year: r.exercise_year }).then((p) => (charges.value = p.items)).catch(() => (charges.value = [])),
    r.asset_id && !assets.byId[r.asset_id] ? assets.get(r.asset_id).catch(() => undefined) : Promise.resolve(),
    names.load(),
  ])
}
onMounted(load)
watch(id, load)

function go(x: Step): void {
  void router.replace({ query: { ...route.query, step: x } })
}
const at = computed(() => steps.indexOf(step.value))
// A step past « charges » needs an allocation to show.
function open(x: Step): boolean {
  return x === 'charges' || allocated.value
}

function problem(e: unknown): string {
  return e instanceof ApiError ? [e.problem.title, e.problem.detail].filter(Boolean).join(' ') : t('error.network')
}
async function act(action: ReconAction, next?: Step): Promise<void> {
  if (!recon.value?.id) return
  busy.value = true
  error.value = ''
  try {
    recon.value = await store.transition(recon.value.id, action, action === 'cancel' ? reason.value.trim() : undefined)
    confirming.value = null
    toast.add({ severity: 'success', summary: t(`recon.done.${action}` as Key), life: 4000 })
    if (next) go(next)
    await load()
  } catch (e) {
    error.value = problem(e)
  } finally {
    busy.value = false
  }
}
function ask(a: ReconAction): void {
  error.value = ''
  reason.value = ''
  confirming.value = a
}
const confirmVisible = computed({ get: () => confirming.value !== null, set: (v: boolean) => (confirming.value = v ? confirming.value : null) })

// Each choice on a line is saved as it is made, with the line's version.
// Several controls of one line (provision, apply, settlement) may save at
// once: the saves of a line run one after the other, each built from the line
// as the previous save left it (its version and its other choices), so none
// is refused with 412 and none is lost.
const lineSaves = queueByKey()
function saveLine(l: ReconLine, patch: Partial<ReconLine>): Promise<void> {
  if (!l.id) return Promise.resolve()
  const lineId = l.id
  return lineSaves(lineId, async () => {
    const r = recon.value
    const cur = r?.lines?.find((x) => x.id === lineId)
    if (!r?.id || !cur) return
    savingLine.value = lineId
    error.value = ''
    try {
      const input = { apply_provision: patch.apply_provision ?? cur.apply_provision, new_provision_cents: patch.new_provision_cents ?? provisionOf(cur),
        settlement: (patch.settlement ?? cur.settlement) as 'fee' | 'deposit' | 'direct' }
      const saved = await store.saveLine(r.id, cur, input)
      const i = recon.value?.lines?.findIndex((x) => x.id === lineId) ?? -1
      if (i >= 0 && recon.value?.lines) recon.value.lines[i] = saved
    } catch (e) {
      error.value = problem(e)
      if (e instanceof ApiError && e.status === 412) await load()
    } finally {
      if (savingLine.value === lineId) savingLine.value = ''
    }
  })
}
// The API starts new_provision_cents at the proposal; a 0 is the owner's
// choice and stays 0 (|| would put the proposal back).
function provisionOf(l: ReconLine): number | undefined {
  return l.new_provision_cents ?? l.proposed_provision_cents
}
function balanceText(cents: number): string {
  if (cents > 0) return t('recon.owes', { amount: money(cents) })
  if (cents < 0) return t('recon.refund', { amount: money(-cents) })
  return t('recon.even')
}
const written = computed(() => lines.value.map((l) => ({ l, provision: l.apply_provision ? provisionOf(l) : undefined })))
</script>

<template>
  <section class="max-w-6xl space-y-4">
    <nav class="text-sm text-slate-500" aria-label="breadcrumb">
      <RouterLink to="/charges" class="hover:underline">{{ t('charges.title') }}</RouterLink>
      <template v-if="asset"><span class="mx-2">›</span><RouterLink :to="`/assets/${asset.id}/charges`" class="hover:underline">{{ assetLabel(asset) }}</RouterLink></template>
      <span class="mx-2">›</span><span class="text-slate-700">{{ t('recon.title') }}</span>
    </nav>
    <Message v-if="missing" severity="warn" :closable="false" data-test="recon-missing">{{ t('recon.notFound') }}</Message>
    <Skeleton v-else-if="!recon" height="10rem" />
    <template v-else>
      <h1 class="flex flex-wrap items-center gap-3 text-xl font-semibold" data-test="recon-title">
        {{ t('recon.heading', { year: recon.exercise_year ?? '' }) }}
        <span class="rounded bg-slate-100 px-2 py-0.5 text-sm font-medium" data-test="recon-state">{{ t(`recon.state.${state}` as Key) }}</span>
      </h1>

      <ol class="flex flex-wrap gap-1 border-b border-slate-200" data-test="stepper">
        <li v-for="(x, i) in steps" :key="x">
          <button
            type="button" class="-mb-px border-b-2 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:text-slate-300"
            :class="step === x ? 'border-emerald-600 font-medium text-emerald-800' : 'border-transparent text-slate-600 hover:text-slate-900'"
            :disabled="!open(x)" :aria-current="step === x ? 'step' : undefined" :data-test="`step-${x}`" @click="go(x)"
          >
            {{ i + 1 }}. {{ t(`recon.step.${x}` as Key) }}
          </button>
        </li>
      </ol>
      <Message v-if="error && !confirming" severity="error" :closable="false" data-test="recon-error">{{ error }}</Message>

      <div class="grid gap-6 lg:grid-cols-[1fr_17rem]">
        <div class="min-w-0 space-y-4">
          <!-- 1. Charges -->
          <template v-if="step === 'charges'">
            <p class="text-sm text-slate-600">{{ t('recon.chargesBody') }}</p>
            <Message v-if="sum.drafts" severity="warn" :closable="false" data-test="recon-drafts">
              {{ t('charges.drafts', { n: sum.drafts }) }}
              <RouterLink :to="{ path: '/charges', query: { asset: recon.asset_id, year: recon.exercise_year, status: 'draft' } }" class="ml-1 underline">{{ t('recon.toLedger') }}</RouterLink>
            </Message>
            <table class="w-full text-sm" data-test="recon-charges">
              <thead><tr class="border-b border-slate-300 text-left text-slate-600"><th class="py-1 pr-2 font-medium">{{ t('charges.label') }}</th><th class="py-1 pr-2 font-medium">{{ t('charges.category') }}</th><th class="amount py-1 pr-2 font-medium">{{ t('charges.amount') }}</th><th class="amount py-1 font-medium">{{ t('charges.recoverable') }}</th></tr></thead>
              <tbody>
                <tr v-for="c in charges" :key="c.id" class="border-b border-slate-200" :class="{ 'text-slate-400': c.status === 'draft' }">
                  <td class="py-1.5 pr-2">{{ c.label }} <span v-if="c.status === 'draft'" class="text-xs">({{ t('charges.status.draft') }})</span></td>
                  <td class="py-1.5 pr-2">{{ t(`charge.category.${c.category}` as Key) }}</td>
                  <td class="amount py-1.5 pr-2">{{ money(c.amount_cents ?? 0) }}</td>
                  <td class="amount py-1.5">{{ money(c.recoverable_cents ?? 0) }}</td>
                </tr>
              </tbody>
              <tfoot><tr class="font-semibold"><td colspan="2" class="py-2">{{ t('charges.total') }}</td><td class="amount py-2">{{ money(sum.amount) }}</td><td class="amount py-2" data-test="recon-recoverable">{{ money(sum.recoverable) }}</td></tr></tfoot>
            </table>
            <div v-if="s.canWrite && (state === 'draft' || state === 'allocated')" class="flex justify-end">
              <span :title="sum.drafts ? t('charges.draftsFirst') : ''">
                <Button :label="state === 'draft' ? t('recon.allocate') : t('recon.reallocate')" icon="pi pi-sitemap" :loading="busy" :disabled="!!sum.drafts" data-test="allocate" @click="act('allocate', 'allocation')" />
              </span>
            </div>
          </template>

          <!-- 2. Allocation -->
          <template v-else-if="step === 'allocation'">
            <p class="text-sm text-slate-600">{{ t('recon.allocationBody', { days: recon.totals?.exercise_days ?? 0 }) }}</p>
            <table class="w-full text-sm" data-test="allocation">
              <thead><tr class="border-b border-slate-300 text-left text-slate-600"><th class="py-1 pr-2 font-medium">{{ t('billing.lease') }}</th><th class="amount py-1 pr-2 font-medium">{{ t('recon.days') }}</th><th class="amount py-1 font-medium">{{ t('recon.share') }}</th></tr></thead>
              <tbody>
                <tr v-for="l in lines" :key="l.id" class="border-b border-slate-200" data-test="allocation-line">
                  <td class="py-1.5 pr-2">{{ names.label(l.lease_id) }}</td>
                  <td class="amount py-1.5 pr-2">{{ l.days }} / {{ recon.totals?.exercise_days }}</td>
                  <td class="amount py-1.5">{{ money(l.allocated_cents ?? 0) }}</td>
                </tr>
                <tr v-if="(recon.totals?.vacancy_days ?? 0) > 0" class="border-b border-slate-200 text-slate-600" data-test="vacancy">
                  <td class="py-1.5 pr-2">{{ t('recon.vacancy') }}</td>
                  <td class="amount py-1.5 pr-2">{{ recon.totals?.vacancy_days }} / {{ recon.totals?.exercise_days }}</td>
                  <td class="amount py-1.5">{{ money(recon.totals?.vacancy_cents ?? 0) }}</td>
                </tr>
              </tbody>
            </table>
          </template>

          <!-- 3. Balances -->
          <template v-else-if="step === 'balances'">
            <p class="text-sm text-slate-600">{{ t('recon.balancesBody') }}</p>
            <table class="w-full text-sm" data-test="balances">
              <thead><tr class="border-b border-slate-300 text-left text-slate-600"><th class="py-1 pr-2 font-medium">{{ t('billing.lease') }}</th><th class="amount py-1 pr-2 font-medium">{{ t('recon.share') }}</th><th class="amount py-1 pr-2 font-medium">{{ t('recon.provisions') }}</th><th class="py-1 font-medium">{{ t('recon.balance') }}</th></tr></thead>
              <tbody>
                <tr v-for="l in lines" :key="l.id" class="border-b border-slate-200 align-top" data-test="balance-line">
                  <td class="py-1.5 pr-2">{{ names.label(l.lease_id) }}</td>
                  <td class="amount py-1.5 pr-2">{{ money(l.allocated_cents ?? 0) }}</td>
                  <td class="amount py-1.5 pr-2">{{ money(l.provisions_cents ?? 0) }}</td>
                  <td class="py-1.5">
                    <span :class="(l.balance_cents ?? 0) > 0 ? 'font-medium text-orange-800' : (l.balance_cents ?? 0) < 0 ? 'font-medium text-emerald-800' : ''" data-test="balance">{{ balanceText(l.balance_cents ?? 0) }}</span>
                    <span v-if="l.spread" class="mt-1 block text-xs text-slate-600" data-test="spread">{{ t('recon.spread', { n: l.instalments?.length ?? 0, each: money(l.instalments?.[0] ?? 0) }) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </template>

          <!-- 4. Provisions and settlement -->
          <template v-else-if="step === 'provisions'">
            <p class="flex items-center gap-1 text-sm text-slate-600">{{ t('recon.provisionsBody') }} <HelpTip id="recon_prov" :text="t('help.recon.provision')" /></p>
            <div v-for="l in lines" :key="l.id" class="rounded-md border border-slate-200 bg-white p-4" data-test="provision-line">
              <p class="mb-3 font-medium">{{ names.label(l.lease_id) }} <span class="ml-2 text-sm font-normal text-slate-600">{{ balanceText(l.balance_cents ?? 0) }}</span></p>
              <div class="grid items-end gap-4 md:grid-cols-3">
                <FormField :id="`prov_${l.id}`" :help="t('help.recon.newProvision')" :label="t('recon.newProvision')" :hint="t('recon.proposed', { amount: money(l.proposed_provision_cents ?? 0) })">
                  <DecimalInput :id="`prov_${l.id}`" :model-value="provisionOf(l)" suffix="€" :disabled="!editable" @update:model-value="(v) => v != null && saveLine(l, { new_provision_cents: v })" />
                </FormField>
                <div class="flex items-center gap-2 pb-2">
                  <Checkbox :model-value="!!l.apply_provision" :input-id="`apply_${l.id}`" binary :disabled="!editable" @update:model-value="(v) => saveLine(l, { apply_provision: !!v })" />
                  <label :for="`apply_${l.id}`" class="text-sm">{{ t('recon.apply') }}</label>
                </div>
                <FormField :id="`settle_${l.id}`" :help="t('help.recon.settlement')" :label="t('recon.settlementLabel')">
                  <Select
                    :model-value="l.settlement" :input-id="`settle_${l.id}`" :options="settlementOptions" option-label="label" option-value="value" :disabled="!editable" class="w-full"
                    @update:model-value="(v) => saveLine(l, { settlement: v })"
                  />
                </FormField>
              </div>
              <p v-if="savingLine === l.id" class="mt-2 text-xs text-slate-500">{{ t('recon.saving') }}</p>
            </div>
          </template>

          <!-- 5. Issue -->
          <template v-else>
            <template v-if="state === 'allocated'">
              <p class="text-sm text-slate-600">{{ t('recon.issueBody') }}</p>
              <ul class="space-y-2 text-sm" data-test="to-write">
                <li v-for="w in written" :key="w.l.id" class="rounded-md border border-slate-200 bg-white px-4 py-2">
                  <strong>{{ names.label(w.l.lease_id) }}</strong> — {{ t('recon.statement') }} : {{ balanceText(w.l.balance_cents ?? 0) }}
                  <span v-if="(w.l.balance_cents ?? 0) !== 0">, {{ t(`recon.settlement.${w.l.settlement}` as Key) }}<span v-if="w.l.spread"> ({{ t('recon.spreadShort', { n: w.l.instalments?.length ?? 0 }) }})</span></span>
                  <span class="block text-slate-600">{{ w.provision != null ? t('recon.provisionFrom', { amount: money(w.provision) }) : t('recon.provisionKept') }}</span>
                </li>
              </ul>
              <div v-if="s.canWrite" class="flex justify-end"><Button :label="t('recon.issue')" icon="pi pi-send" data-test="issue-recon" @click="ask('issue')" /></div>
            </template>
            <template v-else-if="state === 'issued' || state === 'settled' || state === 'cancelled'">
              <Message v-if="state === 'cancelled'" severity="info" :closable="false" data-test="recon-cancelled">{{ t('recon.cancelledBody', { numbers: (recon.totals?.cancellations ?? []).join(', ') }) }}</Message>
              <div class="space-y-2" data-test="statements">
                <DocumentCard v-for="l in lines.filter((x) => x.number)" :key="l.id" :number="l.number" :label="`${t('recon.statement')} — ${names.label(l.lease_id)}`" :issued-at="recon.issued_at" :document-id="l.document_id" />
              </div>
              <div v-if="s.canWrite && state !== 'cancelled'" class="flex justify-end gap-2">
                <Button v-if="state === 'issued'" :label="t('recon.settle')" severity="secondary" :loading="busy" :title="t('help.recon.settle')" data-test="settle" @click="act('settle')" />
                <Button :label="t('recon.cancel')" severity="danger" outlined data-test="cancel-recon" @click="ask('cancel')" />
              </div>
            </template>
          </template>

          <div class="flex justify-between border-t border-slate-200 pt-3">
            <Button :label="t('recon.back')" icon="pi pi-arrow-left" text :disabled="at === 0" data-test="back" @click="go(steps[at - 1] ?? 'charges')" />
            <Button :label="t('recon.next')" icon="pi pi-arrow-right" icon-pos="right" text :disabled="at === steps.length - 1 || !open(steps[at + 1] ?? 'issue')" data-test="next" @click="go(steps[at + 1] ?? 'issue')" />
          </div>
        </div>

        <aside class="h-fit space-y-2 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm" data-test="summary-rail">
          <p class="font-semibold">{{ t('recon.summary') }}</p>
          <p>{{ t('recon.exercise') }} : {{ date(recon.exercise_start) }} – {{ date(recon.exercise_end) }}</p>
          <p v-if="asset">{{ assetLabel(asset) }}</p>
          <dl class="space-y-1">
            <div class="flex justify-between"><dt>{{ t('charges.total') }}</dt><dd class="amount">{{ money(recon.totals?.total_cents ?? sum.amount) }}</dd></div>
            <div class="flex justify-between"><dt>{{ t('charges.recoverableTotal') }}</dt><dd class="amount" data-test="rail-recoverable">{{ money(recon.totals?.recoverable_cents ?? sum.recoverable) }}</dd></div>
            <div class="flex justify-between"><dt>{{ t('recon.nonRecoverable') }}</dt><dd class="amount">{{ money(recon.totals?.non_recoverable_cents ?? sum.amount - sum.recoverable) }}</dd></div>
            <div v-if="(recon.totals?.vacancy_cents ?? 0) > 0" class="flex justify-between"><dt>{{ t('recon.vacancy') }}</dt><dd class="amount">{{ money(recon.totals?.vacancy_cents ?? 0) }}</dd></div>
          </dl>
          <p class="text-slate-600">{{ t('recon.leases', { n: lines.length }) }}</p>
        </aside>
      </div>

      <ConfirmDialog
        v-model:visible="confirmVisible"
        :title="confirming === 'cancel' ? t('recon.cancel') : t('recon.issue')"
        :body="confirming === 'cancel' ? t('recon.cancelBody') : t('recon.issueConfirm', { n: lines.length })"
        :confirm="confirming === 'cancel' ? t('recon.cancel') : t('recon.issue')" :busy="busy" :disabled="confirming === 'cancel' && !reason.trim()"
        @confirm="act(confirming ?? 'issue')"
      >
        <FormField v-if="confirming === 'cancel'" id="recon_reason" :help="t('help.recon.reason')" :label="t('billing.reason')">
          <Textarea id="recon_reason" v-model="reason" rows="3" class="w-full" />
        </FormField>
        <Message v-if="error" severity="error" :closable="false" class="mt-3" data-test="recon-confirm-error">{{ error }}</Message>
      </ConfirmDialog>
    </template>
  </section>
</template>
