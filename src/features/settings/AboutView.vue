<script setup lang="ts">
// Settings › À propos (Q-W31): which build of the web app and of the API is
// running, with the toolchain, the schema and the web release the API pins,
// and a block to copy into a bug report.
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import { t } from '@/i18n'
import { timestamp } from '@/i18n/format'
import { apiBuild, mismatch, report, webBuild, type ApiBuild } from '@/app/build'

const toast = useToast()
const build = ref<ApiBuild | null>(null)
const failed = ref(false)
const loading = ref(true)
onMounted(async () => {
  try {
    build.value = await apiBuild()
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
})
const x = computed(() => build.value?.api)
const short = (c: string | undefined) => (c ? c.slice(0, 12) : t('about.unknown'))
async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(report(webBuild, build.value))
    toast.add({ severity: 'success', summary: t('about.copied'), life: 3000 })
  } catch {
    toast.add({ severity: 'warn', summary: t('about.copyFailed'), life: 4000 })
  }
}
</script>

<template>
  <section class="space-y-4" data-test="about">
    <div class="rounded-md border border-slate-200 bg-white p-4">
      <h2 class="mb-2 font-medium">{{ t('about.web') }}</h2>
      <dl class="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
        <dt class="text-slate-500">{{ t('about.version') }}</dt>
        <dd data-test="web-version">v{{ webBuild.version }} <Tag v-if="webBuild.dev" :value="t('about.viteDev')" severity="warn" class="ml-2" /></dd>
        <dt class="text-slate-500">{{ t('about.framework') }}</dt>
        <dd data-test="web-framework">Vue {{ webBuild.vue }} · PrimeVue {{ webBuild.primevue }} · Vite {{ webBuild.vite }}</dd>
      </dl>
    </div>

    <div class="rounded-md border border-slate-200 bg-white p-4">
      <h2 class="mb-2 font-medium">{{ t('about.api') }}</h2>
      <Skeleton v-if="loading" height="6rem" />
      <Message v-else-if="failed || !x" severity="warn" :closable="false" data-test="api-unavailable">{{ t('about.apiUnavailable') }}</Message>
      <dl v-else class="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
        <dt class="text-slate-500">{{ t('about.version') }}</dt>
        <dd data-test="api-version">
          {{ x.version }}
          <Tag :value="t(x.stamped ? 'about.release' : 'about.unstamped')" :severity="x.stamped ? 'success' : 'warn'" class="ml-2" data-test="api-stamp" />
          <Tag v-if="x.modified" :value="t('about.modified')" severity="warn" class="ml-1" />
        </dd>
        <dt class="text-slate-500">{{ t('about.commit') }}</dt>
        <dd class="font-mono" data-test="api-commit">{{ short(x.commit) }}</dd>
        <dt class="text-slate-500">{{ t('about.built') }}</dt>
        <dd data-test="api-built">{{ x.build_time ? timestamp(x.build_time) : t('about.unknown') }}</dd>
        <dt class="text-slate-500">{{ t('about.toolchain') }}</dt>
        <dd data-test="api-go">{{ x.go_version }} · {{ x.platform }}</dd>
        <dt class="text-slate-500">backendkit</dt>
        <dd data-test="api-backendkit">{{ x.backendkit || t('about.unknown') }}</dd>
        <dt class="text-slate-500">{{ t('about.schema') }}</dt>
        <dd data-test="api-schema">{{ x.schema || t('about.unknown') }}</dd>
        <dt class="text-slate-500">{{ t('about.pinnedWeb') }}</dt>
        <dd data-test="api-web">{{ build?.web?.release || t('about.none') }}</dd>
      </dl>
      <Message v-if="mismatch(webBuild, build)" severity="warn" :closable="false" class="mt-3" data-test="mismatch">
        {{ t('about.mismatch', { web: `v${webBuild.version}`, pinned: build?.web?.release ?? '' }) }}
      </Message>
    </div>

    <Button :label="t('about.copy')" icon="pi pi-copy" severity="secondary" data-test="about-copy" @click="copy" />
  </section>
</template>
