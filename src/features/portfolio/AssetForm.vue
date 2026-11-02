<script setup lang="ts">
// S04 Asset form: create (/assets/new) or edit (/assets/{id}/edit). Euros and
// m² are typed with two decimals and sent as integers; the kind is fixed once
// created; a box may hang off a dwelling; a controlled zone needs its zone and
// category. Shares are kept as they are (Q-W6).
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import FormField from '@/components/FormField.vue'
import DecimalInput from '@/components/DecimalInput.vue'
import DayInput from '@/components/DayInput.vue'
import { useProblemForm } from '@/app/form'
import { useAssets, assetLabel, toInput, dwellingKinds, type Asset, type AssetInput, type AssetKind } from './store'
import { t, type Key } from '@/i18n'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const store = useAssets()
const id = computed(() => route.params.id as string | undefined)
const existing = ref<Asset | null>(null)
const dwellings = ref<Asset[]>([])
const badNumber = reactive({ surface: false, acquisition: false })
const form = reactive<AssetInput>({ kind: 'apartment', address: '', lot: '', furnished: false, controlled_zone: false, rent_control_zone: '', rent_control_category: '' })

async function reload(): Promise<void> {
  if (!id.value) return
  existing.value = await store.get(id.value)
  Object.assign(form, toInput(existing.value))
}
const { errors, summary, busy, submit } = useProblemForm(reload)

onMounted(async () => {
  await reload()
  dwellings.value = (await store.dwellings()).filter((a) => a.id !== id.value)
})

const kinds = computed(() => (['house', 'apartment', 'box'] as AssetKind[]).map((k) => ({ value: k, label: t(`kind.${k}` as Key) })))
const isDwelling = computed(() => !!form.kind && dwellingKinds.includes(form.kind))
const dpeClasses = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c) => ({ value: c, label: c }))
const parents = computed(() => [{ value: '', label: t('form.parentNone') }, ...dwellings.value.map((a) => ({ value: a.id ?? '', label: assetLabel(a) }))])
const parent = computed({ get: () => form.parent_asset_id ?? '', set: (v: string) => (form.parent_asset_id = v || undefined) })

async function save(): Promise<void> {
  const local: Record<string, string> = {}
  if (badNumber.surface) local.surface_hundredths_m2 = t('common.invalidNumber')
  if (badNumber.acquisition) local.acquisition_cents = t('common.invalidNumber')
  const body: AssetInput = { ...form }
  if (!isDwelling.value) {
    Object.assign(body, { furnished: false, dpe_class: undefined, controlled_zone: false, rent_control_zone: '', rent_control_category: '' })
  } else {
    body.parent_asset_id = undefined
    if (!body.controlled_zone) Object.assign(body, { rent_control_zone: '', rent_control_category: '' })
  }
  let saved: Asset | undefined
  const ok = await submit(async () => {
    saved = existing.value?.id ? await store.update(existing.value.id, body, existing.value.version ?? 0) : await store.create(body)
  }, local)
  if (ok && saved?.id) {
    toast.add({ severity: 'success', summary: t('common.saved'), life: 3000 })
    await router.push(`/assets/${saved.id}`)
  }
}
</script>

<template>
  <section class="max-w-3xl">
    <h1 class="mb-6 text-xl font-semibold">{{ id ? t('form.editAsset') : t('form.newAsset') }}</h1>
    <form class="space-y-5" novalidate data-test="asset-form" @submit.prevent="save">
      <Message v-if="summary" severity="error" :closable="false" data-test="form-error">{{ summary }}</Message>
      <FormField id="kind" :label="t('assets.kind')" :error="errors.kind" :hint="id ? t('form.kindLocked') : undefined">
        <SelectButton id="kind" v-model="form.kind" :options="kinds" option-label="label" option-value="value" :allow-empty="false" :disabled="!!id" />
      </FormField>
      <div class="grid gap-5 md:grid-cols-2">
        <FormField id="address" :label="t('assets.address')" :error="errors.address" class="md:col-span-2">
          <Textarea id="address" v-model="form.address" rows="2" :invalid="!!errors.address" autocomplete="street-address" />
        </FormField>
        <FormField id="lot" :label="`${t('assets.lot')} (${t('common.optional')})`" :error="errors.lot">
          <InputText id="lot" v-model="form.lot" />
        </FormField>
        <FormField v-if="form.kind !== 'box'" id="surface" :label="t('form.surface')" :error="errors.surface_hundredths_m2">
          <DecimalInput id="surface" v-model="form.surface_hundredths_m2" suffix="m²" :invalid="!!errors.surface_hundredths_m2" @invalid-input="(b) => (badNumber.surface = b)" />
        </FormField>
        <FormField v-else id="parent" :label="t('form.parent')" :error="errors.parent_asset_id">
          <Select v-model="parent" input-id="parent" :options="parents" option-label="label" option-value="value" :invalid="!!errors.parent_asset_id" />
        </FormField>
      </div>
      <template v-if="isDwelling">
        <div class="grid gap-5 md:grid-cols-2">
          <div class="flex items-center gap-3">
            <ToggleSwitch v-model="form.furnished" input-id="furnished" />
            <label for="furnished" class="text-sm font-medium">{{ t('assets.furnished') }}</label>
          </div>
          <FormField id="dpe" :label="t('form.dpe')" :error="errors.dpe_class">
            <Select v-model="form.dpe_class" input-id="dpe" :options="dpeClasses" option-label="label" option-value="value" show-clear class="w-40" />
          </FormField>
        </div>
        <div class="flex items-center gap-3">
          <ToggleSwitch v-model="form.controlled_zone" input-id="controlled_zone" />
          <label for="controlled_zone" class="text-sm font-medium">{{ t('form.controlledZone') }}</label>
        </div>
        <div v-if="form.controlled_zone" class="grid gap-5 md:grid-cols-2">
          <FormField id="rent_zone" :label="t('form.rentZone')" :error="errors.rent_control_zone">
            <InputText id="rent_zone" v-model="form.rent_control_zone" :invalid="!!errors.rent_control_zone" />
          </FormField>
          <FormField id="rent_category" :label="t('form.rentCategory')" :error="errors.rent_control_category">
            <InputText id="rent_category" v-model="form.rent_control_category" />
          </FormField>
        </div>
      </template>
      <div class="grid gap-5 md:grid-cols-2">
        <FormField id="acquired_on" :label="`${t('form.acquiredOn')} (${t('common.optional')})`" :error="errors.acquired_on">
          <DayInput id="acquired_on" v-model="form.acquired_on" :invalid="!!errors.acquired_on" />
        </FormField>
        <FormField id="acquisition" :label="`${t('form.acquisition')} (${t('common.optional')})`" :error="errors.acquisition_cents">
          <DecimalInput id="acquisition" v-model="form.acquisition_cents" suffix="€" :invalid="!!errors.acquisition_cents" @invalid-input="(b) => (badNumber.acquisition = b)" />
        </FormField>
      </div>
      <p v-if="errors.shares" class="text-sm text-red-600">{{ errors.shares }}</p>
      <p v-if="id" class="text-sm text-slate-500">{{ t('form.sharesKept') }}</p>
      <div class="flex gap-2">
        <Button type="submit" :label="t('common.save')" :loading="busy" data-test="save" />
        <RouterLink :to="id ? `/assets/${id}` : '/assets'"><Button :label="t('common.cancel')" severity="secondary" text /></RouterLink>
      </div>
    </form>
  </section>
</template>
