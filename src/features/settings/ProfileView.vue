<script setup lang="ts">
// S14 Settings › Profile: the caller's own owner profile (PUT /me creates it
// without If-Match, updates it with the version). The language switches the
// app and the e-mails; generated documents stay French. Password and MFA live
// in Socrate.
import { computed, reactive, ref, watchEffect } from 'vue'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Message from 'primevue/message'
import HelpTip from '@/components/HelpTip.vue'
import { useToast } from 'primevue/usetoast'
import { api, ApiError } from '@/api/client'
import type { Owner, OwnerInput } from '@/api/types'
import { useSession } from '@/stores/session'
import { t } from '@/i18n'

const s = useSession()
const toast = useToast()
const form = reactive<Required<Pick<OwnerInput, 'legal_name' | 'address' | 'language'>> & { tax_id: string }>({
  legal_name: '',
  address: '',
  tax_id: '',
  language: 'fr',
})
const errors = ref<Record<string, string>>({})
const ruleError = ref('')
const saving = ref(false)
const owner = computed(() => s.me?.owner)

watchEffect(() => {
  const o = owner.value
  form.legal_name = o?.legal_name ?? ''
  form.address = o?.address ?? ''
  form.tax_id = o?.tax_id ?? ''
  form.language = o?.language ?? 'fr'
})

const languages = [
  { value: 'fr', label: t('profile.language.fr') },
  { value: 'en', label: t('profile.language.en') },
]

async function save(): Promise<void> {
  saving.value = true
  errors.value = {}
  ruleError.value = ''
  try {
    const body: OwnerInput = { ...form, tax_id: form.tax_id || undefined }
    await api.put<Owner>('/me', body, { scope: null, ifMatch: owner.value?.version })
    await s.refreshMe()
    toast.add({ severity: 'success', summary: t('profile.saved'), life: 3000 })
  } catch (e) {
    if (e instanceof ApiError) {
      for (const f of e.problem.errors ?? []) if (f.field) errors.value[f.field] = f.message ?? ''
      ruleError.value = e.problem.errors?.length ? t('error.form') : (e.problem.detail || e.problem.title || t('error.title'))
      if (e.status === 412 || e.status === 409) await s.refreshMe()
    } else {
      ruleError.value = t('error.network')
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="space-y-5" novalidate data-test="profile" @submit.prevent="save">
    <Message v-if="ruleError" severity="error" :closable="false" data-test="form-error">{{ ruleError }}</Message>
    <div class="flex flex-col gap-1">
      <span class="flex items-center gap-1">
        <label for="legal_name" class="text-sm font-medium">{{ t('profile.legalName') }}</label>
        <HelpTip id="legal_name" :text="t('help.profile.legalName')" />
      </span>
      <InputText id="legal_name" v-model="form.legal_name" :invalid="!!errors.legal_name" autocomplete="name" />
      <small v-if="errors.legal_name" class="text-red-600">{{ errors.legal_name }}</small>
    </div>
    <div class="flex flex-col gap-1">
      <span class="flex items-center gap-1">
        <label for="address" class="text-sm font-medium">{{ t('profile.address') }}</label>
        <HelpTip id="address" :text="t('help.profile.address')" />
      </span>
      <Textarea id="address" v-model="form.address" rows="3" :invalid="!!errors.address" autocomplete="street-address" />
      <small v-if="errors.address" class="text-red-600">{{ errors.address }}</small>
    </div>
    <div class="flex flex-col gap-1">
      <span class="flex items-center gap-1">
        <label for="tax_id" class="text-sm font-medium">{{ t('profile.taxId') }}</label>
        <HelpTip id="tax_id" :text="t('help.profile.taxId')" />
      </span>
      <InputText id="tax_id" v-model="form.tax_id" :invalid="!!errors.tax_id" />
      <small v-if="errors.tax_id" class="text-red-600">{{ errors.tax_id }}</small>
    </div>
    <div class="flex flex-col gap-1">
      <span class="flex items-center gap-1">
        <label for="language" class="text-sm font-medium">{{ t('profile.language') }}</label>
        <HelpTip id="language" :text="t('help.profile.language')" />
      </span>
      <Select v-model="form.language" input-id="language" :options="languages" option-label="label" option-value="value" class="w-60" />
    </div>
    <p class="text-sm text-slate-500">{{ t('profile.socrate') }}</p>
    <Button type="submit" :label="owner ? t('profile.save') : t('profile.create')" :loading="saving" data-test="save" />
  </form>
</template>
