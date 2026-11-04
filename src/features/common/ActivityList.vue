<script setup lang="ts">
// A hub's activity (RENT-FE-001 §1 « nothing silent », §6 Activity, §7 audit
// tab): the audit events of one entity (an asset, a lease), newest first,
// with who, when and the fields changed.
import { onMounted, ref } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Message from 'primevue/message'
import { api } from '@/api/client'
import type { Page } from '@/api/types'
import type { AuditEvent } from '@/features/portfolio/store'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'
import { timestamp } from '@/i18n/format'
import { changedFields } from '@/features/portfolio/activity'

const props = defineProps<{ entityType: 'asset' | 'lease'; entityId: string }>()
const s = useSession()
const events = ref<AuditEvent[] | null>(null)
const failed = ref(false)

onMounted(async () => {
  try {
    const q = { entity_type: props.entityType, entity_id: props.entityId, page: 1, size: 50 }
    events.value = (await api.get<Page<AuditEvent>>('/audit/events', { query: q })).data.items
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
