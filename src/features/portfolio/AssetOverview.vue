<script setup lang="ts">
// The hub's overview: details, ownership shares, diagnostics.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { useAssets, assetLabel, type Asset, type Diagnostic } from './store'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'
import { basisPoints, date, money, surface } from '@/i18n/format'
import DiagnosticDialog from './DiagnosticDialog.vue'

const props = defineProps<{ asset: Asset }>()
const store = useAssets()
const s = useSession()
const editing = ref<Diagnostic | null | undefined>(undefined) // undefined: closed; null: new
const diagnostics = computed(() => store.diagnostics[props.asset.id ?? ''] ?? [])
const parent = computed(() => (props.asset.parent_asset_id ? store.byId[props.asset.parent_asset_id] : undefined))
const dwelling = computed(() => props.asset.kind !== 'box')

onMounted(async () => {
  if (props.asset.id) await store.loadDiagnostics(props.asset.id)
  if (props.asset.parent_asset_id && !parent.value) await store.get(props.asset.parent_asset_id).catch(() => undefined)
})

function ownerName(ownerId: string | undefined): string {
  return s.scopes.find((x) => x.owner_id === ownerId)?.legal_name ?? ownerId?.slice(0, 8) ?? ''
}

const details = computed(() => {
  const a = props.asset
  const rows: [Key, string][] = [[ 'assets.address', a.address ?? '' ]]
  if (a.lot) rows.push(['assets.lot', a.lot])
  if (dwelling.value) {
    rows.push(['assets.surface', surface(a.surface_hundredths_m2)])
    rows.push(['assets.furnished', a.furnished ? t('common.yes') : t('common.no')])
    rows.push(['assets.dpe', a.dpe_class || t('common.none')])
    rows.push(['hub.controlledZone', a.controlled_zone ? `${a.rent_control_zone} · ${a.rent_control_category}` : t('common.no')])
  }
  if (a.acquired_on) rows.push(['hub.acquired', date(a.acquired_on)])
  if (a.acquisition_cents != null) rows.push(['hub.acquisition', money(a.acquisition_cents)])
  return rows
})
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-3">
    <div class="space-y-6 lg:col-span-2">
      <section class="rounded-md border border-slate-200 bg-white p-5">
        <h2 class="mb-3 font-medium">{{ t('hub.details') }}</h2>
        <dl class="grid grid-cols-[12rem_1fr] gap-x-4 gap-y-2 text-sm" data-test="details">
          <template v-for="[k, v] in details" :key="k">
            <dt class="text-slate-500">{{ t(k) }}</dt>
            <dd>{{ v }}</dd>
          </template>
          <template v-if="asset.kind === 'box' && parent">
            <dt class="text-slate-500">{{ t('assets.parent') }}</dt>
            <dd><RouterLink :to="`/assets/${parent.id}`" class="text-emerald-800 hover:underline">{{ assetLabel(parent) }}</RouterLink></dd>
          </template>
        </dl>
      </section>

      <section v-if="dwelling" class="rounded-md border border-slate-200 bg-white p-5">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="font-medium">{{ t('diag.title') }}</h2>
          <Button v-if="s.canWrite" :label="t('diag.add')" icon="pi pi-plus" size="small" severity="secondary" data-test="add-diagnostic" @click="editing = null" />
        </div>
        <DataTable :value="diagnostics" size="small" data-key="id" data-test="diagnostics">
          <template #empty>{{ t('diag.empty') }}</template>
          <Column :header="t('diag.kind')">
            <template #body="{ data }">{{ t(`diag.kind.${data.kind}` as Key) }}</template>
          </Column>
          <Column :header="t('diag.doneOn')">
            <template #body="{ data }">
              <Tag v-if="data.not_required_reason" v-tooltip="data.not_required_reason" severity="secondary" :value="t('diag.notRequired')" />
              <span v-else>{{ date(data.done_on) }}</span>
            </template>
          </Column>
          <Column :header="t('diag.validUntil')">
            <template #body="{ data }">{{ date(data.valid_until) }}</template>
          </Column>
          <Column field="result" :header="t('diag.result')" />
          <Column v-if="s.canWrite" class="w-16">
            <template #body="{ data }">
              <Button icon="pi pi-pencil" text size="small" :aria-label="t('common.edit')" data-test="edit-diagnostic" @click="editing = data" />
            </template>
          </Column>
        </DataTable>
      </section>
    </div>

    <section class="h-fit rounded-md border border-slate-200 bg-white p-5">
      <h2 class="mb-3 font-medium">{{ t('hub.shares') }}</h2>
      <table class="w-full text-sm" data-test="shares">
        <tbody>
          <tr v-for="sh in asset.shares ?? []" :key="sh.owner_id">
            <td class="py-1">{{ ownerName(sh.owner_id) }}</td>
            <td class="amount py-1">{{ basisPoints(sh.bp ?? 0) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <DiagnosticDialog
      v-if="editing !== undefined && asset.id"
      :asset-id="asset.id"
      :diagnostic="editing"
      @close="editing = undefined"
    />
  </div>
</template>
