<script setup lang="ts">
// The hub's overview: assets, tenants, terms and the IRL revision.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useLeases, tenantName, type Lease } from './store'
import { useAssets, assetLabel } from '@/features/portfolio/store'
import { t, type Key } from '@/i18n'
import { date, hundredths, money } from '@/i18n/format'

const props = defineProps<{ lease: Lease }>()
const store = useLeases()
const assets = useAssets()
const l = computed(() => props.lease)
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
        <li v-for="x in l.tenants" :key="x.tenant_id">
          {{ tenantName(store.tenants[x.tenant_id ?? '']) }}
          <span v-if="x.solidary !== false" class="text-slate-500">· {{ t('overview.solidary') }}</span>
        </li>
      </ul>
    </section>
    <section class="rounded-md border border-slate-200 bg-white p-5">
      <h2 class="mb-3 font-medium">{{ t('overview.terms') }}</h2>
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
    </section>
  </div>
</template>
