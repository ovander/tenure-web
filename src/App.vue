<script setup lang="ts">
import { watch } from 'vue'
import Toast from 'primevue/toast'
import { usePrimeVue } from 'primevue/config'
import AppLayout from './app/AppLayout.vue'
import StepUpDialog from './components/StepUpDialog.vue'
import { useSession } from './stores/session'
import { language, t } from './i18n'
import { primevueLocale } from './app/primevueLocale'

const s = useSession()
const primevue = usePrimeVue()
watch(language, (l) => Object.assign(primevue.config.locale ?? {}, primevueLocale[l]), { immediate: true })
</script>

<template>
  <Toast />
  <StepUpDialog />
  <AppLayout v-if="s.session?.authenticated" />
  <main v-else class="flex h-full items-center justify-center text-slate-500">{{ t('session.loading') }}</main>
</template>
