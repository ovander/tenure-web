<script setup lang="ts">
// Adds a tenant from the lease form (RENT-FE-001 §3 S06: tenants are drafted
// with the lease), or corrects one from the lease hub (Q-W18): the dialog is
// prefilled and saved with If-Match; when someone saved first, it reloads the
// tenant and says so. Names one per line; e-mails go in the tenant's language.
import { reactive, ref } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import { useProblemForm } from '@/app/form'
import { useLeases, type Tenant, type TenantInput } from './store'
import { t } from '@/i18n'

const props = defineProps<{ tenant?: Tenant }>()
const emit = defineEmits<{ created: [tenant: Tenant]; updated: [tenant: Tenant]; close: [] }>()
const store = useLeases()
const visible = ref(true)
const form = reactive({ names: '', email: '', phone: '', language: 'fr' as 'fr' | 'en', occupation: '' })
const current = ref<Tenant | undefined>(props.tenant)
function fill(x: Tenant | undefined): void {
  if (!x) return
  Object.assign(form, { names: (x.names ?? []).join('\n'), email: x.email ?? '', phone: x.phone ?? '', language: x.language === 'en' ? 'en' : 'fr', occupation: x.occupation ?? '' })
}
fill(current.value)
// A 412 means someone saved first: reload the tenant and show what is stored.
const { errors, summary, busy, submit } = useProblemForm(async () => {
  if (!current.value?.id) return
  await store.loadTenants()
  current.value = store.tenants[current.value.id]
  fill(current.value)
})
const languages = [{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }]
const occupations = [
  { value: '', label: t('tenant.occupation.none') },
  { value: 'student', label: t('tenant.occupation.student') },
  { value: 'apprentice', label: t('tenant.occupation.apprentice') },
  { value: 'other', label: t('tenant.occupation.other') },
]

async function save(): Promise<void> {
  const body: TenantInput = {
    names: form.names.split('\n').map((n) => n.trim()).filter(Boolean),
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    language: form.language,
    occupation: (form.occupation || undefined) as TenantInput['occupation'],
  }
  const editing = current.value?.id
  let saved: Tenant | undefined
  const ok = await submit(async () => {
    saved = editing ? await store.updateTenant(editing, body, current.value?.version ?? 0) : await store.createTenant(body)
  })
  if (ok && saved) {
    if (editing) emit('updated', saved)
    else emit('created', saved)
    close()
  }
}
function close(): void {
  visible.value = false
  emit('close')
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="current?.id ? t('lease.editTenant') : t('lease.addTenant')" class="w-[30rem]" data-test="tenant-dialog" @hide="close">
    <form class="space-y-4" novalidate @submit.prevent="save">
      <Message v-if="summary" severity="error" :closable="false">{{ summary }}</Message>
      <FormField id="tenant_names" :help="t('help.tenant.names')" :label="t('tenant.names')" :error="errors.names">
        <Textarea id="tenant_names" v-model="form.names" rows="2" :invalid="!!errors.names" />
      </FormField>
      <div class="grid grid-cols-2 gap-4">
        <FormField id="tenant_email" :help="t('help.tenant.email')" :label="t('tenant.email')" :error="errors.email">
          <InputText id="tenant_email" v-model="form.email" type="email" :invalid="!!errors.email" />
        </FormField>
        <FormField id="tenant_phone" :help="t('help.tenant.phone')" :label="t('tenant.phone')" :error="errors.phone">
          <InputText id="tenant_phone" v-model="form.phone" type="tel" />
        </FormField>
        <FormField id="tenant_language" :help="t('help.tenant.language')" :label="t('tenant.language')">
          <Select v-model="form.language" input-id="tenant_language" :options="languages" option-label="label" option-value="value" />
        </FormField>
        <FormField id="tenant_occupation" :help="t('help.tenant.occupation')" :label="t('tenant.occupation')" :error="errors.occupation">
          <Select v-model="form.occupation" input-id="tenant_occupation" :options="occupations" option-label="label" option-value="value" />
        </FormField>
      </div>
      <div class="flex justify-end gap-2">
        <Button :label="t('common.cancel')" severity="secondary" text @click="close" />
        <Button type="submit" :label="t('common.save')" :loading="busy" data-test="save-tenant" />
      </div>
    </form>
  </Dialog>
</template>
