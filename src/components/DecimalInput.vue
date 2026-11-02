<script setup lang="ts">
// A two-decimal amount kept as an integer (cents, hundredths of m²): typed
// and shown « 1 234,56 », converted by string, never through a float.
import { ref, watch } from 'vue'
import InputText from 'primevue/inputtext'
import InputGroup from 'primevue/inputgroup'
import InputGroupAddon from 'primevue/inputgroupaddon'
import { hundredths, parseHundredths } from '@/i18n/format'

const model = defineModel<number | null | undefined>()
const props = defineProps<{ id: string; suffix: string; invalid?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ invalidInput: [bad: boolean] }>()

const text = ref('')
watch(
  model,
  (v) => {
    if (v == null) text.value = text.value && parseHundredths(text.value) === null ? text.value : ''
    else if (parseHundredths(text.value) !== v) text.value = hundredths(v)
  },
  { immediate: true },
)

function commit(): void {
  const v = parseHundredths(text.value)
  if (Number.isNaN(v)) {
    emit('invalidInput', true)
    return
  }
  emit('invalidInput', false)
  model.value = v
  if (v !== null) text.value = hundredths(v)
}
</script>

<template>
  <InputGroup>
    <InputText
      :id="props.id"
      v-model="text"
      inputmode="decimal"
      class="text-right tabular-nums"
      :invalid="invalid"
      :disabled="disabled"
      @blur="commit"
      @keydown.enter="commit"
    />
    <InputGroupAddon>{{ suffix }}</InputGroupAddon>
  </InputGroup>
</template>
