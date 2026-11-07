<script setup lang="ts">
// The notice of a current lease (RENT-SPEC-010; tenure-api Q-118; Q-W33).
// The tenant's: received on a date, with its reduced-notice ground if any
// and its letter uploaded; the end is computed by the API before saving.
// The owner's: a ground, the protected-tenant answer, the term it reaches
// and the last day of receipt, then the CG letter; once delivered, its
// reception is recorded on that letter.
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import DayInput from '@/components/DayInput.vue'
import DecimalInput from '@/components/DecimalInput.vue'
import FilePicker from '@/components/FilePicker.vue'
import { useProblemForm } from '@/app/form'
import { t, type Key } from '@/i18n'
import { date, parisToday } from '@/i18n/format'
import { download, useLeases, type Lease, type LeaseDocument } from './store'
import {
  deliveries, giveNotice, letterInput, ownerMayGive, ownerReasons, prepareLetter, protectedAnswers, relationships, tenantReasons,
  type NoticeResult, type NoticeTerms, type OwnerReason,
} from './notice'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ lease: Lease }>()
const emit = defineEmits<{ saved: [r: NoticeResult] }>()
const store = useLeases()

const givenBy = ref<'tenant' | 'owner'>('tenant')
const reason = ref('')
const receivedOn = ref<string | null>(parisToday())
const delivery = ref<string>('registered_letter')
const sentOn = ref<string | null>(null)
const tracking = ref('')
const file = ref<File | null>(null)
const terms = ref<NoticeTerms | null>(null)
// The owner's ground.
const ownerReason = ref<OwnerReason>('repossession')
const price = ref<number | null | undefined>(null)
const badPrice = ref(false)
const conditions = ref('')
const beneficiary = ref('')
const relationship = ref('')
const address = ref('')
const grounds = ref('')
const protectedTenant = ref('')
const letterTerms = ref<NoticeTerms | null>(null)
const letter = ref<LeaseDocument | null>(null)
const { errors, summary, busy, submit, reset } = useProblemForm()

watch(visible, async (v) => {
  if (!v) return
  reset()
  givenBy.value = 'tenant'
  reason.value = ''
  receivedOn.value = parisToday()
  delivery.value = 'registered_letter'
  sentOn.value = null
  tracking.value = ''
  file.value = null
  terms.value = letterTerms.value = null
  ownerReason.value = 'repossession'
  price.value = null
  conditions.value = beneficiary.value = relationship.value = address.value = grounds.value = protectedTenant.value = ''
  // A letter already prepared for this lease is the one to record on.
  const docs = await store.documents(props.lease.id ?? '').catch(() => [] as LeaseDocument[])
  letter.value = docs.filter((d) => d.kind === 'owner_notice').at(-1) ?? null
}, { immediate: true })
// What changes the computed end clears it.
watch([givenBy, reason, receivedOn], () => (terms.value = null))
watch([ownerReason, price, conditions, beneficiary, relationship, address, grounds, protectedTenant], () => (letterTerms.value = null))

const whoOptions = computed(() => [
  { value: 'tenant', label: t('notice.by.tenant') },
  { value: 'owner', label: t('notice.by.owner'), disabled: !ownerMayGive(props.lease.kind) },
])
const reasonOptions = [{ value: '', label: t('notice.reason.none') }, ...tenantReasons.map((r) => ({ value: r, label: t(`notice.reason.${r}` as Key) }))]
const ownerOptions = ownerReasons.map((r) => ({ value: r, label: t(`notice.owner.${r}` as Key) }))
const relOptions = relationships.map((r) => ({ value: r, label: t(`notice.rel.${r}` as Key) }))
const deliveryOptions = deliveries.map((d) => ({ value: d, label: t(`notice.delivery.${d}` as Key) }))
const protectedOptions = protectedAnswers.map((p) => ({ value: p, label: t(`notice.protected.${p}` as Key) }))

function input(dryRun: boolean, documentId?: string) {
  return {
    given_by: givenBy.value, reason: givenBy.value === 'tenant' ? reason.value || undefined : undefined,
    received_on: receivedOn.value ?? undefined, delivery: delivery.value as (typeof deliveries)[number],
    sent_on: sentOn.value ?? undefined, tracking_ref: tracking.value.trim() || undefined, document_id: documentId, dry_run: dryRun,
  }
}
function receptionChecks(): Record<string, string> {
  const local: Record<string, string> = {}
  if (!receivedOn.value) local.received_on = t('notice.receivedRequired')
  return local
}

async function compute(): Promise<void> {
  const ok = await submit(async () => {
    terms.value = (await giveNotice(props.lease.id ?? '', input(true, givenBy.value === 'owner' ? letter.value?.document_id : undefined))).terms ?? null
  }, receptionChecks())
  if (!ok) terms.value = null
}

async function save(): Promise<void> {
  let saved: NoticeResult | undefined
  const local = receptionChecks()
  if (givenBy.value === 'owner' && !letter.value) local.document_id = t('notice.letterFirst')
  const ok = await submit(async () => {
    let doc = givenBy.value === 'owner' ? letter.value?.document_id : undefined
    if (givenBy.value === 'tenant' && file.value) doc = (await store.upload('notice', props.lease, file.value)).id
    saved = await giveNotice(props.lease.id ?? '', input(false, doc))
  }, local)
  if (ok && saved) {
    visible.value = false
    emit('saved', saved)
  }
}

function groundChecks(): Record<string, string> {
  const local: Record<string, string> = {}
  if (!protectedTenant.value) local.protected_tenant = t('notice.protectedRequired')
  if (ownerReason.value === 'sale') {
    if (badPrice.value) local.price_cents = t('common.invalidNumber')
    else if (!price.value) local.price_cents = t('notice.priceRequired')
  }
  if (ownerReason.value === 'repossession') {
    if (!beneficiary.value.trim()) local['beneficiary.name'] = t('notice.beneficiaryRequired')
    if (!relationship.value) local['beneficiary.relationship'] = t('notice.relationshipRequired')
    if (!address.value.trim()) local['beneficiary.address'] = t('notice.addressRequired')
  }
  if (ownerReason.value === 'legitimate' && !grounds.value.trim()) local.grounds = t('notice.groundsRequired')
  return local
}
function ground(dryRun: boolean) {
  return letterInput(ownerReason.value, { priceCents: price.value, conditions: conditions.value, name: beneficiary.value, relationship: relationship.value,
    address: address.value, grounds: grounds.value, protectedTenant: protectedTenant.value }, dryRun)
}
async function previewLetter(): Promise<void> {
  const ok = await submit(async () => {
    letterTerms.value = (await prepareLetter(props.lease.id ?? '', ground(true))).terms ?? null
  }, groundChecks())
  if (!ok) letterTerms.value = null
}
async function issueLetter(): Promise<void> {
  await submit(async () => {
    const r = await prepareLetter(props.lease.id ?? '', ground(false))
    letterTerms.value = r.terms ?? null
    letter.value = r.letter ?? null
  }, groundChecks())
}
const warning = computed(() => (terms.value?.warnings ?? []).map((w) => t(`notice.warning.${w}` as Key)).join(' '))
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="t('notice.title')" class="w-[38rem]" data-test="notice-dialog">
    <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
    <div class="space-y-4">
      <FormField id="notice_by" :help="t('help.notice.givenBy')" :label="t('notice.givenBy')">
        <Select v-model="givenBy" input-id="notice_by" :options="whoOptions" option-label="label" option-value="value" option-disabled="disabled" class="w-full" data-test="notice-by" />
      </FormField>

      <template v-if="givenBy === 'tenant'">
        <FormField id="notice_reason" :help="t('help.notice.reason')" :label="t('notice.reasonLabel')" :error="errors.reason">
          <Select v-model="reason" input-id="notice_reason" :options="reasonOptions" option-label="label" option-value="value" class="w-full" data-test="notice-reason" />
        </FormField>
        <FormField id="notice_letter" :help="t('help.notice.tenantLetter')" :label="`${t('notice.tenantLetter')} (${t('common.optional')})`">
          <FilePicker id="notice_letter" v-model="file" accept="application/pdf,image/jpeg,image/png" />
        </FormField>
      </template>

      <template v-else>
        <Message v-if="letter" severity="info" :closable="false" data-test="notice-letter">
          {{ t('notice.letterReady', { number: letter.number ?? '' }) }}
          <Button :label="t('doc.download')" icon="pi pi-download" text size="small" data-test="notice-letter-download" @click="download(letter.document_id ?? '')" />
        </Message>
        <section v-else class="space-y-4 rounded-md border border-slate-200 p-4" data-test="notice-ground">
          <FormField id="notice_owner_reason" :help="t('help.notice.ownerReason')" :label="t('notice.ownerReason')" :error="errors.reason">
            <Select v-model="ownerReason" input-id="notice_owner_reason" :options="ownerOptions" option-label="label" option-value="value" class="w-full" data-test="notice-owner-reason" />
          </FormField>
          <template v-if="ownerReason === 'sale'">
            <FormField id="notice_price" :help="t('help.notice.price')" :label="t('notice.price')" :error="errors.price_cents">
              <DecimalInput id="notice_price" v-model="price" suffix="€" :invalid="!!errors.price_cents" @invalid-input="(b) => (badPrice = b)" />
            </FormField>
            <FormField id="notice_conditions" :help="t('help.notice.conditions')" :label="`${t('notice.conditions')} (${t('common.optional')})`">
              <Textarea id="notice_conditions" v-model="conditions" rows="2" class="w-full" />
            </FormField>
          </template>
          <template v-else-if="ownerReason === 'repossession'">
            <FormField id="notice_beneficiary" :help="t('help.notice.beneficiary')" :label="t('notice.beneficiary')" :error="errors['beneficiary.name']">
              <InputText id="notice_beneficiary" v-model="beneficiary" class="w-full" :invalid="!!errors['beneficiary.name']" />
            </FormField>
            <FormField id="notice_rel" :help="t('help.notice.relationship')" :label="t('notice.relationship')" :error="errors['beneficiary.relationship']">
              <Select v-model="relationship" input-id="notice_rel" :options="relOptions" option-label="label" option-value="value" class="w-full" :invalid="!!errors['beneficiary.relationship']" />
            </FormField>
            <FormField id="notice_address" :help="t('help.notice.address')" :label="t('notice.address')" :error="errors['beneficiary.address']">
              <InputText id="notice_address" v-model="address" class="w-full" :invalid="!!errors['beneficiary.address']" />
            </FormField>
          </template>
          <FormField v-else id="notice_grounds" :help="t('help.notice.grounds')" :label="t('notice.grounds')" :error="errors.grounds">
            <Textarea id="notice_grounds" v-model="grounds" rows="3" class="w-full" :invalid="!!errors.grounds" />
          </FormField>
          <FormField id="notice_protected" :help="t('help.notice.protected')" :label="t('notice.protectedLabel')" :error="errors.protected_tenant">
            <Select v-model="protectedTenant" input-id="notice_protected" :options="protectedOptions" option-label="label" option-value="value" :placeholder="t('notice.choose')" class="w-full" :invalid="!!errors.protected_tenant" data-test="notice-protected" />
          </FormField>
          <p v-if="letterTerms" class="text-sm" data-test="letter-terms">
            {{ t('notice.letterTerms', { end: date(letterTerms.end_on), latest: date(letterTerms.latest_receipt_on), months: letterTerms.months ?? 0 }) }}
          </p>
          <div class="flex justify-end gap-2">
            <Button :label="t('notice.previewLetter')" severity="secondary" :loading="busy" data-test="letter-preview" @click="previewLetter" />
            <Button :label="t('notice.issueLetter')" icon="pi pi-file" :loading="busy" data-test="letter-issue" @click="issueLetter" />
          </div>
        </section>
      </template>

      <template v-if="givenBy === 'tenant' || letter">
        <div class="grid gap-4 sm:grid-cols-2">
          <FormField id="notice_received" :help="t('help.notice.receivedOn')" :label="t('notice.receivedOn')" :error="errors.received_on">
            <DayInput id="notice_received" v-model="receivedOn" :invalid="!!errors.received_on" />
          </FormField>
          <FormField id="notice_delivery" :help="t('help.notice.delivery')" :label="t('notice.deliveryLabel')" :error="errors.delivery">
            <Select v-model="delivery" input-id="notice_delivery" :options="deliveryOptions" option-label="label" option-value="value" class="w-full" />
          </FormField>
          <FormField id="notice_sent" :help="t('help.notice.sentOn')" :label="`${t('notice.sentOn')} (${t('common.optional')})`" :error="errors.sent_on">
            <DayInput id="notice_sent" v-model="sentOn" />
          </FormField>
          <FormField id="notice_tracking" :help="t('help.notice.tracking')" :label="`${t('notice.tracking')} (${t('common.optional')})`" :error="errors.tracking_ref">
            <InputText id="notice_tracking" v-model="tracking" class="w-full" />
          </FormField>
        </div>
        <Message v-if="terms" severity="success" :closable="false" data-test="notice-terms">
          {{ t('notice.ends', { end: date(terms.end_on), months: terms.months ?? 0 }) }}<template v-if="terms.reduced"> {{ t('notice.reducedNote') }}</template>
        </Message>
        <Message v-if="warning" severity="warn" :closable="false" data-test="notice-warning">{{ warning }}</Message>
      </template>
    </div>
    <div class="mt-6 flex justify-end gap-2">
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <template v-if="givenBy === 'tenant' || letter">
        <Button :label="t('notice.compute')" severity="secondary" :loading="busy" data-test="notice-compute" @click="compute" />
        <Button :label="t('notice.record')" icon="pi pi-check" :loading="busy" data-test="save-notice" @click="save" />
      </template>
    </div>
  </Dialog>
</template>
