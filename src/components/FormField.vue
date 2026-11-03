<script setup lang="ts">
// A label above its field, an optional help tip beside the label, and the
// field's error or hint below (RENT-FE-001 §6).
import HelpTip from './HelpTip.vue'

defineProps<{ id: string; label: string; error?: string; hint?: string; help?: string }>()
</script>

<template>
  <div class="flex flex-col gap-1">
    <span class="flex items-center gap-1">
      <label :for="id" class="text-sm font-medium">{{ label }}</label>
      <HelpTip v-if="help" :id="id" :text="help" />
    </span>
    <slot />
    <small v-if="error" class="text-red-600" :data-test="`error-${id}`">{{ error }}</small>
    <small v-else-if="hint" class="text-slate-500">{{ hint }}</small>
  </div>
</template>
