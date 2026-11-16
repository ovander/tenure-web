<script setup lang="ts">
// S14 Settings › Grants (RENT-FE-001 §5): read access to the portfolio given
// to a Socrate subject as co-owner (reads everything) or accountant
// (financial data, no tenant contact data). Granting and revoking are step_up
// actions; a grant is revoked, never deleted, so revoked ones stay listed.
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import RadioButton from 'primevue/radiobutton'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { useToast } from 'primevue/usetoast'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FormField from '@/components/FormField.vue'
import { api, ApiError } from '@/api/client'
import type { Schemas } from '@/api/types'
import { withStepUp } from '@/app/stepUp'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'
import { timestamp } from '@/i18n/format'

type Grant = Schemas['portfolio.GrantView']
type Role = NonNullable<Grant['role']>

const toast = useToast()
const session = useSession()
const rows = ref<Grant[] | null>(null)
const inviting = ref(false)
const revoking = ref<Grant | null>(null)
const sub = ref('')
const role = ref<Role>('accountant')
const busy = ref(false)
const error = ref('')

async function load(): Promise<void> {
  try {
    rows.value = (await api.get<Grant[]>('/grants')).data
  } catch {
    rows.value = []
  }
}
onMounted(load)
const active = computed(() => (rows.value ?? []).filter((g) => !g.revoked_at))
const revoked = computed(() => (rows.value ?? []).filter((g) => g.revoked_at))
const revokeVisible = computed({ get: () => revoking.value !== null, set: (v: boolean) => (revoking.value = v ? revoking.value : null) })

function problem(e: unknown): string {
  return e instanceof ApiError ? [e.problem.title, e.problem.detail, ...(e.problem.errors ?? []).map((x) => x.message)].filter(Boolean).join(' ') : t('error.network')
}
function askInvite(): void {
  sub.value = ''
  role.value = 'accountant'
  error.value = ''
  inviting.value = true
}
async function invite(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const g = await withStepUp(() => api.post<Grant>('/grants', { grantee_sub: sub.value.trim(), role: role.value }))
    if (g) {
      inviting.value = false
      toast.add({ severity: 'success', summary: t('grants.granted'), life: 4000 })
      await load()
    }
  } catch (e) {
    error.value = problem(e)
  } finally {
    busy.value = false
  }
}
async function revoke(): Promise<void> {
  if (!revoking.value?.id) return
  busy.value = true
  error.value = ''
  try {
    const id = revoking.value.id
    const g = await withStepUp(() => api.del<Grant>(`/grants/${id}`))
    if (g) {
      revoking.value = null
      toast.add({ severity: 'success', summary: t('grants.revoked'), life: 4000 })
      await load()
    }
  } catch (e) {
    error.value = problem(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-start justify-between gap-4">
      <p class="text-sm text-slate-600">{{ t('grants.intro') }}</p>
      <Button :label="t('grants.invite')" icon="pi pi-user-plus" data-test="invite" @click="askInvite" />
    </div>
    <Skeleton v-if="rows === null" height="5rem" />
    <template v-else>
      <p v-if="!active.length" class="text-sm text-slate-500" data-test="grants-empty">{{ t('grants.none') }}</p>
      <ul class="space-y-2" data-test="grants">
        <li v-for="g in active" :key="g.id" class="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-2" data-test="grant">
          <span class="text-sm"><span class="font-mono" data-test="grant-sub">{{ g.grantee_sub }}</span> · {{ t(`grants.role.${g.role}` as Key) }} · <span class="text-slate-500">{{ t('grants.since', { at: timestamp(g.granted_at) }) }}</span></span>
          <Button :label="t('grants.revoke')" size="small" severity="danger" outlined data-test="revoke" @click="revoking = g" />
        </li>
      </ul>
      <details v-if="revoked.length" class="text-sm" data-test="grants-revoked">
        <summary class="cursor-pointer text-slate-600">{{ t('grants.revokedList', { n: revoked.length }) }}</summary>
        <ul class="mt-2 space-y-1 text-slate-500">
          <li v-for="g in revoked" :key="g.id"><span class="font-mono">{{ g.grantee_sub }}</span> · {{ t(`grants.role.${g.role}` as Key) }} · {{ t('grants.revokedAt', { at: timestamp(g.revoked_at) }) }}</li>
        </ul>
      </details>
    </template>

    <ConfirmDialog v-model:visible="inviting" :title="t('grants.invite')" :body="t('grants.inviteBody')" :confirm="t('grants.grant')" :busy="busy" :disabled="!sub.trim()" @confirm="invite">
      <div class="space-y-3">
        <FormField id="g_sub" :help="t('help.grants.sub')" :label="t('grants.sub')"><InputText id="g_sub" v-model="sub" class="w-full font-mono" /></FormField>
        <fieldset class="space-y-2">
          <legend class="mb-1 text-sm font-medium">{{ t('grants.roleLabel') }}</legend>
          <div class="flex items-start gap-2"><RadioButton v-model="role" input-id="g_acc" value="accountant" /><label for="g_acc" class="text-sm">{{ t('grants.role.accountant') }} — <span class="text-slate-500">{{ t('grants.accountantHelp') }}</span></label></div>
          <div class="flex items-start gap-2"><RadioButton v-model="role" input-id="g_co" value="co_owner" /><label for="g_co" class="text-sm">{{ t('grants.role.co_owner') }} — <span class="text-slate-500">{{ t('grants.coOwnerHelp') }}</span></label></div>
          <div v-if="session.isSCI" class="flex items-start gap-2"><RadioButton v-model="role" input-id="g_mgr" value="manager" data-test="role-manager" /><label for="g_mgr" class="text-sm">{{ t('grants.role.manager') }} — <span class="text-slate-500">{{ t('grants.managerHelp') }}</span></label></div>
        </fieldset>
      </div>
      <Message v-if="error" severity="error" :closable="false" class="mt-3" data-test="grant-error">{{ error }}</Message>
    </ConfirmDialog>
    <ConfirmDialog v-model:visible="revokeVisible" :title="t('grants.revoke')" :body="t('grants.revokeBody', { sub: revoking?.grantee_sub ?? '' })" :confirm="t('grants.revoke')" :busy="busy" @confirm="revoke">
      <Message v-if="error" severity="error" :closable="false" data-test="revoke-error">{{ error }}</Message>
    </ConfirmDialog>
  </div>
</template>
