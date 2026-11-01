<script setup lang="ts">
// One colour per state across the app (RENT-FE-001 §6).
import { computed } from 'vue'
import Tag from 'primevue/tag'
import { t, type Key } from '@/i18n'

const props = defineProps<{ status: string }>()
const severity = computed(
  () => (({ succeeded: 'success', failed: 'danger', partial: 'warn', running: 'info' }) as Record<string, string>)[props.status] ?? 'secondary',
)
</script>

<template>
  <Tag :severity="severity" :value="t(`status.${status}` as Key)" />
</template>
