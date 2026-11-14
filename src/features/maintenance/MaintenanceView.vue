<script setup lang="ts">
// Maintenance and incidents (RENT-SPEC-015; tenure-api Q-130, Q-131; Q-W40):
// the incidents from report to invoice, the recurring maintenance with its
// visits, and the contractors. A tab per list; the owner writes, the other
// roles read.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useSession } from '@/stores/session'
import { assetLabel, useAssets } from '@/features/portfolio/store'
import { t, type Key } from '@/i18n'
import { date, isoDay, money } from '@/i18n/format'
import ContractorDialog from './ContractorDialog.vue'
import IncidentDialog from './IncidentDialog.vue'
import TransitionDialog from './TransitionDialog.vue'
import ContractDialog from './ContractDialog.vue'
import VisitDialog from './VisitDialog.vue'
import {
  actions, contractors as listContractors, contracts as listContracts, dueState, editable, incidents as listIncidents, statusSeverity,
  type Action, type Contract, type Contractor, type Incident,
} from './maintenance'

const route = useRoute()
const s = useSession()
const assets = useAssets()
const tabs = ['incidents', 'contracts', 'contractors'] as const
const tab = computed(() => (route.params.tab as (typeof tabs)[number]) || 'incidents')

const incidents = ref<Incident[] | null>(null)
const contracts = ref<Contract[] | null>(null)
const contractors = ref<Contractor[]>([])
const openOnly = ref(true)
const today = isoDay(new Date()) ?? ''

async function load(): Promise<void> {
  const [i, c, k] = await Promise.all([listIncidents({ open: openOnly.value }), listContracts(), listContractors(), assets.list(1, 100)])
  incidents.value = i
  contracts.value = c
  contractors.value = k
}
onMounted(load)
watch(openOnly, async (v) => (incidents.value = await listIncidents({ open: v })))

const contractorName = (id?: string) => contractors.value.find((c) => c.id === id)?.name ?? ''
const assetName = (id?: string) => {
  const a = id ? assets.byId[id] : undefined
  return a ? assetLabel(a) : ''
}

const incidentDialog = ref(false)
const editingIncident = ref<Incident | null>(null)
const transitionDialog = ref(false)
const moving = ref<Incident | null>(null)
const action = ref<Action | null>(null)
const contractorDialog = ref(false)
const editingContractor = ref<Contractor | null>(null)
const contractDialog = ref(false)
const editingContract = ref<Contract | null>(null)
const visitDialog = ref(false)
const visiting = ref<Contract | null>(null)

function report(i: Incident | null): void {
  editingIncident.value = i
  incidentDialog.value = true
}
function move(i: Incident, a: Action): void {
  moving.value = i
  action.value = a
  transitionDialog.value = true
}
function editContractor(c: Contractor | null): void {
  editingContractor.value = c
  contractorDialog.value = true
}
function editContract(c: Contract | null): void {
  editingContract.value = c
  contractDialog.value = true
}
function visit(c: Contract): void {
  visiting.value = c
  visitDialog.value = true
}
const dueSeverity = { overdue: 'danger', soon: 'warn', later: 'secondary', none: 'secondary' } as const
</script>

<template>
  <section class="max-w-6xl space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold">{{ t('maintenance.heading') }}</h1>
      <div v-if="s.canWrite" class="flex gap-2">
        <Button v-if="tab === 'incidents'" :label="t('maintenance.incidentAdd')" icon="pi pi-plus" data-test="incident-add" @click="report(null)" />
        <Button v-if="tab === 'contracts'" :label="t('maintenance.contractAdd')" icon="pi pi-plus" data-test="contract-add" @click="editContract(null)" />
        <Button v-if="tab === 'contractors'" :label="t('maintenance.contractorAdd')" icon="pi pi-plus" data-test="contractor-add" @click="editContractor(null)" />
      </div>
    </div>
    <nav class="flex gap-1 border-b border-slate-200" role="tablist">
      <RouterLink
        v-for="x in tabs" :key="x" :to="`/maintenance/${x}`" role="tab" :aria-selected="tab === x"
        class="-mb-px border-b-2 px-4 py-2 text-sm"
        :class="tab === x ? 'border-emerald-600 font-medium text-emerald-800' : 'border-transparent text-slate-600 hover:text-slate-900'"
        :data-test="`tab-${x}`"
      >
        {{ t(`maintenance.tab.${x}` as Key) }}
      </RouterLink>
    </nav>

    <template v-if="tab === 'incidents'">
      <div class="flex items-center justify-between gap-3">
        <p class="text-sm text-slate-600">{{ t('maintenance.incidentsIntro') }}</p>
        <label class="flex items-center gap-2 text-sm whitespace-nowrap">
          <Checkbox v-model="openOnly" binary input-id="open_only" data-test="open-only" /> {{ t('maintenance.openOnly') }}
        </label>
      </div>
      <Skeleton v-if="!incidents" height="6rem" />
      <Message v-else-if="!incidents.length" severity="secondary" :closable="false" data-test="incidents-empty">{{ t('maintenance.incidentsEmpty') }}</Message>
      <article v-for="i in incidents ?? []" :key="i.id" class="rounded-md border border-slate-200 bg-white p-4" data-test="incident">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-1">
            <h3 class="font-semibold" data-test="incident-title">
              {{ i.title }}
              <Tag :value="t(`maintenance.status.${i.status}` as Key)" :severity="statusSeverity(i.status)" class="ml-2" data-test="incident-status" />
              <Tag v-if="i.urgency === 'urgent'" :value="t('maintenance.urgency.urgent')" severity="danger" class="ml-1" />
            </h3>
            <p class="text-sm text-slate-600">
              {{ assetName(i.asset_id) }} · {{ t('maintenance.reportedLine', { on: date(i.reported_on), by: t(`maintenance.reportedBy.${i.reported_by}` as Key), channel: t(`maintenance.channel.${i.channel}` as Key) }) }}
            </p>
            <p v-if="i.description" class="text-sm text-slate-700">{{ i.description }}</p>
            <p class="text-xs text-slate-500" data-test="incident-facts">
              <span v-if="i.contractor_id">{{ contractorName(i.contractor_id) }}</span>
              <span v-if="i.quote_cents"> · {{ t('maintenance.quoteLine', { amount: money(i.quote_cents) }) }}</span>
              <span v-if="i.scheduled_on"> · {{ t('maintenance.scheduledLine', { on: date(i.scheduled_on) }) }}</span>
              <span v-if="i.done_on"> · {{ t('maintenance.doneLine', { on: date(i.done_on) }) }}</span>
              <span v-if="(i.photo_document_ids ?? []).length"> · {{ t('maintenance.photos', { n: i.photo_document_ids?.length ?? 0 }) }}</span>
            </p>
            <p v-if="i.status === 'invoiced'" class="text-sm" data-test="incident-invoice">
              {{ t('maintenance.invoiceLine', { amount: money(i.invoice_cents ?? 0) }) }}<span v-if="i.treatment === 'repair'"> — {{ t('maintenance.repairCharged') }} <RouterLink to="/charges" class="text-emerald-700 underline" data-test="incident-charge">{{ t('maintenance.seeCharges') }}</RouterLink></span>
              <span v-else> — {{ t('maintenance.improvementCapitalised') }}</span>
            </p>
            <p v-if="i.status === 'cancelled' && i.cancel_reason" class="text-sm text-slate-500">{{ i.cancel_reason }}</p>
          </div>
          <div v-if="s.canWrite" class="flex flex-wrap gap-2">
            <Button v-if="editable(i.status)" :label="t('common.edit')" icon="pi pi-pencil" severity="secondary" size="small" data-test="incident-edit" @click="report(i)" />
            <Button
              v-for="a in actions(i.status)" :key="a" :label="t(`maintenance.action.${a}` as Key)" size="small"
              :severity="a === 'cancel' ? 'danger' : a === 'invoice' || a === 'done' ? undefined : 'secondary'" :text="a === 'cancel'"
              :data-test="`incident-${a}`" @click="move(i, a)"
            />
          </div>
        </div>
      </article>
    </template>

    <template v-else-if="tab === 'contracts'">
      <p class="text-sm text-slate-600">{{ t('maintenance.contractsIntro') }}</p>
      <Skeleton v-if="!contracts" height="6rem" />
      <Message v-else-if="!contracts.length" severity="secondary" :closable="false" data-test="contracts-empty">{{ t('maintenance.contractsEmpty') }}</Message>
      <div v-else class="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table class="w-full text-sm" data-test="contracts">
          <thead class="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th class="px-3 py-2">{{ t('maintenance.title') }}</th><th>{{ t('maintenance.asset') }}</th><th>{{ t('maintenance.interval') }}</th>
              <th>{{ t('maintenance.responsibleLabel') }}</th><th>{{ t('maintenance.lastDone') }}</th><th>{{ t('maintenance.nextDue') }}</th><th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in contracts" :key="c.id" class="border-t border-slate-100" data-test="contract">
              <td class="px-3 py-2"><span class="font-medium">{{ c.title }}</span> <span class="text-xs text-slate-500">{{ t(`maintenance.kind.${c.kind}` as Key) }}</span><br><span v-if="c.contractor_id" class="text-xs text-slate-500">{{ contractorName(c.contractor_id) }}</span></td>
              <td>{{ assetName(c.asset_id) }}</td>
              <td>{{ t('maintenance.everyMonths', { n: c.interval_months ?? 0 }) }}</td>
              <td>{{ t(`maintenance.responsible.${c.responsible}` as Key) }}</td>
              <td data-test="contract-last">{{ c.last_done_on ? date(c.last_done_on) : '—' }}</td>
              <td data-test="contract-next">
                <Tag v-if="c.next_due_on" :value="date(c.next_due_on)" :severity="dueSeverity[dueState(c, today)]" />
                <span v-else class="text-slate-500">{{ t('maintenance.ended') }}</span>
                <span v-if="dueState(c, today) === 'overdue'" class="ml-1 text-xs text-red-700" data-test="contract-overdue">{{ t('calendar.overdue') }}</span>
              </td>
              <td class="px-3 text-right whitespace-nowrap">
                <template v-if="s.canWrite">
                  <Button :label="t('maintenance.visitAdd')" icon="pi pi-check-square" size="small" severity="secondary" :disabled="!c.next_due_on" data-test="contract-visit" @click="visit(c)" />
                  <Button icon="pi pi-pencil" size="small" text :aria-label="t('common.edit')" data-test="contract-edit" @click="editContract(c)" />
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-else>
      <Message v-if="!contractors.length" severity="secondary" :closable="false" data-test="contractors-empty">{{ t('maintenance.contractorsEmpty') }}</Message>
      <div v-else class="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table class="w-full text-sm" data-test="contractors">
          <thead class="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th class="px-3 py-2">{{ t('maintenance.contractorName') }}</th><th>{{ t('maintenance.trade') }}</th><th>{{ t('maintenance.email') }}</th><th>{{ t('maintenance.phone') }}</th><th /></tr>
          </thead>
          <tbody>
            <tr v-for="c in contractors" :key="c.id" class="border-t border-slate-100" data-test="contractor">
              <td class="px-3 py-2 font-medium">{{ c.name }}</td><td>{{ c.trade }}</td>
              <td><a v-if="c.email" :href="`mailto:${c.email}`" class="text-emerald-700 underline">{{ c.email }}</a></td><td>{{ c.phone }}</td>
              <td class="px-3 text-right"><Button v-if="s.canWrite" icon="pi pi-pencil" size="small" text :aria-label="t('common.edit')" data-test="contractor-edit" @click="editContractor(c)" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <IncidentDialog v-model:visible="incidentDialog" :incident="editingIncident" @saved="load" />
    <TransitionDialog v-model:visible="transitionDialog" :incident="moving" :action="action" :contractors="contractors" @saved="load" />
    <ContractorDialog v-model:visible="contractorDialog" :contractor="editingContractor" @saved="load" />
    <ContractDialog v-model:visible="contractDialog" :contract="editingContract" :contractors="contractors" @saved="load" />
    <VisitDialog v-model:visible="visitDialog" :contract="visiting" @saved="load" />
  </section>
</template>
