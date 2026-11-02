<script setup lang="ts">
// The hub's activity (RENT-FE-001 §1 « nothing silent », §7 audit tab): the
// asset's audit events, newest first, with who, when and the fields changed.
import { onMounted, ref } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Message from 'primevue/message'
import { useAssets, type AuditEvent } from './store'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'
import { timestamp } from '@/i18n/format'
import { changedFields } from './activity'

const props = defineProps<{ assetId: string }>()
const store = useAssets()
const s = useSession()
const events = ref<AuditEvent[] | null>(null)
const failed = ref(false)

onMounted(async () => {
  try {
    events.value = await store.activity(props.assetId)
  } catch {
    failed.value = true
    events.value = []
  }
})

function actionLabel(a: string | undefined): string {
  const key = `action.${a}` as Key
  const text = t(key)
  return text === key ? (a ?? '') : text
}
function who(sub: string | undefined): string {
  return sub && sub === s.me?.sub ? s.displayName : (sub ?? '')
}
</script>

<template>
  <div>
    <Message v-if="failed" severity="error" :closable="false">{{ t('error.network') }}</Message>
    <DataTable :value="events ?? []" :loading="events === null" size="small" data-key="id" data-test="activity">
      <template #empty>{{ t('activity.empty') }}</template>
      <Column :header="t('activity.when')">
        <template #body="{ data }">{{ timestamp(data.occurred_at) }}</template>
      </Column>
      <Column :header="t('activity.who')">
        <template #body="{ data }">{{ who(data.actor_sub) }}</template>
      </Column>
      <Column :header="t('activity.what')">
        <template #body="{ data }">{{ actionLabel(data.action) }}</template>
      </Column>
      <Column :header="t('activity.changes')">
        <template #body="{ data }">
          <span v-if="!data.before" class="text-slate-500">{{ t('activity.created') }}</span>
          <span v-else class="text-sm">{{ changedFields(data.before, data.after).join(', ') }}</span>
        </template>
      </Column>
    </DataTable>
  </div>
</template>
