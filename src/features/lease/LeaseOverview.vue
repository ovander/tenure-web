<script setup lang="ts">
// The hub's overview: assets, tenants, terms and the IRL revision, which an
// owner can compute and apply from here (RevisionDialog, Q-W23).
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import { useSession } from '@/stores/session'
import { useLeases, amendable, tenantName, type Lease, type Tenant } from './store'
import TenantDialog from './TenantDialog.vue'
import RevisionDialog from './RevisionDialog.vue'
import type { RevisionView } from '@/features/billing/store'
import { useAssets, assetLabel } from '@/features/portfolio/store'
import { t, type Key } from '@/i18n'
import { date, hundredths, money } from '@/i18n/format'
import { getNotice, type Notice } from './notice'

const props = defineProps<{ lease: Lease }>()
const emit = defineEmits<{ changed: [] }>()
const store = useLeases()
const s = useSession()
const toast = useToast()
const editing = ref<Tenant | null>(null)
function updated(): void {
  toast.add({ severity: 'success', summary: t('common.saved'), life: 3000 })
}
const assets = useAssets()
const l = computed(() => props.lease)
const revising = ref(false)
const canRevise = computed(() => s.canWrite && amendable(l.value) && !!l.value.irl_ref_quarter)
function revised(v: RevisionView): void {
  const n = v.notice?.number
  toast.add({ severity: 'success', summary: n ? t('revision.done', { number: n }) : t('revision.doneNoNotice'), life: 5000 })
  emit('changed')
}
// The recorded notice, for a lease under notice or after; not for an
// accountant (it may name a repossession's beneficiary).
const notice = ref<Notice | null>(null)
watch(() => [l.value.id, l.value.state], async () => {
  notice.value = null
  if (s.role === 'accountant' || !l.value.id || !['notice', 'ended', 'closed'].includes(l.value.state ?? '')) return
  notice.value = await getNotice(l.value.id).catch(() => null)
}, { immediate: true })
const monthly = computed(() => (l.value.rent_cents ?? 0) + (l.value.provision_cents ?? 0))
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-2">
    <section class="rounded-md border border-slate-200 bg-white p-5">
      <h2 class="mb-3 font-medium">{{ t('lease.assets') }}</h2>
      <ul class="space-y-1 text-sm" data-test="lease-assets">
        <li v-for="a in l.asset_ids" :key="a">
          <RouterLink :to="`/assets/${a}`" class="text-emerald-800 hover:underline">{{ assets.byId[a] ? assetLabel(assets.byId[a]!) : a }}</RouterLink>
          <span v-for="r in (l.rent_breakdown ?? []).filter((x) => x.asset_id === a)" :key="r.asset_id" class="amount ml-2 text-slate-600">{{ money(r.rent_cents ?? 0) }}</span>
        </li>
      </ul>
      <h2 class="mb-3 mt-5 font-medium">{{ t('lease.tenants') }}</h2>
      <ul class="space-y-1 text-sm">
        <li v-for="x in l.tenants" :key="x.tenant_id" class="flex flex-wrap items-center gap-x-2" data-test="lease-tenant">
          <span data-test="tenant-name">{{ tenantName(store.tenants[x.tenant_id ?? '']) }}</span>
          <span v-if="x.solidary !== false" class="text-slate-500">· {{ t('overview.solidary') }}</span>
          <span v-if="store.tenants[x.tenant_id ?? '']?.email" class="text-slate-500" data-test="tenant-email">· {{ store.tenants[x.tenant_id ?? '']?.email }}</span>
          <Button
            v-if="s.canWrite && store.tenants[x.tenant_id ?? '']" :label="t('common.edit')" icon="pi pi-pencil" size="small" text data-test="edit-tenant"
            @click="editing = store.tenants[x.tenant_id ?? ''] ?? null"
          />
        </li>
      </ul>
      <TenantDialog v-if="editing" :tenant="editing" @updated="updated" @close="editing = null" />
    </section>
    <section class="rounded-md border border-slate-200 bg-white p-5">
      <div class="mb-3 flex items-center justify-between gap-2">
        <h2 class="font-medium">{{ t('overview.terms') }}</h2>
        <Button v-if="canRevise" :label="t('revision.open')" icon="pi pi-chart-line" size="small" severity="secondary" data-test="revise" @click="revising = true" />
      </div>
      <dl class="grid grid-cols-[12rem_1fr] gap-x-4 gap-y-2 text-sm" data-test="lease-terms">
        <dt class="text-slate-500">{{ t('lease.startOn') }}</dt><dd>{{ date(l.start_on) }}</dd>
        <template v-if="l.end_on"><dt class="text-slate-500">{{ t('lease.endOn') }}</dt><dd>{{ date(l.end_on) }}</dd></template>
        <dt class="text-slate-500">{{ t('lease.term') }}</dt><dd>{{ l.term_months }}</dd>
        <dt class="text-slate-500">{{ t('lease.rent') }}</dt><dd class="amount text-left">{{ money(l.rent_cents ?? 0) }}</dd>
        <dt class="text-slate-500">{{ t('lease.provision') }}</dt><dd class="amount text-left">{{ money(l.provision_cents ?? 0) }}</dd>
        <dt class="text-slate-500">{{ t('overview.monthly') }}</dt><dd class="amount text-left font-semibold">{{ money(monthly) }} · {{ t('overview.dueDay', { day: l.due_day ?? '' }) }}</dd>
        <dt class="text-slate-500">{{ t('lease.deposit') }}</dt><dd class="amount text-left">{{ money(l.deposit_cents ?? 0) }}</dd>
        <template v-if="l.irl_ref_quarter">
          <dt class="text-slate-500">{{ t('overview.irl') }}</dt>
          <dd>{{ t('overview.irlLine', { quarter: l.irl_ref_quarter, value: hundredths(l.irl_ref_value ?? 0), month: t(`month.${l.revision_month}` as Key) }) }}</dd>
        </template>
        <template v-if="l.mobility_reason"><dt class="text-slate-500">{{ t('lease.mobilityReason') }}</dt><dd>{{ t(`mobility.${l.mobility_reason}` as Key) }}</dd></template>
      </dl>
      <RevisionDialog v-if="revising" v-model:visible="revising" :lease="l" @applied="revised" />
    </section>
    <section v-if="notice" class="rounded-md border border-orange-200 bg-white p-5 lg:col-span-2" data-test="notice-card">
      <h2 class="mb-3 font-medium">{{ t('notice.recorded') }}</h2>
      <dl class="grid grid-cols-[12rem_1fr] gap-x-4 gap-y-2 text-sm">
        <dt class="text-slate-500">{{ t('notice.givenBy') }}</dt><dd data-test="notice-given-by">{{ t(`notice.by.${notice.given_by}` as Key) }}</dd>
        <template v-if="notice.ground?.reason">
          <dt class="text-slate-500">{{ t('notice.reasonLabel') }}</dt>
          <dd data-test="notice-ground">{{ t((notice.given_by === 'owner' ? `notice.owner.${notice.ground.reason}` : `notice.reason.${notice.ground.reason}`) as Key) }}</dd>
        </template>
        <dt class="text-slate-500">{{ t('notice.receivedOn') }}</dt><dd>{{ date(notice.received_on) }} · {{ t(`notice.delivery.${notice.delivery}` as Key) }}<template v-if="notice.tracking_ref"> · {{ notice.tracking_ref }}</template></dd>
        <dt class="text-slate-500">{{ t('notice.period') }}</dt><dd>{{ t('notice.months', { months: notice.months ?? 0 }) }}</dd>
        <dt class="text-slate-500">{{ t('lease.endOn') }}</dt><dd class="font-semibold" data-test="notice-end">{{ date(notice.end_on) }}</dd>
      </dl>
    </section>
  </div>
</template>
