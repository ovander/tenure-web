<script setup lang="ts">
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { login } from '@/api/client'
import { useSession } from '@/stores/session'
import { t } from '@/i18n'

const s = useSession()
</script>

<template>
  <Dialog v-model:visible="s.stepUpPending" modal :header="t('stepUp.title')" class="w-[28rem]" data-test="step-up">
    <p class="mb-6 text-sm leading-6">{{ t('stepUp.body') }}</p>
    <div class="flex justify-end gap-2">
      <Button :label="t('stepUp.cancel')" severity="secondary" text @click="s.stepUpPending = false" />
      <Button :label="t('stepUp.confirm')" icon="pi pi-shield" autofocus @click="login({ stepUp: true })" />
    </div>
  </Dialog>
</template>
