<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Message from 'primevue/message'
import { t } from '@/i18n'

const route = useRoute()
const title = computed(() => (route.meta.title ? t(route.meta.title) : ''))
</script>

<template>
  <section>
    <h1 class="mb-4 text-xl font-semibold">{{ title }}</h1>
    <Message severity="info" :closable="false" data-test="soon">
      <strong>{{ t('soon.title') }}.</strong> {{ t('soon.body') }}
    </Message>
  </section>
</template>
