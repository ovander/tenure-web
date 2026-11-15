<script setup lang="ts">
// Records the next version of an asset's component grid (tenure-api
// Q-132): the day first let furnished, the price and the acquisition costs
// (capitalised unless expensed), and a share and a duration per component;
// a version after the first needs its reason. A version is never changed.
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Message from 'primevue/message'
import FormField from '@/components/FormField.vue'
import DayInput from '@/components/DayInput.vue'
import DecimalInput from '@/components/DecimalInput.vue'
import { useProblemForm } from '@/app/form'
import { t, type Key } from '@/i18n'
import { money } from '@/i18n/format'
import { FULL, basisOf, parsePercent, percent, saveGrid, type Grid, type GridInput } from './bic'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ assetId: string; grid: Grid | null }>()
const emit = defineEmits<{ saved: [g: Grid] }>()
const form = ref<GridInput>({ lines: [] })
const shares = ref<string[]>([])
const { errors, summary, busy, submit, reset } = useProblemForm(async () => {
  visible.value = false
})

watch(visible, (v) => {
  if (!v || !props.grid) return
  reset()
  const g = props.grid
  form.value = { in_service_on: g.in_service_on, price_cents: g.price_cents, acquisition_costs_cents: g.acquisition_costs_cents, costs_expensed: g.costs_expensed,
    lines: (g.lines ?? []).map((l) => ({ ...l })), reason: '' }
  shares.value = (g.lines ?? []).map((l) => percent(l.share_bp).replace(' %', ''))
}, { immediate: true })

const parsed = computed(() => shares.value.map(parsePercent))
const total = computed(() => parsed.value.reduce<number>((s, v) => s + (v ?? 0), 0))
const needsReason = computed(() => (props.grid?.version ?? 0) > 0)
const label = (c?: string) => {
  const k = `bic.component.${c}` as Key
  const v = t(k)
  return v === k ? (c ?? '') : v
}

async function save(): Promise<void> {
  const local: Record<string, string> = {}
  if (!form.value.in_service_on) local.in_service_on = t('bic.inServiceRequired')
  if (parsed.value.some((v) => v === null) || total.value !== FULL) local.lines = t('bic.sharesInvalid', { total: percent(total.value) })
  if (needsReason.value && !form.value.reason?.trim()) local.reason = t('bic.reasonRequired')
  let g: Grid | undefined
  const ok = await submit(async () => {
    const lines = (form.value.lines ?? []).map((l, i) => ({ ...l, share_bp: parsed.value[i] ?? 0 }))
    g = await saveGrid(props.assetId, props.grid?.version ?? 0, { ...form.value, lines, reason: form.value.reason?.trim() || undefined })
  }, local)
  if (ok && g) {
    visible.value = false
    emit('saved', g)
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="t('bic.gridEdit')" class="w-[44rem]" data-test="grid-dialog">
    <Message v-if="summary" severity="error" :closable="false" class="mb-3" data-test="form-error">{{ summary }}</Message>
    <div class="space-y-4">
      <div class="grid gap-4 sm:grid-cols-3">
        <FormField id="g_in" :label="t('bic.inServiceOn')" :help="t('help.bic.inService')" :error="errors.in_service_on">
          <DayInput id="g_in" v-model="form.in_service_on" :invalid="!!errors.in_service_on" />
        </FormField>
        <FormField id="g_price" :label="t('bic.price')" :error="errors.price_cents">
          <DecimalInput id="g_price" v-model="form.price_cents" suffix="€" />
        </FormField>
        <FormField id="g_costs" :label="t('bic.acquisitionCosts')" :help="t('help.bic.costs')" :error="errors.acquisition_costs_cents">
          <DecimalInput id="g_costs" v-model="form.acquisition_costs_cents" suffix="€" />
        </FormField>
      </div>
      <label class="flex items-center gap-2 text-sm"><Checkbox v-model="form.costs_expensed" binary input-id="g_exp" data-test="grid-costs-expensed" /> {{ t('bic.costsExpensed') }}</label>
      <p class="text-sm text-slate-600" data-test="grid-basis">{{ t('bic.basisLine', { basis: money(basisOf(form)) }) }}</p>
      <FormField id="g_lines" :label="t('bic.components')" :help="t('help.bic.components')" :error="errors.lines">
        <table class="w-full text-sm">
          <thead class="text-left text-xs text-slate-500"><tr><th>{{ t('bic.component') }}</th><th>{{ t('bic.share') }}</th><th>{{ t('bic.months') }}</th></tr></thead>
          <tbody>
            <tr v-for="(l, i) in form.lines ?? []" :key="l.component" data-test="grid-line">
              <td class="py-1">{{ label(l.component) }}</td>
              <td><InputText v-model="shares[i]" class="w-24" :invalid="parsed[i] === null" :data-test="`grid-share-${l.component}`" /> %</td>
              <td><InputNumber v-model="l.months" :min="0" :max="1200" :input-id="`g_m_${i}`" class="w-28" /></td>
            </tr>
          </tbody>
        </table>
        <p class="mt-1 text-xs" :class="total === FULL ? 'text-slate-500' : 'text-orange-700'" data-test="grid-total">{{ t('bic.sharesTotal', { total: percent(total) }) }}</p>
      </FormField>
      <FormField v-if="needsReason" id="g_reason" :label="t('bic.reason')" :error="errors.reason">
        <Textarea id="g_reason" v-model="form.reason" rows="2" class="w-full" data-test="grid-reason" />
      </FormField>
    </div>
    <template #footer>
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button :label="t('common.save')" icon="pi pi-check" :loading="busy" data-test="grid-save" @click="save" />
    </template>
  </Dialog>
</template>
