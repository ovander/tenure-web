// useLeaseNames names a lease the way the billing screens show it: the
// address of its first asset and its tenants' names.
import { ref } from 'vue'
import { useLeases, tenantName, type Lease } from '@/features/lease/store'
import { useAssets, assetLabel } from '@/features/portfolio/store'

export function useLeaseNames() {
  const leases = useLeases()
  const assets = useAssets()
  const ready = ref(false)

  async function load(): Promise<void> {
    await Promise.all([leases.list({ size: 100 }), leases.loadTenants(), assets.list(1, 100)]).catch(() => undefined)
    ready.value = true
  }

  function label(id: string | undefined): string {
    const l: Lease | undefined = id ? leases.byId[id] : undefined
    if (!l) return id ?? ''
    const a = l.asset_ids?.[0] ? assets.byId[l.asset_ids[0]] : undefined
    const who = (l.tenants ?? []).map((x) => tenantName(leases.tenants[x.tenant_id ?? ''])).filter(Boolean).join(' · ')
    return [a ? assetLabel(a) : '', who].filter(Boolean).join(' — ')
  }

  // billable are the leases that take rent calls and payments.
  function billable(): Lease[] {
    return Object.values(leases.byId).filter((l) => l.state === 'active' || l.state === 'notice')
  }

  return { load, label, billable, ready }
}
