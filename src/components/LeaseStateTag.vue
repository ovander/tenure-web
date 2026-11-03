<script setup lang="ts">
// One colour per state across the app (RENT-FE-001 §6): draft grey, active
// green, notice orange, ended and closed neutral.
import { computed } from 'vue'
import Tag from 'primevue/tag'
import { t, type Key } from '@/i18n'

const props = defineProps<{ state?: string }>()
const severity = computed(() => (({ draft: 'secondary', active: 'success', notice: 'warn', ended: 'contrast', closed: 'contrast' }) as Record<string, string>)[props.state ?? ''] ?? 'secondary')
</script>

<template>
  <Tag :severity="severity" :value="t(`lease.state.${state}` as Key)" data-test="lease-state" />
</template>
