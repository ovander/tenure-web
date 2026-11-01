<script setup lang="ts">
// S01 Home, phase 1 shell: who is signed in, the profile to create when there
// is none, and the last job runs of the scope. To-dos, arrears and
// obligations arrive with their screens.
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { api } from '@/api/client'
import type { JobRun, Page } from '@/api/types'
import { useSession } from '@/stores/session'
import { t } from '@/i18n'
import { timestamp } from '@/i18n/format'
import StatusTag from '@/components/StatusTag.vue'

const s = useSession()
const runs = ref<JobRun[] | null>(null)
const failed = ref(false)

onMounted(async () => {
  if (!s.active) {
    runs.value = []
    return
  }
  try {
    runs.value = (await api.get<Page<JobRun>>('/jobs/runs', { query: { page: 1, size: 10 } })).data.items
  } catch {
    failed.value = true
    runs.value = []
  }
})
</script>

<template>
  <section class="max-w-5xl space-y-6">
    <h1 class="text-xl font-semibold" data-test="welcome">{{ t('home.welcome', { name: s.displayName }) }}</h1>

    <Message v-if="!s.me?.owner && !s.active" severity="warn" :closable="false" data-test="no-profile">
      {{ t('home.noProfile') }}
      <RouterLink to="/settings/profile" class="ml-2 font-medium underline">{{ t('home.createProfile') }}</RouterLink>
    </Message>

    <div v-if="s.active">
      <h2 class="mb-2 font-medium">{{ t('home.runs') }}</h2>
      <Message v-if="failed" severity="error" :closable="false">{{ t('error.network') }}</Message>
      <div v-if="runs === null" class="space-y-2">
        <Skeleton v-for="i in 3" :key="i" height="2rem" />
      </div>
      <DataTable v-else :value="runs" size="small" data-test="runs">
        <template #empty>{{ t('home.runs.empty') }}</template>
        <Column field="job" :header="t('home.runs.job')" />
        <Column field="period" :header="t('home.runs.period')" />
        <Column :header="t('home.runs.status')">
          <template #body="{ data }"><StatusTag :status="data.status" /></template>
        </Column>
        <Column :header="t('home.runs.finished')">
          <template #body="{ data }">{{ timestamp(data.finished_at) }}</template>
        </Column>
      </DataTable>
    </div>
  </section>
</template>
