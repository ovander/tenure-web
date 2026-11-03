<script setup lang="ts">
// The asset hub's Leases tab: the asset's leases, newest first, and
// « Nouveau bail » for the owner.
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import { useLeases, tenantName, type Lease } from './store'
import { useSession } from '@/stores/session'
import LeaseStateTag from '@/components/LeaseStateTag.vue'
import { t, type Key } from '@/i18n'
import { date, money } from '@/i18n/format'

const props = defineProps<{ assetId: string }>()
const store = useLeases()
const s = useSession()
const router = useRouter()
const rows = ref<Lease[] | null>(null)

onMounted(async () => {
  const [p] = await Promise.all([store.list({ asset_id: props.assetId }), store.loadTenants().catch(() => [])])
  rows.value = [...p.items].sort((a, b) => (b.start_on ?? '').localeCompare(a.start_on ?? ''))
})
</script>

<template>
  <div class="space-y-3">
    <div class="flex justify-end">
      <RouterLink v-if="s.canWrite" :to="`/leases/new?asset_id=${assetId}`"><Button :label="t('lease.new')" icon="pi pi-plus" size="small" data-test="new-lease" /></RouterLink>
    </div>
    <DataTable :value="rows ?? []" :loading="rows === null" size="small" data-key="id" row-hover class="cursor-pointer" data-test="asset-leases" @row-click="(e) => router.push(`/leases/${e.data.id}`)">
      <template #empty>{{ t('lease.none') }}</template>
      <Column :header="t('lease.kind')"><template #body="{ data }">{{ t(`lease.kind.${data.kind}` as Key) }}</template></Column>
      <Column :header="t('lease.tenants')"><template #body="{ data }">{{ (data.tenants ?? []).map((x: { tenant_id?: string }) => tenantName(store.tenants[x.tenant_id ?? ''])).join(' · ') }}</template></Column>
      <Column :header="t('lease.startOn')"><template #body="{ data }">{{ date(data.start_on) }}</template></Column>
      <Column :header="t('lease.rent')" class="amount"><template #body="{ data }">{{ money(data.rent_cents ?? 0) }}</template></Column>
      <Column :header="t('guarantee.status')"><template #body="{ data }"><LeaseStateTag :state="data.state" /></template></Column>
    </DataTable>
  </div>
</template>
