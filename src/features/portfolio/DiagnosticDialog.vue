<script setup lang="ts">
// Add or edit a diagnostic of a dwelling (RENT-SPEC-002): kind, date done,
// validity stated by the report, result (the class for a DPE), or the reason
// it is not required. The legal validity is applied by the API.
import { computed, reactive, ref } from 'vue'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Message from 'primevue/message'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import FormField from '@/components/FormField.vue'
import HelpTip from '@/components/HelpTip.vue'
import DayInput from '@/components/DayInput.vue'
import { useProblemForm } from '@/app/form'
import { useAssets, type Diagnostic, type DiagnosticInput } from './store'
import { t, type Key } from '@/i18n'

const props = defineProps<{ assetId: string; diagnostic: Diagnostic | null }>()
const emit = defineEmits<{ close: [] }>()
const store = useAssets()
const toast = useToast()
const visible = ref(true)
const d = props.diagnostic
const form = reactive<DiagnosticInput>({
  kind: d?.kind ?? 'dpe',
  done_on: d?.done_on || undefined,
  valid_until: d?.valid_until || undefined,
  result: d?.result ?? '',
  not_required_reason: d?.not_required_reason ?? '',
})
const notRequired = ref(!!d?.not_required_reason)
const kinds = (['dpe', 'erp', 'electricity', 'gas', 'lead', 'asbestos'] as const).map((k) => ({ value: k, label: t(`diag.kind.${k}` as Key) }))
const dpeClasses = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c) => ({ value: c, label: c }))
const isDPE = computed(() => form.kind === 'dpe')

const { errors, summary, busy, submit } = useProblemForm(async () => {
  await store.loadDiagnostics(props.assetId)
})

async function save(): Promise<void> {
  const body: DiagnosticInput = notRequired.value
    ? { kind: form.kind, not_required_reason: form.not_required_reason }
    : { kind: form.kind, done_on: form.done_on, valid_until: form.valid_until || undefined, result: form.result || undefined }
  if (await submit(() => store.saveDiagnostic(props.assetId, body, d ?? undefined))) {
    toast.add({ severity: 'success', summary: t('common.saved'), life: 3000 })
    close()
  }
}
function close(): void {
  visible.value = false
  emit('close')
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="d ? t('common.edit') : t('diag.add')" class="w-[32rem]" data-test="diagnostic-dialog" @hide="close">
    <form class="space-y-4" novalidate @submit.prevent="save">
      <Message v-if="summary" severity="error" :closable="false" data-test="diag-error">{{ summary }}</Message>
      <FormField id="diag_kind" :help="t('help.diag.kind')" :label="t('diag.kind')" :error="errors.kind">
        <Select v-model="form.kind" input-id="diag_kind" :options="kinds" option-label="label" option-value="value" :disabled="!!d" />
      </FormField>
      <div class="flex items-center gap-3">
        <ToggleSwitch v-model="notRequired" input-id="diag_not_required" />
        <label for="diag_not_required" class="text-sm font-medium">{{ t('diag.notRequired') }}</label>
        <HelpTip id="diag_not_required" :text="t('help.diag.notRequired')" />
      </div>
      <FormField v-if="notRequired" id="diag_reason" :help="t('help.diag.reason')" :label="t('diag.notRequiredReason')" :error="errors.not_required_reason">
        <InputText id="diag_reason" v-model="form.not_required_reason" :invalid="!!errors.not_required_reason" />
      </FormField>
      <template v-else>
        <div class="grid grid-cols-2 gap-4">
          <FormField id="diag_done" :help="t('help.diag.doneOn')" :label="t('diag.doneOn')" :error="errors.done_on">
            <DayInput id="diag_done" v-model="form.done_on" :invalid="!!errors.done_on" />
          </FormField>
          <FormField id="diag_valid" :help="t('help.diag.validUntil')" :label="`${t('diag.validUntil')} (${t('common.optional')})`" :error="errors.valid_until">
            <DayInput id="diag_valid" v-model="form.valid_until" />
          </FormField>
        </div>
        <FormField id="diag_result" :help="t('help.diag.result')" :label="t('diag.result')" :error="errors.result">
          <Select v-if="isDPE" v-model="form.result" input-id="diag_result" :options="dpeClasses" option-label="label" option-value="value" class="w-40" :invalid="!!errors.result" />
          <InputText v-else id="diag_result" v-model="form.result" />
        </FormField>
      </template>
      <div class="flex justify-end gap-2">
        <Button :label="t('common.cancel')" severity="secondary" text @click="close" />
        <Button type="submit" :label="t('common.save')" :loading="busy" data-test="save-diagnostic" />
      </div>
    </form>
  </Dialog>
</template>
