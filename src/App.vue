<script setup lang="ts">
import Toast from 'primevue/toast'
import AppLayout from './app/AppLayout.vue'
import StepUpDialog from './components/StepUpDialog.vue'
import { useSession } from './stores/session'
import { t } from './i18n'

const s = useSession()
</script>

<template>
  <Toast />
  <StepUpDialog />
  <AppLayout v-if="s.session?.authenticated" />
  <main v-else class="flex h-full items-center justify-center text-slate-500">{{ t('session.loading') }}</main>
</template>
