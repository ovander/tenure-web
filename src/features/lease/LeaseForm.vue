<script setup lang="ts">
// S06 Lease form: drafts a lease (/leases/new?asset_id=…) or edits a draft
// (/leases/{id}/edit). Amounts in euros sent as cents, the IRL value in
// hundredths; a mobility lease needs its reason; several assets need a rent
// per asset adding up to the rent. Legal checks (deposit cap, DPE, ceilings)
// are the API's and show as blockers on the hub.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import Checkbox from 'primevue/checkbox'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import FormField from '@/components/FormField.vue'
import HelpTip from '@/components/HelpTip.vue'
import DecimalInput from '@/components/DecimalInput.vue'
import DayInput from '@/components/DayInput.vue'
import TenantDialog from './TenantDialog.vue'
import { useProblemForm } from '@/app/form'
import { useAssets, assetLabel, type Asset } from '@/features/portfolio/store'
import { Suggestions, depositFor, firstOfNextMonth, monthOf, termFor } from './defaults'
import { latestIRL, param, type LeaseTerms, type Range } from '@/features/params/store'
import { useLeases, toLeaseInput, tenantName, vettedClauses, mobilityReasons, type Lease, type LeaseInput, type LeaseKind, type Tenant } from './store'
import { t, type Key } from '@/i18n'
import { useLatest } from '@/lib/async'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const leases = useLeases()
const assets = useAssets()
const id = computed(() => route.params.id as string | undefined)
const existing = ref<Lease | null>(null)
const allAssets = ref<Asset[]>([])
const allTenants = ref<Tenant[]>([])
const addingTenant = ref(false)
const bad = reactive<Record<string, boolean>>({})
const form = reactive<LeaseInput>({
  kind: 'unfurnished', asset_ids: [], tenants: [], term_months: undefined, due_day: undefined, revision_month: undefined, clauses: [],
  rent_cents: undefined, provision_cents: 0, deposit_cents: undefined, irl_ref_quarter: '', irl_ref_value: undefined,
})
const breakdown = reactive<Record<string, number | null | undefined>>({})

async function reload(): Promise<void> {
  if (!id.value) return
  existing.value = await leases.get(id.value)
  Object.assign(form, toLeaseInput(existing.value))
  for (const r of existing.value.rent_breakdown ?? []) if (r.asset_id) breakdown[r.asset_id] = r.rent_cents
}
const { errors, summary, busy, submit } = useProblemForm(reload)

// Defaults of a new lease (#11): each follows its source until the user
// changes the field; the legal ones come from the API's parameters as of the
// start date, never from code.
const suggest = new Suggestions<LeaseInput>()
const legal = reactive<{ terms?: LeaseTerms; mobility?: Range; caps: Record<string, number | undefined>; asOf?: string }>({ caps: {} })
// Only the parameters of the latest start date are kept: those of a date the
// owner already changed are dropped when they answer late. It resolves false
// only for such a dropped answer, so the defaults are not proposed from it.
const latestLegal = useLatest()
async function loadLegal(asOf: string | undefined): Promise<boolean> {
  if (!asOf) {
    // A cleared date drops any answer still pending for the previous one.
    latestLegal.next()
    legal.asOf = undefined
    return false
  }
  if (legal.asOf === asOf) return true
  legal.asOf = asOf
  const token = latestLegal.next()
  const [terms, mobility, unf, fur, mob] = await Promise.all([
    param<LeaseTerms>('lease_term_months', asOf),
    param<Range>('mobility_term_months', asOf),
    param<number>('deposit_max_months.unfurnished', asOf),
    param<number>('deposit_max_months.furnished', asOf),
    param<number>('deposit_max_months.mobility', asOf),
  ])
  if (!latestLegal.isLatest(token)) return false
  Object.assign(legal, { terms, mobility, caps: { unfurnished: unf, furnished: fur, mobility: mob } })
  return true
}
function proposeLegal(): void {
  if (id.value) return
  suggest.propose(form, 'term_months', termFor(form.kind, legal.terms, legal.mobility))
  suggest.propose(form, 'deposit_cents', depositFor(form.kind, form.rent_cents, legal.caps[form.kind ?? '']))
  suggest.propose(form, 'revision_month', monthOf(form.start_on))
}
const termHelp = computed(() => (termFor(form.kind, legal.terms, legal.mobility) === undefined && !id.value ? t('help.lease.termNone') : t('help.lease.term')))
watch(() => form.start_on, async (d) => {
  if (await loadLegal(d ?? undefined)) proposeLegal()
})
watch(() => [form.kind, form.rent_cents], proposeLegal)

onMounted(async () => {
  const [a, ts] = await Promise.all([assets.list(1, 100), leases.loadTenants()])
  allAssets.value = a.items
  allTenants.value = ts
  await reload()
  if (!id.value) {
    suggest.propose(form, 'start_on', firstOfNextMonth())
    suggest.propose(form, 'due_day', 1)
    const irl = await latestIRL()
    suggest.propose(form, 'irl_ref_quarter', irl?.quarter)
    suggest.propose(form, 'irl_ref_value', irl?.value)
  }
  const from = route.query.asset_id as string | undefined
  if (!id.value && from) {
    form.asset_ids = [from]
    if (assets.byId[from]?.kind === 'box') form.kind = 'box'
    else if (assets.byId[from]?.furnished) form.kind = 'furnished'
  }
})

const kinds = computed(() => (['unfurnished', 'furnished', 'mobility', 'box'] as LeaseKind[]).map((k) => ({ value: k, label: t(`lease.kind.${k}` as Key) })))
const assetOptions = computed(() => allAssets.value.map((a) => ({ value: a.id, label: `${assetLabel(a)} (${t(`kind.${a.kind}` as Key)})` })))
const tenantOptions = computed(() => allTenants.value.map((x) => ({ value: x.id, label: tenantName(x) })))
const reasons = mobilityReasons.map((r) => ({ value: r, label: t(`mobility.${r}` as Key) }))
const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: t(`month.${i + 1}` as Key) }))
const exemptions = [
  { value: '', label: t('lease.exemptionNone') },
  { value: 'works', label: t('lease.exemption.works') },
  { value: 'under_valued', label: t('lease.exemption.under_valued') },
]
// The exemption lifts the relocation rule, which applies in a zone tendue (Q-W14).
const tense = computed(() => (form.asset_ids ?? []).some((a) => assets.byId[a]?.tense_zone || assets.byId[a]?.controlled_zone))
const tenantIds = computed({
  get: () => (form.tenants ?? []).map((x) => x.tenant_id ?? ''),
  set: (ids: string[]) => {
    const old = new Map((form.tenants ?? []).map((x) => [x.tenant_id, x]))
    form.tenants = ids.map((tid) => old.get(tid) ?? { tenant_id: tid, solidary: true })
  },
})
const clauses = computed({
  get: () => ((form.clauses ?? []) as { code?: string }[]).map((c) => c.code ?? ''),
  // The schema types clauses as free objects; tenure-api reads [{ code }].
  set: (codes: string[]) => (form.clauses = codes.map((code) => ({ code })) as unknown as LeaseInput["clauses"]),
})
const exemption = computed({ get: () => form.rent_exemption ?? '', set: (v: string) => (form.rent_exemption = (v || undefined) as LeaseInput['rent_exemption']) })
watch(() => form.kind, (k) => {
  if (k !== 'mobility') form.mobility_reason = undefined
})

function tenantCreated(x: Tenant): void {
  allTenants.value.push(x)
  if (x.id) tenantIds.value = [...tenantIds.value, x.id]
}

async function save(): Promise<void> {
  const local: Record<string, string> = {}
  for (const [k, v] of Object.entries(bad)) if (v) local[k] = t('common.invalidNumber')
  const body: LeaseInput = { ...form }
  if ((form.asset_ids ?? []).length > 1) body.rent_breakdown = (form.asset_ids ?? []).map((a) => ({ asset_id: a, rent_cents: breakdown[a] ?? 0 }))
  else body.rent_breakdown = undefined
  if (!tense.value) body.rent_exemption = undefined
  let saved: Lease | undefined
  const ok = await submit(async () => {
    saved = existing.value?.id ? await leases.update(existing.value.id, body, existing.value.version ?? 0) : await leases.create(body)
  }, local)
  if (ok && saved?.id) {
    toast.add({ severity: 'success', summary: t('common.saved'), life: 3000 })
    await router.push(`/leases/${saved.id}`)
  }
}
</script>

<template>
  <section class="max-w-4xl">
    <h1 class="mb-6 text-xl font-semibold">{{ id ? t('lease.edit') : t('lease.new') }}</h1>
    <form class="space-y-5" novalidate data-test="lease-form" @submit.prevent="save">
      <Message v-if="summary" severity="error" :closable="false" data-test="form-error">{{ summary }}</Message>
      <FormField id="lease_kind" :help="t('help.lease.kind')" :label="t('lease.kind')" :error="errors.kind">
        <Select v-model="form.kind" input-id="lease_kind" :options="kinds" option-label="label" option-value="value" class="w-72" />
      </FormField>
      <FormField v-if="form.kind === 'mobility'" id="mobility_reason" :help="t('help.lease.mobilityReason')" :label="t('lease.mobilityReason')" :error="errors.mobility_reason">
        <Select v-model="form.mobility_reason" input-id="mobility_reason" :options="reasons" option-label="label" option-value="value" class="w-72" :invalid="!!errors.mobility_reason" />
      </FormField>
      <div class="grid gap-5 md:grid-cols-2">
        <FormField id="lease_assets" :help="t('help.lease.assets')" :label="t('lease.assets')" :error="errors.asset_ids">
          <MultiSelect v-model="form.asset_ids" input-id="lease_assets" :options="assetOptions" option-label="label" option-value="value" display="chip" :invalid="!!errors.asset_ids" />
        </FormField>
        <FormField id="lease_tenants" :help="t('help.lease.tenants')" :label="t('lease.tenants')" :error="errors.tenants">
          <div class="flex gap-2">
            <MultiSelect v-model="tenantIds" input-id="lease_tenants" :options="tenantOptions" option-label="label" option-value="value" display="chip" class="min-w-0 flex-1" :invalid="!!errors.tenants" />
            <Button :title="t('lease.addTenant')" type="button" icon="pi pi-user-plus" severity="secondary" :aria-label="t('lease.addTenant')" data-test="add-tenant" @click="addingTenant = true" />
          </div>
        </FormField>
        <FormField id="start_on" :help="t('help.lease.startOn')" :label="t('lease.startOn')" :error="errors.start_on">
          <DayInput id="start_on" v-model="form.start_on" :invalid="!!errors.start_on" />
        </FormField>
        <FormField id="term_months" :help="termHelp" :label="t('lease.term')" :error="errors.term_months">
          <InputNumber v-model="form.term_months" input-id="term_months" :min="1" :use-grouping="false" :invalid="!!errors.term_months" />
        </FormField>
        <FormField id="rent" :help="t('help.lease.rent')" :label="t('lease.rent')" :error="errors.rent_cents">
          <DecimalInput id="rent" v-model="form.rent_cents" suffix="€" :invalid="!!errors.rent_cents" @invalid-input="(b) => (bad.rent_cents = b)" />
        </FormField>
        <FormField id="provision" :help="t('help.lease.provision')" :label="t('lease.provision')" :error="errors.provision_cents">
          <DecimalInput id="provision" v-model="form.provision_cents" suffix="€" :invalid="!!errors.provision_cents" @invalid-input="(b) => (bad.provision_cents = b)" />
        </FormField>
        <FormField id="deposit" :help="t('help.lease.deposit')" :label="t('lease.deposit')" :error="errors.deposit_cents">
          <DecimalInput id="deposit" v-model="form.deposit_cents" suffix="€" :invalid="!!errors.deposit_cents" @invalid-input="(b) => (bad.deposit_cents = b)" />
        </FormField>
        <FormField id="due_day" :help="t('help.lease.dueDay')" :label="t('lease.dueDay')" :error="errors.due_day">
          <InputNumber v-model="form.due_day" input-id="due_day" :min="1" :max="28" :use-grouping="false" :invalid="!!errors.due_day" />
        </FormField>
      </div>
      <div v-if="(form.asset_ids ?? []).length > 1" class="rounded-md border border-slate-200 bg-white p-4" data-test="breakdown">
        <p class="mb-3 text-sm font-medium">{{ t('lease.breakdown') }}</p>
        <div class="grid gap-3 md:grid-cols-2">
          <FormField v-for="a in form.asset_ids" :id="`part_${a}`" :key="a" :help="t('help.lease.breakdown')" :label="assets.byId[a] ? assetLabel(assets.byId[a]!) : a">
            <DecimalInput :id="`part_${a}`" v-model="breakdown[a]" suffix="€" />
          </FormField>
        </div>
        <small class="text-slate-500">{{ t('lease.breakdownHint') }}</small>
      </div>
      <div class="grid gap-5 md:grid-cols-3">
        <FormField id="irl_quarter" :help="t('help.lease.irlQuarter')" :label="t('lease.irlQuarter')" :error="errors.irl_ref_quarter" :hint="t('lease.irlQuarterHint')">
          <InputText id="irl_quarter" v-model="form.irl_ref_quarter" placeholder="2025-Q2" :invalid="!!errors.irl_ref_quarter" />
        </FormField>
        <FormField id="irl_value" :help="t('help.lease.irlValue')" :label="t('lease.irlValue')" :error="errors.irl_ref_value">
          <DecimalInput id="irl_value" v-model="form.irl_ref_value" suffix="IRL" :invalid="!!errors.irl_ref_value" @invalid-input="(b) => (bad.irl_ref_value = b)" />
        </FormField>
        <FormField id="revision_month" :help="t('help.lease.revisionMonth')" :label="t('lease.revisionMonth')" :error="errors.revision_month">
          <Select v-model="form.revision_month" input-id="revision_month" :options="months" option-label="label" option-value="value" />
        </FormField>
      </div>
      <FormField v-if="tense" id="exemption" :help="t('help.lease.exemption')" :label="t('lease.exemption')" :error="errors.rent_exemption">
        <Select v-model="exemption" input-id="exemption" :options="exemptions" option-label="label" option-value="value" class="w-80" />
      </FormField>
      <fieldset v-if="form.kind !== 'box'" class="space-y-2">
        <legend class="mb-1 flex items-center gap-1 text-sm font-medium">{{ t('lease.clauses') }} <HelpTip id="clauses" :text="t('help.lease.clauses')" /></legend>
        <div v-for="c in vettedClauses" :key="c" class="flex items-center gap-2">
          <Checkbox v-model="clauses" :input-id="`clause_${c}`" :value="c" />
          <label :for="`clause_${c}`" class="text-sm">{{ t(`clause.${c}` as Key) }}</label>
        </div>
        <small v-if="errors.clauses" class="text-red-600">{{ errors.clauses }}</small>
      </fieldset>
      <div class="flex gap-2">
        <Button type="submit" :label="t('common.save')" :loading="busy" data-test="save" />
        <RouterLink :to="id ? `/leases/${id}` : (route.query.asset_id ? `/assets/${route.query.asset_id}/leases` : '/assets')">
          <Button :label="t('common.cancel')" severity="secondary" text />
        </RouterLink>
      </div>
    </form>
    <TenantDialog v-if="addingTenant" @created="tenantCreated" @close="addingTenant = false" />
  </section>
</template>
