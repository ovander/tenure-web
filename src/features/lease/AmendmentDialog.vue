<script setup lang="ts">
// Amends a current lease (RENT-SPEC-008, tenure-api Q-71, Q-W23): a rent
// change outside IRL, a tenant added (an existing one or one created here),
// or a box of the portfolio added, with an optional new rent. The change
// applies on its effective day and issues the numbered amendment AV-….
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import DecimalInput from '@/components/DecimalInput.vue'
import DayInput from '@/components/DayInput.vue'
import { useProblemForm } from '@/app/form'
import { t, type Key } from '@/i18n'
import { money, parisToday } from '@/i18n/format'
import { useAssets, assetLabel, type Asset } from '@/features/portfolio/store'
import TenantDialog from './TenantDialog.vue'
import { amendmentKinds, tenantName, useLeases, type AmendmentKind, type AmendmentResult, type Lease, type Tenant } from './store'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ lease: Lease }>()
const emit = defineEmits<{ saved: [r: AmendmentResult] }>()
const store = useLeases()
const assets = useAssets()

const kind = ref<AmendmentKind>('rent')
const effectiveOn = ref<string | null>(parisToday())
const rent = ref<number | null | undefined>(null)
const tenantId = ref('')
const assetId = ref('')
const reason = ref('')
const badRent = ref(false)
const addingTenant = ref(false)
const boxes = ref<Asset[]>([])
const { errors, summary, busy, submit, reset } = useProblemForm()

watch(visible, async (v) => {
  if (!v) return
  reset()
  kind.value = 'rent'
  effectiveOn.value = parisToday()
  rent.value = props.lease.rent_cents ?? null
  tenantId.value = ''
  assetId.value = ''
  reason.value = ''
  badRent.value = false
  await Promise.all([
    store.loadTenants().catch(() => []),
    assets.list(1, 100).then((p) => (boxes.value = p.items.filter((a) => a.kind === 'box'))).catch(() => (boxes.value = [])),
  ])
}, { immediate: true })
// A rent change proposes the current rent; an added box keeps it unless
// the owner types a new total.
watch(kind, (k) => {
  rent.value = k === 'rent' ? (props.lease.rent_cents ?? null) : null
})

const kinds = amendmentKinds.map((k) => ({ value: k, label: t(`amendment.kind.${k}` as Key) }))
const onLease = computed(() => new Set((props.lease.tenants ?? []).map((x) => x.tenant_id)))
const tenantOptions = computed(() =>
  Object.values(store.tenants).filter((x) => x.id && !onLease.value.has(x.id)).map((x) => ({ value: x.id ?? '', label: tenantName(x) })),
)
const boxOptions = computed(() =>
  boxes.value.filter((a) => a.id && !(props.lease.asset_ids ?? []).includes(a.id)).map((a) => ({ value: a.id ?? '', label: assetLabel(a) })),
)
function tenantCreated(x: Tenant): void {
  addingTenant.value = false
  if (x.id) tenantId.value = x.id
}

async function save(): Promise<void> {
  const local: Record<string, string> = {}
  if (badRent.value) local.rent_cents = t('common.invalidNumber')
  if (!effectiveOn.value) local.effective_on = t('amendment.effectiveRequired')
  if (kind.value === 'rent' && rent.value == null) local.rent_cents = t('amendment.rentRequired')
  if (kind.value === 'tenant_add' && !tenantId.value) local.tenant = t('amendment.tenantRequired')
  if (kind.value === 'asset_add' && !assetId.value) local.asset_id = t('amendment.boxRequired')
  let saved: AmendmentResult | undefined
  const ok = await submit(async () => {
    saved = await store.amend(props.lease.id ?? '', {
      kind: kind.value,
      effective_on: effectiveOn.value ?? undefined,
      rent_cents: kind.value === 'tenant_add' || rent.value == null ? undefined : rent.value,
      tenant: kind.value === 'tenant_add' ? { tenant_id: tenantId.value } : undefined,
      asset_id: kind.value === 'asset_add' ? assetId.value : undefined,
      reason: reason.value.trim() || undefined,
    })
  }, local)
  if (ok && saved) {
    visible.value = false
    emit('saved', saved)
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="t('amendment.title')" class="w-[34rem]" data-test="amendment-dialog">
    <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
    <p class="mb-4 text-sm leading-6 text-slate-600">{{ t('amendment.intro') }}</p>
    <div class="space-y-4">
      <FormField id="amend_kind" :help="t('help.amendment.kind')" :label="t('amendment.kindLabel')" :error="errors.kind">
        <Select v-model="kind" input-id="amend_kind" :options="kinds" option-label="label" option-value="value" class="w-full" />
      </FormField>
      <FormField id="amend_on" :help="t('help.amendment.effectiveOn')" :label="t('amendment.effectiveOn')" :error="errors.effective_on">
        <DayInput id="amend_on" v-model="effectiveOn" :invalid="!!errors.effective_on" />
      </FormField>
      <FormField v-if="kind === 'tenant_add'" id="amend_tenant" :help="t('help.amendment.tenant')" :label="t('amendment.tenant')" :error="errors.tenant">
        <div class="flex gap-2">
          <Select
            v-model="tenantId" input-id="amend_tenant" :options="tenantOptions" option-label="label" option-value="value"
            :placeholder="t('amendment.chooseTenant')" class="min-w-0 flex-1" :invalid="!!errors.tenant"
          />
          <Button :label="t('lease.addTenant')" icon="pi pi-user-plus" severity="secondary" data-test="amend-new-tenant" @click="addingTenant = true" />
        </div>
      </FormField>
      <FormField v-if="kind === 'asset_add'" id="amend_box" :help="t('help.amendment.box')" :label="t('amendment.box')" :error="errors.asset_id">
        <Select
          v-model="assetId" input-id="amend_box" :options="boxOptions" option-label="label" option-value="value"
          :placeholder="t('amendment.chooseBox')" :empty-message="t('amendment.noBox')" class="w-full" :invalid="!!errors.asset_id"
        />
      </FormField>
      <FormField
        v-if="kind !== 'tenant_add'" id="amend_rent" :error="errors.rent_cents"
        :help="t(kind === 'rent' ? 'help.amendment.rent' : 'help.amendment.boxRent')"
        :label="kind === 'rent' ? t('amendment.newRent') : `${t('amendment.newRent')} (${t('common.optional')})`"
        :hint="t('amendment.currentRent', { amount: money(lease.rent_cents ?? 0) })"
      >
        <DecimalInput id="amend_rent" v-model="rent" suffix="€" :invalid="!!errors.rent_cents" @invalid-input="(b) => (badRent = b)" />
      </FormField>
      <FormField id="amend_reason" :help="t('help.amendment.reason')" :label="`${t('amendment.reason')} (${t('common.optional')})`" :error="errors.reason">
        <Textarea id="amend_reason" v-model="reason" rows="2" class="w-full" />
      </FormField>
    </div>
    <div class="mt-6 flex justify-end gap-2">
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button :label="t('amendment.issue')" icon="pi pi-file" :loading="busy" data-test="save-amendment" @click="save" />
    </div>
  </Dialog>
  <TenantDialog v-if="addingTenant" @created="tenantCreated" @close="addingTenant = false" />
</template>
