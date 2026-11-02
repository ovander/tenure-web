<script setup lang="ts">
// A label above its field and the field's error below (RENT-FE-001 §6).
defineProps<{ id: string; label: string; error?: string; hint?: string }>()
</script>

<template>
  <div class="flex flex-col gap-1">
    <label :for="id" class="text-sm font-medium">{{ label }}</label>
    <slot />
    <small v-if="error" class="text-red-600" :data-test="`error-${id}`">{{ error }}</small>
    <small v-else-if="hint" class="text-slate-500">{{ hint }}</small>
  </div>
</template>
