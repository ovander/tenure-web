<script setup lang="ts">
// Adds or edits a guarantee (RENT-FE-001 S07): deposit, surety, Visale or
// rent insurance, each with the guarantor fields it needs. The combination
// rules (a surety beside an insurance, Visale with a surety) are the API's.
import { computed, reactive, ref } from 'vue'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import HelpTip from '@/components/HelpTip.vue'
import DecimalInput from '@/components/DecimalInput.vue'
import DayInput from '@/components/DayInput.vue'
import { useProblemForm } from '@/app/form'
import { useLeases, guarantorOf, type Guarantee, type GuaranteeInput, type GuaranteeKind, type Guarantor } from './store'
import { t, type Key } from '@/i18n'

const props = defineProps<{ leaseId: string; guarantee: Guarantee | null; depositCents?: number; startOn?: string }>()
const emit = defineEmits<{ saved: []; close: [] }>()
const store = useLeases()
const visible = ref(true)
const g = props.guarantee
const prev = g ? guarantorOf(g) : {}
const form = reactive({
  kind: (g?.kind ?? 'deposit') as GuaranteeKind,
  amount_cents: g?.amount_cents ?? props.depositCents ?? 0,
  status: g?.status ?? 'held',
  valid_from: g?.valid_from ?? null,
  valid_to: g?.valid_to ?? null,
})
const guarantor = reactive<Guarantor>({ name: '', address: '', legal_person: false, solidary: true, visa_number: '', insurer: '', policy: '', ...prev })
const kinds = (['deposit', 'surety', 'visale', 'insurance'] as GuaranteeKind[]).map((k) => ({ value: k, label: t(`guarantee.kind.${k}` as Key) }))
const statuses = computed(() =>
  (form.kind === 'deposit' ? ['held', 'settled'] : ['valid', 'expired']).map((x) => ({ value: x, label: t(`guarantee.status.${x}` as Key) })),
)
const { errors, summary, busy, submit } = useProblemForm(async () => emit('saved'))

// A guarantee other than the deposit is proposed valid from the lease start.
function kindChanged(): void {
  form.status = form.kind === 'deposit' ? 'held' : 'valid'
  if (form.kind !== 'deposit' && !form.valid_from) form.valid_from = props.startOn ?? null
}

async function save(): Promise<void> {
  const who: Guarantor = {}
  if (form.kind === 'surety') Object.assign(who, { name: guarantor.name, address: guarantor.address, legal_person: guarantor.legal_person, solidary: guarantor.solidary })
  if (form.kind === 'visale') Object.assign(who, { visa_number: guarantor.visa_number })
  if (form.kind === 'insurance') Object.assign(who, { insurer: guarantor.insurer, policy: guarantor.policy })
  const body: GuaranteeInput = {
    kind: form.kind,
    amount_cents: form.kind === 'deposit' ? form.amount_cents : undefined,
    status: form.status as GuaranteeInput['status'],
    valid_from: form.valid_from || undefined,
    valid_to: form.valid_to || undefined,
    guarantor: who as GuaranteeInput['guarantor'],
  }
  if (await submit(() => store.saveGuarantee(props.leaseId, body, g ?? undefined))) {
    emit('saved')
    close()
  }
}
function close(): void {
  visible.value = false
  emit('close')
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="g ? t('common.edit') : t('guarantee.add')" class="w-[34rem]" data-test="guarantee-dialog" @hide="close">
    <form class="space-y-4" novalidate @submit.prevent="save">
      <Message v-if="summary" severity="error" :closable="false" data-test="guarantee-error">{{ summary }}</Message>
      <div class="grid grid-cols-2 gap-4">
        <FormField id="g_kind" :help="t('help.guarantee.kind')" :label="t('guarantee.kind')" :error="errors.kind">
          <Select v-model="form.kind" input-id="g_kind" :options="kinds" option-label="label" option-value="value" :disabled="!!g" @change="kindChanged" />
        </FormField>
        <FormField id="g_status" :help="t('help.guarantee.status')" :label="t('guarantee.status')" :error="errors.status">
          <Select v-model="form.status" input-id="g_status" :options="statuses" option-label="label" option-value="value" />
        </FormField>
      </div>
      <FormField v-if="form.kind === 'deposit'" id="g_amount" :help="t('help.guarantee.amount')" :label="t('guarantee.amount')" :error="errors.amount_cents">
        <DecimalInput id="g_amount" v-model="form.amount_cents" suffix="€" :invalid="!!errors.amount_cents" />
      </FormField>
      <template v-if="form.kind === 'surety'">
        <FormField id="g_name" :help="t('help.guarantee.name')" :label="t('guarantee.name')" :error="errors.guarantor">
          <InputText id="g_name" v-model="guarantor.name" :invalid="!!errors.guarantor" />
        </FormField>
        <FormField id="g_address" :help="t('help.guarantee.address')" :label="t('guarantee.address')">
          <Textarea id="g_address" v-model="guarantor.address" rows="2" />
        </FormField>
        <div class="flex gap-6">
          <span class="flex items-center gap-2 text-sm"><ToggleSwitch v-model="guarantor.legal_person" input-id="g_legal" /><label for="g_legal">{{ t('guarantee.legalPerson') }}</label><HelpTip id="g_legal" :text="t('help.guarantee.legalPerson')" /></span>
          <span class="flex items-center gap-2 text-sm"><ToggleSwitch v-model="guarantor.solidary" input-id="g_solidary" /><label for="g_solidary">{{ t('guarantee.solidary') }}</label><HelpTip id="g_solidary" :text="t('help.guarantee.solidary')" /></span>
        </div>
      </template>
      <FormField v-if="form.kind === 'visale'" id="g_visa" :help="t('help.guarantee.visa')" :label="t('guarantee.visa')">
        <InputText id="g_visa" v-model="guarantor.visa_number" />
      </FormField>
      <div v-if="form.kind === 'insurance'" class="grid grid-cols-2 gap-4">
        <FormField id="g_insurer" :help="t('help.guarantee.insurer')" :label="t('guarantee.insurer')"><InputText id="g_insurer" v-model="guarantor.insurer" /></FormField>
        <FormField id="g_policy" :help="t('help.guarantee.policy')" :label="t('guarantee.policy')"><InputText id="g_policy" v-model="guarantor.policy" /></FormField>
      </div>
      <div v-if="form.kind !== 'deposit'" class="grid grid-cols-2 gap-4">
        <FormField id="g_from" :help="t('help.guarantee.validFrom')" :label="t('guarantee.validFrom')" :error="errors.valid_from"><DayInput id="g_from" v-model="form.valid_from" /></FormField>
        <FormField id="g_to" :help="t('help.guarantee.validTo')" :label="t('guarantee.validTo')" :error="errors.valid_to"><DayInput id="g_to" v-model="form.valid_to" /></FormField>
      </div>
      <div class="flex justify-end gap-2">
        <Button :label="t('common.cancel')" severity="secondary" text @click="close" />
        <Button type="submit" :label="t('common.save')" :loading="busy" data-test="save-guarantee" />
      </div>
    </form>
  </Dialog>
</template>
