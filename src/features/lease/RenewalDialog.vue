<script setup lang="ts">
// The owner's proposal of a new rent at the renewal of an unfurnished lease
// (RENT-SPEC-010; tenure-api Q-120; Q-W35): the new rent and its
// references, computed by the API (the renewal it reaches, the last day of
// receipt, the zone tendue cap, the yearly steps), then the PR letter.
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import DecimalInput from '@/components/DecimalInput.vue'
import HelpTip from '@/components/HelpTip.vue'
import { useProblemForm } from '@/app/form'
import { t } from '@/i18n'
import { basisPoints, date, money } from '@/i18n/format'
import type { Lease } from './store'
import { prepareRenewal, references, type ReferenceRow, type RenewalLetter, type RenewalTerms } from './renewal'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ lease: Lease }>()
const emit = defineEmits<{ saved: [r: RenewalLetter] }>()

const proposed = ref<number | null | undefined>(null)
const badProposed = ref(false)
const large = ref(false)
const rows = ref<ReferenceRow[]>([])
const terms = ref<RenewalTerms | null>(null)
const { errors, summary, busy, submit, reset } = useProblemForm()
const blank = (): ReferenceRow => ({ address: '', description: '', rentCents: null })

watch(visible, (v) => {
  if (!v) return
  reset()
  proposed.value = null
  large.value = false
  rows.value = [blank(), blank(), blank()]
  terms.value = null
}, { immediate: true })
watch([proposed, large, rows], () => (terms.value = null), { deep: true })

function checks(): Record<string, string> {
  const local: Record<string, string> = {}
  if (badProposed.value) local.proposed_rent_cents = t('common.invalidNumber')
  else if (!proposed.value) local.proposed_rent_cents = t('renewal.proposedRequired')
  if (references(rows.value).incomplete) local.references = t('renewal.reference.incomplete')
  return local
}
function input(dryRun: boolean) {
  return { proposed_rent_cents: proposed.value ?? 0, references: references(rows.value).refs, large_agglomeration: large.value, dry_run: dryRun }
}
async function preview(): Promise<void> {
  const ok = await submit(async () => {
    terms.value = (await prepareRenewal(props.lease.id ?? '', input(true))).terms ?? null
  }, checks())
  if (!ok) terms.value = null
}
async function issue(): Promise<void> {
  let r: RenewalLetter | undefined
  const ok = await submit(async () => {
    r = await prepareRenewal(props.lease.id ?? '', input(false))
  }, checks())
  if (ok && r) {
    visible.value = false
    emit('saved', r)
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="t('renewal.propose')" class="w-[44rem]" data-test="renewal-dialog">
    <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
    <p class="mb-4 text-sm text-slate-600">{{ t('renewal.intro') }}</p>
    <div class="space-y-4">
      <FormField id="renewal_proposed" :help="t('help.renewal.proposed')" :label="t('renewal.proposed')" :error="errors.proposed_rent_cents">
        <DecimalInput id="renewal_proposed" v-model="proposed" suffix="€" :invalid="!!errors.proposed_rent_cents" data-test="renewal-proposed" @invalid-input="(b) => (badProposed = b)" />
      </FormField>
      <section>
        <h3 class="mb-2 flex items-center gap-1 text-sm font-medium">{{ t('renewal.references') }} <HelpTip id="renewal_refs_help" :text="t('help.renewal.references')" /></h3>
        <p v-if="errors.references" class="mb-2 text-sm text-red-700" data-test="references-error">{{ errors.references }}</p>
        <div v-for="(r, i) in rows" :key="i" class="mb-2 grid gap-2 sm:grid-cols-[1fr_10rem_8rem_auto]" data-test="reference-row">
          <InputText v-model="r.address" :placeholder="t('renewal.refAddress')" :aria-label="t('renewal.refAddress')" data-test="ref-address" />
          <InputText v-model="r.description" :placeholder="t('renewal.refDescription')" :aria-label="t('renewal.refDescription')" />
          <DecimalInput :id="`ref_rent_${i}`" v-model="r.rentCents" suffix="€" :aria-label="t('renewal.refRent')" data-test="ref-rent" />
          <Button icon="pi pi-times" text severity="secondary" :aria-label="t('renewal.removeReference')" @click="rows.splice(i, 1)" />
        </div>
        <Button :label="t('renewal.addReference')" icon="pi pi-plus" text size="small" data-test="ref-add" @click="rows.push(blank())" />
      </section>
      <div class="flex items-center gap-2">
        <Checkbox v-model="large" input-id="renewal_large" binary data-test="renewal-large" />
        <label for="renewal_large" class="text-sm">{{ t('renewal.largeAgglomeration') }}</label>
        <HelpTip id="renewal_large_help" :text="t('help.renewal.largeAgglomeration')" />
      </div>
      <Message v-if="terms" severity="success" :closable="false" data-test="renewal-terms">
        {{ t('renewal.previewText', { renewal: date(terms.renewal_on), latest: date(terms.latest_receipt_on), increase: money(terms.increase_cents ?? 0), percent: basisPoints(terms.increase_bp ?? 0), n: (terms.steps ?? []).length }) }}
        <template v-if="terms.cap_cents"> {{ t('renewal.cap', { cap: money(terms.cap_cents) }) }}</template>
        <ol class="mt-2 list-inside list-decimal" data-test="renewal-preview-steps">
          <li v-for="s in terms.steps" :key="s.from">{{ t('renewal.step', { day: date(s.from), rent: money(s.rent_cents ?? 0) }) }}</li>
        </ol>
      </Message>
    </div>
    <div class="mt-6 flex justify-end gap-2">
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button :label="t('renewal.preview')" severity="secondary" :loading="busy" data-test="renewal-preview" @click="preview" />
      <Button :label="t('renewal.issue')" icon="pi pi-file" :loading="busy" data-test="renewal-issue" @click="issue" />
    </div>
  </Dialog>
</template>
