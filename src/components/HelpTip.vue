<script setup lang="ts">
// A help tip beside a field label: what is asked and why. Shown on hover and
// on keyboard focus, read by screen readers through aria-describedby. CSS
// only, so nothing writes a style attribute the CSP would refuse (Q-W1).
defineProps<{ id: string; text: string }>()
</script>

<template>
  <span class="group relative inline-flex align-middle">
    <button type="button" class="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:text-emerald-700 focus:text-emerald-700 focus:outline-2 focus:outline-emerald-600" :aria-describedby="`${id}-help`" :aria-label="text" :data-test="`help-${id}`">
      <i class="pi pi-question-circle text-sm" aria-hidden="true" />
    </button>
    <span
      :id="`${id}-help`"
      role="tooltip"
      class="invisible absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-md bg-slate-800 px-3 py-2 text-xs font-normal leading-5 text-white opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      :data-test="`help-text-${id}`"
    >{{ text }}</span>
  </span>
</template>
