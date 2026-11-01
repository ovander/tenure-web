<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { t } from '@/i18n'
</script>

<template>
  <section>
    <h1 class="mb-4 text-xl font-semibold">{{ t('notFound.title') }}</h1>
    <RouterLink to="/" class="text-emerald-700 underline">{{ t('notFound.back') }}</RouterLink>
  </section>
</template>
