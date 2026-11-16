<script setup lang="ts">
// An associate of the SCI (tenure-api Q-133; Q-W42): a name only, or a
// Tenure person — the caller themselves, or a person with live access to
// the SCI — who then reads their shares of its issued 2072s in their own
// scope. Their parts come by movements.
import { computed, onMounted, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import { api } from '@/api/client'
import type { Schemas } from '@/api/types'
import { useProblemForm } from '@/app/form'
import { t, type Key } from '@/i18n'
import { saveAssociate, type Associate, type AssociateInput } from './sci'

type Grant = Schemas['portfolio.GrantView']
const visible = defineModel<boolean>('visible')
const props = defineProps<{ associate?: Associate | null }>()
const emit = defineEmits<{ saved: [a: Associate] }>()
const name = ref('')
// link: '' a name only, 'self', or a grant id.
const link = ref('')
const grants = ref<Grant[]>([])
const { errors, summary, busy, submit, reset } = useProblemForm(async () => {
  visible.value = false
})

onMounted(async () => {
  try {
    grants.value = (await api.get<Grant[]>('/grants')).data.filter((g) => !g.revoked_at)
  } catch {
    grants.value = []
  }
})
const linkOptions = computed(() => [
  { value: '', label: t('sci.linkNone') },
  { value: 'self', label: t('sci.linkSelf') },
  ...grants.value.map((g) => ({ value: g.id ?? '', label: `${g.grantee_sub} · ${t(`grants.role.${g.role}` as Key)}` })),
])

watch(visible, (v) => {
  if (!v) return
  reset()
  name.value = props.associate?.name ?? ''
  link.value = props.associate?.me ? 'self' : ''
}, { immediate: true })

async function save(): Promise<void> {
  const local: Record<string, string> = {}
  if (!name.value.trim()) local.name = t('sci.associateNameRequired')
  let saved: Associate | undefined
  const ok = await submit(async () => {
    const body: AssociateInput = { name: name.value.trim(), link: link.value === 'self' ? 'self' : undefined,
      grant_id: link.value && link.value !== 'self' ? link.value : undefined }
    saved = await saveAssociate(body, props.associate)
  }, local)
  if (ok && saved) {
    visible.value = false
    emit('saved', saved)
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="associate ? t('sci.associateEdit') : t('sci.associateAdd')" class="w-[32rem]" data-test="associate-dialog">
    <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
    <div class="space-y-4">
      <FormField id="as_name" :label="t('sci.associateName')" :error="errors.name">
        <InputText id="as_name" v-model="name" class="w-full" :invalid="!!errors.name" data-test="associate-name" />
      </FormField>
      <FormField id="as_link" :label="t('sci.link')" :help="t('help.sci.link')" :error="errors.grant_id">
        <Select v-model="link" input-id="as_link" :options="linkOptions" option-label="label" option-value="value" class="w-full" data-test="associate-link" />
      </FormField>
      <p v-if="associate?.person_sub && !associate.me" class="text-xs text-slate-500">{{ t('sci.linkedTo', { sub: associate.person_sub }) }}</p>
    </div>
    <template #footer>
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button :label="t('common.save')" icon="pi pi-check" :loading="busy" data-test="associate-save" @click="save" />
    </template>
  </Dialog>
</template>
