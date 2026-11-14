<script setup lang="ts">
// An incident reported, or changed while its works are not done (tenure-api
// Q-130): the asset, who reported it and how, its urgency, a description
// and photos, uploaded as supporting documents of the asset.
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import DayInput from '@/components/DayInput.vue'
import FilePicker from '@/components/FilePicker.vue'
import { useProblemForm } from '@/app/form'
import { assetLabel, useAssets } from '@/features/portfolio/store'
import { t, type Key } from '@/i18n'
import { isoDay } from '@/i18n/format'
import { saveIncident, uploadSupporting, type Incident, type IncidentInput } from './maintenance'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ incident?: Incident | null; assetId?: string }>()
const emit = defineEmits<{ saved: [i: Incident] }>()
const assets = useAssets()
const form = ref<IncidentInput>({})
const photo = ref<File | null>(null)
const { errors, summary, busy, submit, reset } = useProblemForm(async () => {
  visible.value = false
})

const assetOptions = computed(() => Object.values(assets.byId).map((a) => ({ value: a.id ?? '', label: assetLabel(a) })))
const opts = (keys: string[], prefix: string) => keys.map((k) => ({ value: k, label: t(`${prefix}.${k}` as Key) }))
const byOptions = computed(() => opts(['tenant', 'owner'], 'maintenance.reportedBy'))
const channelOptions = computed(() => opts(['email', 'phone', 'letter', 'portal', 'visit'], 'maintenance.channel'))
const urgencyOptions = computed(() => opts(['low', 'normal', 'urgent'], 'maintenance.urgency'))

watch(visible, (v) => {
  if (!v) return
  reset()
  photo.value = null
  if (!Object.keys(assets.byId).length) void assets.list(1, 100)
  const i = props.incident
  form.value = i
    ? { asset_id: i.asset_id, lease_id: i.lease_id, reported_on: i.reported_on, reported_by: i.reported_by, channel: i.channel, reporter_name: i.reporter_name,
        title: i.title, description: i.description, urgency: i.urgency, photo_document_ids: [...(i.photo_document_ids ?? [])] }
    : { asset_id: props.assetId ?? '', reported_on: isoDay(new Date()), reported_by: 'tenant', channel: 'email', urgency: 'normal', title: '', photo_document_ids: [] }
}, { immediate: true })

async function save(): Promise<void> {
  const local: Record<string, string> = {}
  if (!form.value.asset_id) local.asset_id = t('maintenance.assetRequired')
  if (!form.value.title?.trim()) local.title = t('maintenance.titleRequired')
  let saved: Incident | undefined
  const ok = await submit(async () => {
    const body = { ...form.value, title: form.value.title?.trim() }
    if (photo.value) body.photo_document_ids = [...(body.photo_document_ids ?? []), await uploadSupporting(body.asset_id ?? '', photo.value)]
    saved = await saveIncident(body, props.incident)
  }, local)
  if (ok && saved) {
    visible.value = false
    emit('saved', saved)
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="incident ? t('maintenance.incidentEdit') : t('maintenance.incidentAdd')" class="w-[42rem]" data-test="incident-dialog">
    <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
    <div class="space-y-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <FormField id="inc_asset" :label="t('maintenance.asset')" :error="errors.asset_id">
          <Select v-model="form.asset_id" input-id="inc_asset" :options="assetOptions" option-label="label" option-value="value" :disabled="!!incident" class="w-full" data-test="incident-asset" />
        </FormField>
        <FormField id="inc_on" :label="t('maintenance.reportedOn')" :error="errors.reported_on">
          <DayInput id="inc_on" v-model="form.reported_on" :invalid="!!errors.reported_on" />
        </FormField>
        <FormField id="inc_title" :label="t('maintenance.title')" :error="errors.title" class="sm:col-span-2">
          <InputText id="inc_title" v-model="form.title" class="w-full" :placeholder="t('maintenance.titlePlaceholder')" :invalid="!!errors.title" data-test="incident-title" />
        </FormField>
        <FormField id="inc_by" :label="t('maintenance.reportedByLabel')" :error="errors.reported_by">
          <SelectButton v-model="form.reported_by" :options="byOptions" option-label="label" option-value="value" :allow-empty="false" data-test="incident-by" />
        </FormField>
        <FormField id="inc_channel" :label="t('maintenance.channelLabel')" :error="errors.channel">
          <Select v-model="form.channel" input-id="inc_channel" :options="channelOptions" option-label="label" option-value="value" class="w-full" />
        </FormField>
        <FormField id="inc_reporter" :label="t('maintenance.reporterName')" :hint="t('common.optional')" :error="errors.reporter_name">
          <InputText id="inc_reporter" v-model="form.reporter_name" class="w-full" />
        </FormField>
        <FormField id="inc_urgency" :label="t('maintenance.urgencyLabel')" :error="errors.urgency">
          <SelectButton v-model="form.urgency" :options="urgencyOptions" option-label="label" option-value="value" :allow-empty="false" data-test="incident-urgency" />
        </FormField>
      </div>
      <FormField id="inc_desc" :label="t('maintenance.description')" :hint="t('common.optional')" :error="errors.description">
        <Textarea id="inc_desc" v-model="form.description" rows="3" class="w-full" data-test="incident-description" />
      </FormField>
      <FormField id="inc_photo" :label="t('maintenance.photo')" :hint="t('maintenance.photoHint', { n: form.photo_document_ids?.length ?? 0 })" :error="errors.photo_document_ids">
        <FilePicker id="inc_photo" v-model="photo" />
      </FormField>
    </div>
    <template #footer>
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button :label="t('common.save')" icon="pi pi-check" :loading="busy" data-test="incident-save" @click="save" />
    </template>
  </Dialog>
</template>
