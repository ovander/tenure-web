<script setup lang="ts">
// S14 Settings › Templates (RENT-FE-001 §3, Q-W24): the document templates
// tenure renders, each with its versions. The latest version is current;
// an issued document keeps the version it was rendered with, so the count per
// version says which documents read which text. Read only: templates come
// with tenure's release and are never edited here (tenure-api Q-106).
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { t, type Key } from '@/i18n'
import { dayOf } from '@/i18n/format'
import { current, listTemplates, rendered, shortHash, type Template } from './templates'

const rows = ref<Template[] | null>(null)
const failed = ref(false)

onMounted(async () => {
  try {
    rows.value = await listTemplates()
  } catch {
    failed.value = true
    rows.value = []
  }
})

function label(x: Template): string {
  const k = `template.name.${x.name}` as Key
  const s = t(k)
  return s === k ? (x.name ?? '') : s
}
</script>

<template>
  <section class="space-y-4" data-test="templates">
    <p class="text-sm leading-6 text-slate-600">{{ t('templates.intro') }}</p>
    <Message v-if="failed" severity="error" :closable="false">{{ t('error.network') }}</Message>
    <div v-if="rows === null" class="space-y-2"><Skeleton v-for="i in 3" :key="i" height="4rem" /></div>
    <p v-else-if="!rows.length && !failed" class="text-sm text-slate-500" data-test="templates-none">{{ t('templates.none') }}</p>
    <article v-for="x in rows ?? []" :key="x.name" class="rounded-md border border-slate-200 bg-white p-4" data-test="template" :data-name="x.name">
      <header class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="font-medium" data-test="template-name">{{ label(x) }}</h2>
        <span class="text-sm text-slate-500">
          {{ t('templates.current', { version: current(x)?.version ?? '' }) }}
          <template v-if="rendered(x) > 0">
            · <RouterLink :to="{ path: '/documents', query: { class: x.class } }" class="text-emerald-800 hover:underline" data-test="template-documents">{{ t('templates.documents', { n: rendered(x) }) }}</RouterLink>
          </template>
        </span>
      </header>
      <table class="w-full text-sm">
        <thead class="text-left text-slate-500">
          <tr>
            <th class="py-1 pr-3 font-normal">{{ t('templates.version') }}</th>
            <th class="py-1 pr-3 font-normal">{{ t('templates.used') }}</th>
            <th class="py-1 pr-3 font-normal">{{ t('templates.period') }}</th>
            <th class="py-1 font-normal">{{ t('templates.sha') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="v in [...(x.versions ?? [])].reverse()" :key="v.version" class="border-t border-slate-100" data-test="template-version">
            <td class="py-1 pr-3">
              <span class="font-mono">{{ v.version }}</span>
              <Tag v-if="v.current" :value="t('templates.inForce')" severity="success" class="ml-2" data-test="version-current" />
            </td>
            <td class="py-1 pr-3" data-test="version-documents">{{ v.documents ? t('templates.count', { n: v.documents }) : t('templates.unused') }}</td>
            <td class="py-1 pr-3">
              <template v-if="v.first_issued_at">{{ t('templates.between', { first: dayOf(v.first_issued_at), last: dayOf(v.last_issued_at) }) }}</template>
              <template v-else>{{ t('common.none') }}</template>
            </td>
            <td class="py-1 font-mono text-xs text-slate-500" :title="v.sha256" data-test="version-sha">{{ shortHash(v.sha256) }}…</td>
          </tr>
        </tbody>
      </table>
    </article>
  </section>
</template>
