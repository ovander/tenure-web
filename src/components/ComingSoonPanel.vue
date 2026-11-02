<script setup lang="ts">
import Message from 'primevue/message'
import { t } from '@/i18n'
</script>

<template>
  <Message severity="info" :closable="false" data-test="soon">
    <strong>{{ t('soon.title') }}.</strong> {{ t('soon.body') }}
  </Message>
</template>
