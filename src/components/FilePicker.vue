<script setup lang="ts">
// Picks one file for an upload (PDF, JPEG or PNG; 25 MB, checked again and
// scanned by the API).
import { ref } from 'vue'
import Button from 'primevue/button'
import { t } from '@/i18n'

const model = defineModel<File | null>()
defineProps<{ id: string; accept?: string; label?: string }>()
const input = ref<HTMLInputElement | null>(null)

function pick(e: Event): void {
  model.value = (e.target as HTMLInputElement).files?.[0] ?? null
}
</script>

<template>
  <div class="flex items-center gap-3">
    <input :id="id" ref="input" type="file" class="sr-only" :accept="accept ?? 'application/pdf,image/jpeg,image/png'" :data-test="`file-${id}`" @change="pick" />
    <Button type="button" :label="label ?? t('upload.choose')" icon="pi pi-paperclip" severity="secondary" size="small" @click="input?.click()" />
    <span class="truncate text-sm text-slate-600">{{ model?.name }}</span>
  </div>
</template>
