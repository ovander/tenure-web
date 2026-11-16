<script setup lang="ts">
// The SCI's 2072 of a year (tenure-api Q-133; Q-W42): its income, loan
// interest and other expenses with the rules of the 2044 réel, and each
// associate's share by the parts held on 31 December; what keeps the year
// from being issued; the issue itself, once, behind the step-up.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { ApiError } from '@/api/client'
import { withStepUp } from '@/app/stepUp'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'
import { money, timestamp } from '@/i18n/format'
import { issue2072, sharePercent, year2072, type Year2072 } from './sci'

const route = useRoute()
const router = useRouter()
const s = useSession()
const year = computed(() => Number(route.params.year))
const data = ref<Year2072 | null>(null)
const failure = ref('')
const confirm = ref(false)
const busy = ref(false)
const issueError = ref('')

async function load(): Promise<void> {
  data.value = null
  failure.value = ''
  try {
    data.value = await year2072(year.value)
  } catch (e) {
    failure.value = e instanceof ApiError ? (e.problem.title ?? t('error.title')) : t('error.network')
  }
}
watch(year, load, { immediate: true })
const blockers = computed(() => (data.value?.blockers ?? []).filter((b) => b !== 'declared'))
const r = computed(() => data.value?.result)

async function doIssue(): Promise<void> {
  busy.value = true
  issueError.value = ''
  try {
    if (await withStepUp(() => issue2072(year.value))) {
      confirm.value = false
      await load()
    }
  } catch (e) {
    issueError.value = e instanceof ApiError ? (e.problem.title ?? t('error.title')) : t('error.network')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="max-w-5xl space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <Button icon="pi pi-chevron-left" text :aria-label="t('bic.previousYear')" data-test="year-prev" @click="router.push(`/sci/2072/${year - 1}`)" />
      <h1 class="text-xl font-semibold" data-test="sci2072-title">{{ t('sci.title2072', { year }) }}</h1>
      <Button icon="pi pi-chevron-right" text :aria-label="t('bic.nextYear')" data-test="year-next" @click="router.push(`/sci/2072/${year + 1}`)" />
      <Tag v-if="data?.declared" :value="t('sci.issuedAt', { at: timestamp(data.issued_at) })" severity="success" data-test="sci2072-declared" />
    </div>
    <p class="text-sm text-slate-600">{{ t('sci.intro2072') }}</p>
    <Message v-if="failure" severity="error" :closable="false" data-test="sci2072-error">{{ failure }}</Message>
    <Skeleton v-else-if="!data || !r" height="10rem" />
    <template v-else>
      <Message v-for="b in blockers" :key="b" severity="warn" :closable="false" data-test="sci2072-blocker">{{ t(`sci.blocker.${b}` as Key) }}</Message>
      <article class="rounded-md border border-slate-200 bg-white p-4" data-test="sci2072-result">
        <h2 class="mb-2 font-semibold">{{ t('sci.result') }}</h2>
        <dl class="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
          <dt>{{ t('sci.income') }}</dt><dd class="amount" data-test="sci2072-income">{{ money(r.income_cents ?? 0) }}</dd>
          <dt>{{ t('sci.interest') }}</dt><dd class="amount">− {{ money(r.interest_cents ?? 0) }}</dd>
          <dt>{{ t('sci.otherExpenses') }}</dt><dd class="amount">− {{ money(r.other_expenses_cents ?? 0) }}</dd>
          <dt class="font-semibold">{{ t('sci.net') }}</dt><dd class="amount font-semibold" data-test="sci2072-net">{{ money(r.net_cents ?? 0) }}</dd>
        </dl>
        <p class="mt-2 text-xs text-slate-500">{{ t('sci.linesNote') }}</p>
      </article>
      <article class="rounded-md border border-slate-200 bg-white p-4" data-test="sci2072-allocations">
        <h2 class="mb-2 font-semibold">{{ t('sci.allocations', { held: data.held_parts ?? 0 }) }}</h2>
        <p v-if="!(data.allocations ?? []).length" class="text-sm text-slate-500" data-test="sci2072-no-allocation">{{ t('sci.noAllocation') }}</p>
        <table v-else class="w-full text-sm">
          <thead class="text-left text-xs text-slate-500"><tr><th class="py-1">{{ t('sci.associateName') }}</th><th class="amount">{{ t('sci.parts') }}</th><th class="amount">{{ t('sci.share') }}</th><th class="amount">{{ t('sci.income') }}</th><th class="amount">{{ t('sci.interest') }}</th><th class="amount">{{ t('sci.otherExpenses') }}</th><th class="amount">{{ t('sci.net') }}</th></tr></thead>
          <tbody>
            <tr v-for="a in data.allocations" :key="a.associate_id" class="border-t border-slate-100" data-test="sci2072-allocation">
              <td class="py-1">{{ a.name }}</td><td class="amount">{{ a.parts }}</td><td class="amount">{{ sharePercent(a.parts, data.held_parts) }}</td>
              <td class="amount">{{ money(a.income_cents ?? 0) }}</td><td class="amount">{{ money(a.interest_cents ?? 0) }}</td>
              <td class="amount">{{ money(a.other_expenses_cents ?? 0) }}</td><td class="amount font-medium" data-test="allocation-net">{{ money(a.net_cents ?? 0) }}</td>
            </tr>
          </tbody>
        </table>
      </article>
      <div v-if="s.canWrite && !data.declared" data-test="sci2072-issue">
        <Button :label="t('sci.issue')" icon="pi pi-send" :disabled="blockers.length > 0" data-test="issue-2072" @click="confirm = true" />
      </div>
    </template>
    <ConfirmDialog v-model:visible="confirm" :title="t('sci.issueTitle', { year })" :body="t('sci.issueBody')" :confirm="t('sci.issueConfirm')" :busy="busy" @confirm="doIssue">
      <Message v-if="issueError" severity="error" :closable="false" data-test="issue-error">{{ issueError }}</Message>
    </ConfirmDialog>
  </section>
</template>
