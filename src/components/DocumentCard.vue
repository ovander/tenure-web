<script setup lang="ts">
// A generated document (RENT-FE-001 §6): number, kind, issued date, hash in a
// tooltip, Download through the 10-minute signed link. Never an edit control.
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import { download } from '@/features/lease/store'
import { t } from '@/i18n'
import { timestamp } from '@/i18n/format'

const props = defineProps<{ number?: string; label: string; issuedAt?: string; sha256?: string; documentId?: string }>()
const toast = useToast()

async function open(): Promise<void> {
  if (!props.documentId) return
  try {
    await download(props.documentId)
  } catch {
    toast.add({ severity: 'error', summary: t('error.network'), life: 4000 })
  }
}
</script>

<template>
  <div class="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-white px-4 py-3" data-test="document-card">
    <div class="min-w-0">
      <p class="font-medium">{{ label }} <span v-if="number" class="font-mono text-sm text-slate-600">{{ number }}</span></p>
      <p class="text-sm text-slate-500">
        <span v-if="issuedAt">{{ t('doc.issued') }} {{ timestamp(issuedAt) }}</span>
        <span v-if="sha256" :title="`${t('doc.hash')} : ${sha256}`" class="ml-2 cursor-help underline decoration-dotted">SHA-256</span>
      </p>
    </div>
    <Button v-if="documentId" :label="t('doc.download')" icon="pi pi-download" size="small" severity="secondary" data-test="download" @click="open" />
  </div>
</template>
