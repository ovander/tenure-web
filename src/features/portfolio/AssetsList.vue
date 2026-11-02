<script setup lang="ts">
// S02 Assets list (RENT-FE-001 §3): every asset of the scope, paged by the
// server; a row opens its hub. Write controls only for the owner (§5).
import { onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import DataTable, { type DataTablePageEvent } from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { useAssets, assetLabel, type Asset } from './store'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'
import { surface } from '@/i18n/format'

const store = useAssets()
const s = useSession()
const route = useRoute()
const router = useRouter()
const size = 20
const rows = ref<Asset[] | null>(null)
const total = ref(0)
const failed = ref(false)
const page = () => Math.max(1, Number(route.query.page) || 1)

async function load(): Promise<void> {
  failed.value = false
  try {
    const p = await store.list(page(), size)
    rows.value = p.items
    total.value = p.total
  } catch {
    failed.value = true
    rows.value = []
  }
}
onMounted(load)
watch(() => route.query.page, load)

function onPage(e: DataTablePageEvent): void {
  void router.push({ query: { ...route.query, page: e.page + 1 } })
}
function parentLabel(a: Asset): string {
  const p = a.parent_asset_id ? store.byId[a.parent_asset_id] : undefined
  return p ? assetLabel(p) : ''
}
</script>

<template>
  <section class="max-w-6xl space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">{{ t('assets.title') }}</h1>
      <RouterLink v-if="s.canWrite" to="/assets/new">
        <Button :label="t('assets.add')" icon="pi pi-plus" data-test="add-asset" />
      </RouterLink>
    </div>
    <Message v-if="failed" severity="error" :closable="false">{{ t('error.network') }}</Message>
    <div v-if="rows === null" class="space-y-2">
      <Skeleton v-for="i in 5" :key="i" height="2.25rem" />
    </div>
    <div v-else-if="rows.length === 0 && !failed" class="rounded-md border border-dashed border-slate-300 bg-white p-10 text-center" data-test="assets-empty">
      <p class="mb-2 font-medium">{{ t('assets.empty') }}</p>
      <template v-if="s.canWrite">
        <p class="mb-4 text-sm text-slate-500">{{ t('assets.emptyAction') }}</p>
        <RouterLink to="/assets/new"><Button :label="t('assets.add')" icon="pi pi-plus" /></RouterLink>
      </template>
    </div>
    <DataTable
      v-else
      :value="rows"
      lazy
      paginator
      :rows="size"
      :total-records="total"
      :first="(page() - 1) * size"
      data-key="id"
      row-hover
      scrollable
      scroll-height="flex"
      size="small"
      class="cursor-pointer"
      data-test="assets"
      @page="onPage"
      @row-click="(e) => router.push(`/assets/${e.data.id}`)"
    >
      <Column :header="t('assets.kind')">
        <template #body="{ data }">{{ t(`kind.${data.kind}` as Key) }}</template>
      </Column>
      <Column :header="t('assets.address')">
        <template #body="{ data }">
          <RouterLink :to="`/assets/${data.id}`" class="font-medium text-emerald-800 hover:underline" @click.stop>{{ assetLabel(data) }}</RouterLink>
        </template>
      </Column>
      <Column :header="t('assets.surface')" class="amount">
        <template #body="{ data }">{{ surface(data.surface_hundredths_m2) }}</template>
      </Column>
      <Column :header="t('assets.furnished')">
        <template #body="{ data }">{{ data.kind === 'box' ? '' : data.furnished ? t('common.yes') : t('common.no') }}</template>
      </Column>
      <Column field="dpe_class" :header="t('assets.dpe')" />
      <Column :header="t('assets.parent')">
        <template #body="{ data }">{{ parentLabel(data) }}</template>
      </Column>
    </DataTable>
  </section>
</template>
