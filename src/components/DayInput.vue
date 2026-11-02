<script setup lang="ts">
// A calendar day as YYYY-MM-DD, picked and shown « 31/01/2026 », without a
// time zone shift.
import { computed } from 'vue'
import DatePicker from 'primevue/datepicker'
import { isoDay, localDay } from '@/i18n/format'

const model = defineModel<string | null | undefined>()
defineProps<{ id: string; invalid?: boolean; disabled?: boolean }>()

const value = computed<Date | null>({
  get: () => localDay(model.value),
  set: (d) => (model.value = isoDay(d) ?? null),
})
</script>

<template>
  <DatePicker v-model="value" :input-id="id" date-format="dd/mm/yy" show-icon show-button-bar :invalid="invalid" :disabled="disabled" />
</template>
