<script setup lang="ts">
// A contractor of the owner's directory, added or changed (tenure-api
// Q-130).
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import { useProblemForm } from '@/app/form'
import { t } from '@/i18n'
import { saveContractor, type Contractor, type ContractorInput } from './maintenance'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ contractor?: Contractor | null }>()
const emit = defineEmits<{ saved: [c: Contractor] }>()
const form = ref<ContractorInput>({})
const { errors, summary, busy, submit, reset } = useProblemForm()

watch(visible, (v) => {
  if (!v) return
  reset()
  const c = props.contractor
  form.value = { name: c?.name ?? '', trade: c?.trade ?? '', email: c?.email ?? '', phone: c?.phone ?? '', notes: c?.notes ?? '' }
}, { immediate: true })

async function save(): Promise<void> {
  let c: Contractor | undefined
  const local: Record<string, string> = {}
  if (!form.value.name?.trim()) local.name = t('maintenance.contractorNameRequired')
  const ok = await submit(async () => {
    c = await saveContractor(form.value, props.contractor)
  }, local)
  if (ok && c) {
    visible.value = false
    emit('saved', c)
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="contractor ? t('maintenance.contractorEdit') : t('maintenance.contractorAdd')" class="w-[34rem]" data-test="contractor-dialog">
    <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField id="ctr_name" :label="t('maintenance.contractorName')" :error="errors.name">
        <InputText id="ctr_name" v-model="form.name" class="w-full" :invalid="!!errors.name" data-test="contractor-name" />
      </FormField>
      <FormField id="ctr_trade" :label="t('maintenance.trade')" :hint="t('common.optional')" :error="errors.trade">
        <InputText id="ctr_trade" v-model="form.trade" class="w-full" :placeholder="t('maintenance.tradePlaceholder')" data-test="contractor-trade" />
      </FormField>
      <FormField id="ctr_email" :label="t('maintenance.email')" :hint="t('common.optional')" :error="errors.email">
        <InputText id="ctr_email" v-model="form.email" type="email" class="w-full" :invalid="!!errors.email" data-test="contractor-email" />
      </FormField>
      <FormField id="ctr_phone" :label="t('maintenance.phone')" :hint="t('common.optional')" :error="errors.phone">
        <InputText id="ctr_phone" v-model="form.phone" class="w-full" data-test="contractor-phone" />
      </FormField>
      <FormField id="ctr_notes" :label="t('maintenance.notes')" :hint="t('common.optional')" :error="errors.notes" class="sm:col-span-2">
        <Textarea id="ctr_notes" v-model="form.notes" rows="2" class="w-full" />
      </FormField>
    </div>
    <template #footer>
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button :label="t('common.save')" icon="pi pi-check" :loading="busy" data-test="contractor-save" @click="save" />
    </template>
  </Dialog>
</template>
