<script setup lang="ts">
// S01 Home (RENT-FE-001 §3): what needs attention this month — arrears,
// blocked leases and warnings, payments to match, rent calls to issue — each
// with its link, the leases' next dates, and the last job runs. The list is
// built from what the API serves (todos.ts); nothing here writes.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { api } from '@/api/client'
import type { JobRun, Page } from '@/api/types'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'
import { currentPeriod, date, money, parisToday, timestamp } from '@/i18n/format'
import StatusTag from '@/components/StatusTag.vue'
import { useLeases, tenantName, blockerSubject, type Blocker, type Blockers, type Lease } from '@/features/lease/store'
import { useAssets, assetLabel } from '@/features/portfolio/store'
import { useBilling, type Arrears, type BillingDoc, type Payment } from '@/features/billing/store'
import { nextDates, todos, type NextDate, type Todo } from './todos'

const s = useSession()
const leases = useLeases()
const assets = useAssets()
const billing = useBilling()
const runs = ref<JobRun[] | null>(null)
const items = ref<Todo[] | null>(null)
const next = ref<NextDate[]>([])
const failed = ref(false)
const period = currentPeriod()

function monthLabel(p: string): string {
  const [y, m] = p.split('-').map(Number)
  return `${t(`month.${m}` as Key)} ${y}`
}
function label(l: Lease): string {
  const names = (l.tenants ?? []).map((x) => tenantName(leases.tenants[x.tenant_id ?? ''])).filter(Boolean).join(', ')
  const a = l.asset_ids?.[0] ? assets.byId[l.asset_ids[0]] : undefined
  return [names, a ? assetLabel(a) : ''].filter(Boolean).join(' — ') || (l.id ?? '')
}
function named(b: Blocker): string {
  const what = blockerSubject(b, (a) => (assets.byId[a] ? assetLabel(assets.byId[a]) : undefined))
  return [b.title, what].filter(Boolean).join(' — ')
}
const severity = (x: Todo) => (x.severity === 'info' ? 'info' : x.severity === 'error' ? 'error' : 'warn')

async function loadTodos(): Promise<void> {
  let all: Lease[]
  try {
    all = (await leases.list({ size: 100 })).items.filter((l) => l.state !== 'closed')
  } catch {
    failed.value = true
    items.value = []
    return
  }
  const blockers: Record<string, Blockers> = {}
  const arrears: Record<string, Arrears> = {}
  let unmatched: Payment[] = []
  let billed: BillingDoc[] = []
  await Promise.all([
    assets.list(1, 100).catch(() => undefined),
    leases.loadTenants().catch(() => []),
    ...all.filter((l) => l.state !== 'ended').map((l) => leases.blockers(l.id ?? '').then((b) => (blockers[l.id ?? ''] = b)).catch(() => undefined)),
    ...all.filter((l) => l.state !== 'draft').map((l) => billing.arrears(l.id ?? '').then((a) => (arrears[l.id ?? ''] = a)).catch(() => undefined)),
    billing.payments({ unmatched: true, size: 100 }).then((p) => (unmatched = p.items)).catch(() => undefined),
    billing.documents({ period, kind: 'rent_call', size: 100 }).then((p) => (billed = p.items)).catch(() => undefined),
  ])
  items.value = todos({ leases: all, blockers, arrears, unmatched, billed, period, label, named, money, month: monthLabel })
  next.value = nextDates(all, parisToday())
}

onMounted(async () => {
  if (!s.active) {
    runs.value = []
    items.value = []
    return
  }
  await Promise.all([
    loadTodos(),
    api.get<Page<JobRun>>('/jobs/runs', { query: { page: 1, size: 10 } }).then((r) => (runs.value = r.data.items)).catch(() => {
      failed.value = true
      runs.value = []
    }),
  ])
})

const nextText = (d: NextDate) => t(`next.${d.kind}` as Key, { month: monthLabel(d.on.slice(0, 7)) })
const hasItems = computed(() => (items.value ?? []).length > 0)
</script>

<template>
  <section class="max-w-5xl space-y-6">
    <h1 class="text-xl font-semibold" data-test="welcome">{{ t('home.welcome', { name: s.displayName }) }}</h1>

    <Message v-if="!s.me?.owner && !s.active" severity="warn" :closable="false" data-test="no-profile">
      {{ t('home.noProfile') }}
      <RouterLink to="/settings/profile" class="ml-2 font-medium underline">{{ t('home.createProfile') }}</RouterLink>
    </Message>

    <template v-if="s.active">
      <Message v-if="failed" severity="error" :closable="false">{{ t('error.network') }}</Message>

      <div>
        <div class="mb-2 flex items-center justify-between gap-3">
          <h2 class="font-medium">{{ t('home.todos') }}</h2>
          <RouterLink :to="`/billing/${period}`">
            <Button :label="t('home.openBilling', { month: monthLabel(period) })" size="small" outlined icon="pi pi-calculator" data-test="open-billing" />
          </RouterLink>
        </div>
        <div v-if="items === null" class="space-y-2" data-test="todos-loading">
          <Skeleton v-for="i in 3" :key="i" height="2.5rem" />
        </div>
        <ul v-else-if="hasItems" class="space-y-2" data-test="todos">
          <li v-for="x in items" :key="x.id" data-test="todo" :data-kind="x.id.split('-')[0]">
            <Message :severity="severity(x)" :closable="false">
              <RouterLink :to="x.to" class="underline-offset-2 hover:underline" data-test="todo-link">{{ t(x.key, x.params) }}</RouterLink>
            </Message>
          </li>
        </ul>
        <p v-else class="text-sm text-slate-500" data-test="todos-none">{{ t('home.todos.none') }}</p>
      </div>

      <div>
        <h2 class="mb-2 font-medium">{{ t('home.next') }}</h2>
        <ul v-if="next.length" class="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white text-sm" data-test="next">
          <li v-for="d in next" :key="`${d.kind}-${d.lease.id}`" class="flex flex-wrap items-center gap-x-4 px-4 py-2" data-test="next-date">
            <span class="w-24 font-mono">{{ date(d.on) }}</span>
            <span class="w-64">{{ nextText(d) }}</span>
            <RouterLink :to="`/leases/${d.lease.id}/overview`" class="text-emerald-800 hover:underline">{{ label(d.lease) }}</RouterLink>
          </li>
        </ul>
        <p v-else-if="items !== null" class="text-sm text-slate-500" data-test="next-none">{{ t('home.next.none') }}</p>
      </div>

      <div>
        <h2 class="mb-2 font-medium">{{ t('home.runs') }}</h2>
        <div v-if="runs === null" class="space-y-2">
          <Skeleton v-for="i in 3" :key="i" height="2rem" />
        </div>
        <DataTable v-else :value="runs" size="small" data-test="runs">
          <template #empty>{{ t('home.runs.empty') }}</template>
          <Column field="job" :header="t('home.runs.job')" />
          <Column field="period" :header="t('home.runs.period')" />
          <Column :header="t('home.runs.status')">
            <template #body="{ data }"><StatusTag :status="data.status" /></template>
          </Column>
          <Column :header="t('home.runs.finished')">
            <template #body="{ data }">{{ timestamp(data.finished_at) }}</template>
          </Column>
        </DataTable>
      </div>
    </template>
  </section>
</template>
