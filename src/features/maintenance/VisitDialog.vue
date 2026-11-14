<script setup lang="ts">
// A maintenance visit recorded with its certificate (tenure-api Q-131): the
// next one is due its interval later. A visit is never changed.
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import DayInput from '@/components/DayInput.vue'
import FilePicker from '@/components/FilePicker.vue'
import { useProblemForm } from '@/app/form'
import { t } from '@/i18n'
import { isoDay } from '@/i18n/format'
import { recordVisit, uploadSupporting, type Contract, type VisitInput } from './maintenance'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ contract: Contract | null }>()
const emit = defineEmits<{ saved: [c: Contract] }>()
const form = ref<VisitInput>({})
const file = ref<File | null>(null)
const { errors, summary, busy, submit, reset } = useProblemForm(async () => {
  visible.value = false
})

watch(visible, (v) => {
  if (!v) return
  reset()
  file.value = null
  form.value = { done_on: isoDay(new Date()), notes: '' }
}, { immediate: true })

async function save(): Promise<void> {
  const c = props.contract
  if (!c) return
  let saved: Contract | undefined
  const ok = await submit(async () => {
    const doc = file.value ? await uploadSupporting(c.asset_id ?? '', file.value) : undefined
    saved = await recordVisit(c, { ...form.value, document_id: doc, notes: form.value.notes?.trim() || undefined })
  })
  if (ok && saved) {
    visible.value = false
    emit('saved', saved)
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="t('maintenance.visitAdd')" class="w-[32rem]" data-test="visit-dialog">
    <p class="mb-3 text-sm text-slate-600">{{ contract?.title }}</p>
    <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
    <div class="space-y-4">
      <FormField id="vi_done" :label="t('maintenance.visitOn')" :error="errors.done_on">
        <DayInput id="vi_done" v-model="form.done_on" :invalid="!!errors.done_on" />
      </FormField>
      <FormField id="vi_doc" :label="t('maintenance.certificate')" :help="t('help.maintenance.certificate')" :hint="t('common.optional')" :error="errors.document_id">
        <FilePicker id="vi_doc" v-model="file" />
      </FormField>
      <FormField id="vi_notes" :label="t('maintenance.notes')" :hint="t('common.optional')" :error="errors.notes">
        <Textarea id="vi_notes" v-model="form.notes" rows="2" class="w-full" />
      </FormField>
    </div>
    <template #footer>
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button :label="t('common.save')" icon="pi pi-check" :loading="busy" data-test="visit-save" @click="save" />
    </template>
  </Dialog>
</template>
