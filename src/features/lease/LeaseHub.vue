<script setup lang="ts">
// S05 Lease hub: breadcrumb asset › lease, state, the blockers at the top
// (RENT-FE-001 §1 « blocked, not surprised »), the lifecycle actions each
// confirmed, and the tabs in the URL. A blocked action stays visible,
// disabled, with its blocker named.
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { useToast } from 'primevue/usetoast'
import { ApiError } from '@/api/client'
import { useLeases, nextActions, tenantName, type Action, type Blockers, type Lease } from './store'
import { useAssets, assetLabel } from '@/features/portfolio/store'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'
import LeaseStateTag from '@/components/LeaseStateTag.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DayInput from '@/components/DayInput.vue'
import FormField from '@/components/FormField.vue'
import ComingSoonPanel from '@/components/ComingSoonPanel.vue'
import LeaseOverview from './LeaseOverview.vue'
import LeaseContract from './LeaseContract.vue'
import LeaseGuarantees from './LeaseGuarantees.vue'
import LeaseInventories from './LeaseInventories.vue'

const route = useRoute()
const toast = useToast()
const store = useLeases()
const assets = useAssets()
const s = useSession()
const lease = ref<Lease | null>(null)
const blockers = ref<Blockers>({})
const missing = ref(false)
const confirming = ref<Action | 'generate' | null>(null)
const endOn = ref<string | null>(null)
const busy = ref(false)
const error = ref('')
const id = computed(() => route.params.id as string)
const tab = computed(() => (route.params.tab as string) || 'overview')
const tabs = ['overview', 'contract', 'guarantees', 'billing', 'inventories'] as const
const firstAsset = computed(() => (lease.value?.asset_ids?.[0] ? assets.byId[lease.value.asset_ids[0]] : undefined))

async function load(): Promise<void> {
  missing.value = false
  try {
    lease.value = await store.get(id.value)
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) {
      missing.value = true
      return
    }
    throw e
  }
  await Promise.all([
    store.blockers(id.value).then((b) => (blockers.value = b)).catch(() => (blockers.value = {})),
    ...(lease.value.asset_ids ?? []).filter((a) => !assets.byId[a]).map((a) => assets.get(a).catch(() => undefined)),
    store.loadTenants().catch(() => []),
  ])
}
onMounted(load)
watch(id, load)

const actions = computed(() => (lease.value?.state ? nextActions[lease.value.state] : []))
// The API answers why an action is refused; the hub shows the activation
// blockers before the click.
function blockedBy(a: Action): string | undefined {
  if (a === 'activate') return blockers.value.activation?.[0]?.title
  return undefined
}

async function run(): Promise<void> {
  if (!lease.value?.id || !confirming.value) return
  busy.value = true
  error.value = ''
  try {
    if (confirming.value === 'generate') await store.generateContract(lease.value.id)
    else lease.value = await store.transition(lease.value.id, confirming.value, endOn.value ?? undefined)
    toast.add({ severity: 'success', summary: t('common.saved'), life: 3000 })
    confirming.value = null
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? [e.problem.title, e.problem.detail].filter(Boolean).join(' ') : t('error.network')
  } finally {
    busy.value = false
  }
}
function ask(a: Action | 'generate'): void {
  error.value = ''
  endOn.value = null
  confirming.value = a
}
const confirmVisible = computed({ get: () => confirming.value !== null, set: (v: boolean) => (confirming.value = v ? confirming.value : null) })
const confirmLabel = computed(() => (confirming.value === 'generate' ? t('action.generate') : confirming.value ? t(`action.${confirming.value}` as Key) : ''))
const confirmBody = computed(() => (confirming.value ? t(`confirm.${confirming.value}` as Key) : ''))
</script>

<template>
  <section class="max-w-6xl space-y-4">
    <nav class="text-sm text-slate-500" aria-label="breadcrumb">
      <RouterLink to="/assets" class="hover:underline">{{ t('assets.title') }}</RouterLink>
      <template v-if="firstAsset">
        <span class="mx-2">›</span>
        <RouterLink :to="`/assets/${firstAsset.id}/leases`" class="hover:underline" data-test="crumb-asset">{{ assetLabel(firstAsset) }}</RouterLink>
      </template>
      <span class="mx-2">›</span>
      <span class="text-slate-700">{{ t('lease.title') }}</span>
    </nav>
    <Message v-if="missing" severity="warn" :closable="false" data-test="lease-missing">{{ t('lease.notFound') }}</Message>
    <Skeleton v-else-if="!lease" height="8rem" />
    <template v-else>
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="flex items-center gap-3 text-xl font-semibold" data-test="lease-title">
            {{ t(`lease.kind.${lease.kind}` as Key) }}
            <LeaseStateTag :state="lease.state" />
          </h1>
          <p class="text-sm text-slate-500" data-test="lease-tenants">{{ (lease.tenants ?? []).map((x) => tenantName(store.tenants[x.tenant_id ?? ''])).join(' · ') }}</p>
        </div>
        <div v-if="s.canWrite" class="flex flex-wrap gap-2">
          <RouterLink v-if="lease.state === 'draft'" :to="`/leases/${lease.id}/edit`">
            <Button :label="t('common.edit')" icon="pi pi-pencil" severity="secondary" data-test="edit-lease" />
          </RouterLink>
          <span v-if="lease.state === 'draft'" v-tooltip.bottom="blockers.generation?.[0]?.title">
            <Button :label="t('action.generate')" icon="pi pi-file" severity="secondary" :disabled="!!blockers.generation?.length" data-test="generate" @click="ask('generate')" />
          </span>
          <span v-for="a in actions" :key="a" v-tooltip.bottom="blockedBy(a)">
            <Button :label="t(`action.${a}` as Key)" :disabled="!!blockedBy(a)" :data-test="`action-${a}`" @click="ask(a)" />
          </span>
        </div>
      </div>

      <div v-if="s.canWrite" class="space-y-2" data-test="blockers">
        <Message v-if="blockers.generation?.length" severity="warn" :closable="false" data-test="blockers-generation">
          <strong>{{ t('blockers.generation') }}</strong>
          <ul class="ml-5 list-disc"><li v-for="b in blockers.generation" :key="b.type">{{ b.title }} <span v-if="b.detail" class="text-slate-600">({{ b.detail }})</span></li></ul>
        </Message>
        <Message v-if="blockers.activation?.length" severity="warn" :closable="false" data-test="blockers-activation">
          <strong>{{ t('blockers.activation') }}</strong>
          <ul class="ml-5 list-disc"><li v-for="b in blockers.activation" :key="b.type">{{ b.title }}</li></ul>
        </Message>
        <Message v-if="blockers.warnings?.length" severity="info" :closable="false" data-test="blockers-warnings">
          <strong>{{ t('blockers.warnings') }}</strong>
          <ul class="ml-5 list-disc"><li v-for="b in blockers.warnings" :key="b.type">{{ b.title }}</li></ul>
        </Message>
      </div>

      <nav class="flex gap-1 border-b border-slate-200" role="tablist">
        <RouterLink
          v-for="x in tabs"
          :key="x"
          :to="`/leases/${lease.id}/${x}`"
          role="tab"
          :aria-selected="tab === x"
          class="-mb-px border-b-2 px-4 py-2 text-sm"
          :class="tab === x ? 'border-emerald-600 font-medium text-emerald-800' : 'border-transparent text-slate-600 hover:text-slate-900'"
          :data-test="`tab-${x}`"
        >
          {{ t(`tab.${x}` as Key) }}
        </RouterLink>
      </nav>
      <LeaseOverview v-if="tab === 'overview'" :lease="lease" />
      <LeaseContract v-else-if="tab === 'contract'" :lease="lease" @changed="load" />
      <LeaseGuarantees v-else-if="tab === 'guarantees'" :lease="lease" @changed="load" />
      <LeaseInventories v-else-if="tab === 'inventories'" :lease="lease" @changed="load" />
      <ComingSoonPanel v-else />

      <ConfirmDialog v-model:visible="confirmVisible" :title="confirmLabel" :body="confirmBody" :confirm="confirmLabel" :busy="busy" :disabled="confirming === 'notice' && !endOn" @confirm="run">
        <FormField v-if="confirming === 'notice'" id="notice_end" :label="t('lease.endOn')">
          <DayInput id="notice_end" v-model="endOn" />
        </FormField>
        <Message v-if="error" severity="error" :closable="false" class="mt-3" data-test="confirm-error">{{ error }}</Message>
      </ConfirmDialog>
    </template>
  </section>
</template>
