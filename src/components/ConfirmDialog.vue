<script setup lang="ts">
// Confirms an irreversible action, restating what it will do
// (RENT-FE-001 §6). The slot holds any input the action needs.
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { t } from '@/i18n'

const visible = defineModel<boolean>('visible')
defineProps<{ title: string; body: string; confirm: string; busy?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ confirm: [] }>()
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="title" class="w-[30rem]" data-test="confirm-dialog">
    <p class="mb-4 text-sm leading-6">{{ body }}</p>
    <slot />
    <div class="mt-6 flex justify-end gap-2">
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button :label="confirm" :loading="busy" :disabled="disabled" data-test="confirm" @click="emit('confirm')" />
    </div>
  </Dialog>
</template>
