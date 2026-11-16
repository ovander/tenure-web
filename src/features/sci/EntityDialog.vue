<script setup lang="ts">
// Creates an SCI at the income tax (a step-up action) or changes its profile
// (tenure-api Q-133; Q-W42). The SCI is an owner scope of its own: its
// creator becomes its first manager. An SCI at the IS is not supported; its
// capital in parts is set at creation and does not change.
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import DayInput from '@/components/DayInput.vue'
import { useProblemForm } from '@/app/form'
import { withStepUp } from '@/app/stepUp'
import { t } from '@/i18n'
import { createEntity, nineDigits, saveEntity, type Entity, type EntityInput } from './sci'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ entity?: Entity | null }>()
const emit = defineEmits<{ saved: [e: Entity] }>()
const form = ref<EntityInput>({ tax_regime: 'ir' })
const { errors, summary, busy, submit, reset } = useProblemForm(async () => {
  visible.value = false
})

watch(visible, (v) => {
  if (!v) return
  reset()
  const e = props.entity
  form.value = e
    ? { legal_name: e.legal_name, address: e.address, siren: e.siren, regime_from: e.regime_from, capital_parts: e.capital_parts, tax_regime: 'ir', language: e.language }
    : { legal_name: '', address: '', siren: '', tax_regime: 'ir', capital_parts: undefined, language: 'fr' }
}, { immediate: true })

async function save(): Promise<void> {
  const local: Record<string, string> = {}
  if (!form.value.legal_name?.trim()) local.legal_name = t('sci.nameRequired')
  if (form.value.siren && !nineDigits(form.value.siren)) local.siren = t('sci.sirenInvalid')
  if (!form.value.capital_parts || form.value.capital_parts <= 0) local.capital_parts = t('sci.capitalRequired')
  let saved: Entity | undefined
  const ok = await submit(async () => {
    const body: EntityInput = { ...form.value, legal_name: form.value.legal_name?.trim(), regime_from: form.value.regime_from || undefined }
    saved = props.entity ? await saveEntity(props.entity.version ?? 0, body) : await withStepUp(() => createEntity(body))
  }, local)
  if (ok && saved) {
    visible.value = false
    emit('saved', saved)
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="entity ? t('sci.edit') : t('sci.create')" class="w-[36rem]" data-test="entity-dialog">
    <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
    <Message v-if="!entity" severity="info" :closable="false" class="mb-3">{{ t('sci.createHint') }}</Message>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField id="e_name" :label="t('sci.legalName')" :error="errors.legal_name" class="sm:col-span-2">
        <InputText id="e_name" v-model="form.legal_name" class="w-full" :invalid="!!errors.legal_name" data-test="entity-name" />
      </FormField>
      <FormField id="e_address" :label="t('sci.address')" :hint="t('common.optional')" class="sm:col-span-2">
        <InputText id="e_address" v-model="form.address" class="w-full" />
      </FormField>
      <FormField id="e_siren" :label="t('sci.siren')" :hint="t('common.optional')" :error="errors.siren">
        <InputText id="e_siren" v-model="form.siren" class="w-full" :invalid="!!errors.siren" data-test="entity-siren" />
      </FormField>
      <FormField id="e_from" :label="t('sci.regimeFrom')" :help="t('help.sci.regimeFrom')" :hint="t('common.optional')">
        <DayInput id="e_from" v-model="form.regime_from" />
      </FormField>
      <FormField id="e_parts" :label="t('sci.capitalParts')" :help="t('help.sci.capital')" :error="errors.capital_parts">
        <InputNumber
          v-model="form.capital_parts" input-id="e_parts" :min="1" :use-grouping="false" :disabled="!!entity" class="w-full"
          :invalid="!!errors.capital_parts" data-test="entity-parts"
        />
      </FormField>
      <FormField id="e_regime" :label="t('sci.taxRegime')" :help="t('help.sci.regime')">
        <InputText id="e_regime" :model-value="t('sci.regimeIR')" disabled class="w-full" />
      </FormField>
    </div>
    <template #footer>
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button :label="entity ? t('common.save') : t('sci.createConfirm')" icon="pi pi-check" :loading="busy" data-test="entity-save" @click="save" />
    </template>
  </Dialog>
</template>
