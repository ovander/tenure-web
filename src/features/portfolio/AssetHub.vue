<script setup lang="ts">
// S03 Asset hub: breadcrumb, then tabs in the URL
// (/assets/{id}/(overview|leases|charges|documents|activity)). Overview and
// Activity are built; the others arrive with their slices.
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { ApiError } from '@/api/client'
import { useAssets, assetLabel, type Asset } from './store'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'
import AssetOverview from './AssetOverview.vue'
import AssetActivity from './AssetActivity.vue'
import ComingSoonPanel from '@/components/ComingSoonPanel.vue'
import AssetLeases from '@/features/lease/AssetLeases.vue'
import ChargesLedger from '@/features/charges/ChargesLedger.vue'

const route = useRoute()
const store = useAssets()
const s = useSession()
const asset = ref<Asset | null>(null)
const missing = ref(false)
const id = computed(() => route.params.id as string)
const tab = computed(() => (route.params.tab as string) || 'overview')
// Audit events are readable by the owner and the accountant (tenure-api
// GuardAuditReaders; Q-W8).
const tabs = computed(() =>
  (['overview', 'leases', 'charges', 'documents', 'activity'] as const).filter((x) => x !== 'activity' || s.role !== 'co_owner'),
)

async function load(): Promise<void> {
  missing.value = false
  try {
    asset.value = await store.get(id.value)
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) missing.value = true
    else throw e
  }
}
onMounted(load)
watch(id, load)
</script>

<template>
  <section class="max-w-6xl space-y-4">
    <nav class="text-sm text-slate-500" aria-label="breadcrumb">
      <RouterLink to="/assets" class="hover:underline">{{ t('assets.title') }}</RouterLink>
      <span class="mx-2">›</span>
      <span class="text-slate-700" data-test="crumb">{{ asset ? assetLabel(asset) : '' }}</span>
    </nav>
    <Message v-if="missing" severity="warn" :closable="false" data-test="asset-missing">{{ t('hub.notFound') }}</Message>
    <Skeleton v-else-if="!asset" height="8rem" />
    <template v-else>
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-xl font-semibold" data-test="asset-title">{{ assetLabel(asset) }}</h1>
          <p class="text-sm text-slate-500">{{ t(`kind.${asset.kind}` as Key) }}</p>
        </div>
        <RouterLink v-if="s.canWrite" :to="`/assets/${asset.id}/edit`">
          <Button :label="t('common.edit')" icon="pi pi-pencil" severity="secondary" data-test="edit-asset" />
        </RouterLink>
      </div>
      <nav class="flex gap-1 border-b border-slate-200" role="tablist">
        <RouterLink
          v-for="x in tabs"
          :key="x"
          :to="`/assets/${asset.id}/${x}`"
          role="tab"
          :aria-selected="tab === x"
          class="-mb-px border-b-2 px-4 py-2 text-sm"
          :class="tab === x ? 'border-emerald-600 font-medium text-emerald-800' : 'border-transparent text-slate-600 hover:text-slate-900'"
          :data-test="`tab-${x}`"
        >
          {{ t(`hub.${x}` as Key) }}
        </RouterLink>
      </nav>
      <AssetOverview v-if="tab === 'overview'" :asset="asset" />
      <AssetLeases v-else-if="tab === 'leases'" :asset-id="asset.id ?? ''" />
      <AssetActivity v-else-if="tab === 'activity'" :asset-id="asset.id ?? ''" />
      <ChargesLedger v-else-if="tab === 'charges'" :asset-id="asset.id ?? ''" embedded />
      <ComingSoonPanel v-else />
    </template>
  </section>
</template>
