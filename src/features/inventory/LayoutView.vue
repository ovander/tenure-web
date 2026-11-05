<script setup lang="ts">
// S15a Asset layout (RENT-INV-001 §8, Q-W25): the rooms of an asset and their
// elements, which every inventory starts from. Seeded once from the template
// of the asset's kind, then edited as a whole and saved with If-Match; a
// concurrent save reloads it. The co-owner reads; write controls are for the
// owner only, and an accountant has no access (the API refuses).
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Skeleton from 'primevue/skeleton'
import { useToast } from 'primevue/usetoast'
import DayInput from '@/components/DayInput.vue'
import FormField from '@/components/FormField.vue'
import HelpTip from '@/components/HelpTip.vue'
import { ApiError } from '@/api/client'
import { useProblemForm } from '@/app/form'
import { useSession } from '@/stores/session'
import { useAssets, assetLabel, type Asset } from '@/features/portfolio/store'
import { t, type Key } from '@/i18n'
import { date } from '@/i18n/format'
import {
  categories, elementCount, features, getLayout, move, newElement, newRoom, roomKinds, saveLayout, seedLayout, toEdit,
  type EditRoom,
} from './layout'

const route = useRoute()
const toast = useToast()
const s = useSession()
const assets = useAssets()
const id = computed(() => route.params.id as string)
const asset = ref<Asset | null>(null)
const version = ref(0)
const rooms = ref<EditRoom[] | null>(null)
const denied = ref(false)
const dirty = ref(false)
const seed = ref({ bedrooms: 1, furnished: false, cellar: false, garage: false, garden: false })

async function reload(): Promise<void> {
  const l = await getLayout(id.value)
  version.value = l.version ?? 0
  rooms.value = toEdit(l)
  dirty.value = false
}
const { errors, summary, busy, submit } = useProblemForm(reload)

onMounted(async () => {
  try {
    asset.value = await assets.get(id.value)
    seed.value.furnished = !!asset.value.furnished
    await reload()
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) denied.value = true
    rooms.value = []
  }
})

const kinds = roomKinds.map((k) => ({ value: k, label: t(`room.kind.${k}` as Key) }))
const cats = categories.map((c) => ({ value: c, label: t(`element.category.${c}` as Key) }))
const isBox = computed(() => asset.value?.kind === 'box')

function changed(): void {
  dirty.value = true
}
function moveRoom(i: number, d: number): void {
  if (rooms.value) rooms.value = move(rooms.value, i, d)
  changed()
}
function moveElement(r: EditRoom, i: number, d: number): void {
  r.elements = move(r.elements, i, d)
  changed()
}
function removeRoom(i: number): void {
  rooms.value?.splice(i, 1)
  changed()
}
function addRoom(): void {
  rooms.value?.push(newRoom())
  changed()
}
function addElement(r: EditRoom): void {
  r.elements.push(newElement())
  changed()
}

async function doSeed(): Promise<void> {
  const ok = await submit(async () => {
    const l = await seedLayout(id.value, {
      bedrooms: isBox.value ? 0 : seed.value.bedrooms,
      furnished: seed.value.furnished,
      features: Object.fromEntries(features.filter((f) => seed.value[f]).map((f) => [f, true])),
    })
    version.value = l.version ?? 0
    rooms.value = toEdit(l)
  })
  if (ok) toast.add({ severity: 'success', summary: t('layout.seeded'), life: 3000 })
}
async function save(): Promise<void> {
  if (!rooms.value) return
  const current = rooms.value
  const ok = await submit(async () => {
    const l = await saveLayout(id.value, version.value, current)
    version.value = l.version ?? 0
    rooms.value = toEdit(l)
    dirty.value = false
  })
  if (ok) toast.add({ severity: 'success', summary: t('common.saved'), life: 3000 })
}
// A field error names its path (rooms[2].elements[0].label): shown on its row.
function err(path: string): string | undefined {
  return errors.value[path]
}
</script>

<template>
  <section class="max-w-5xl space-y-4" data-test="layout">
    <nav class="text-sm text-slate-500" aria-label="breadcrumb">
      <RouterLink to="/assets" class="hover:underline">{{ t('assets.title') }}</RouterLink>
      <template v-if="asset">
        <span class="mx-2">›</span>
        <RouterLink :to="`/assets/${asset.id}`" class="hover:underline" data-test="crumb-asset">{{ assetLabel(asset) }}</RouterLink>
      </template>
      <span class="mx-2">›</span>
      <span class="text-slate-700">{{ t('layout.title') }}</span>
    </nav>
    <h1 class="flex items-center gap-2 text-xl font-semibold">{{ t('layout.title') }} <HelpTip id="layout" :text="t('help.layout')" /></h1>

    <Message v-if="denied" severity="warn" :closable="false" data-test="layout-denied">{{ t('layout.denied') }}</Message>
    <Skeleton v-else-if="rooms === null" height="10rem" />
    <template v-else>
      <Message v-if="summary" severity="error" :closable="false" data-test="form-error">{{ summary }}</Message>

      <!-- No layout yet: seed it from the template. -->
      <div v-if="rooms.length === 0" class="rounded-md border border-slate-200 bg-white p-5" data-test="seed">
        <p class="mb-4 text-sm leading-6 text-slate-600">{{ t(s.canWrite ? 'layout.empty' : 'layout.emptyRead') }}</p>
        <template v-if="s.canWrite">
          <div class="grid gap-4 md:grid-cols-2">
            <FormField v-if="!isBox" id="seed_bedrooms" :help="t('help.layout.bedrooms')" :label="t('layout.bedrooms')" :error="errors.bedrooms">
              <InputNumber v-model="seed.bedrooms" input-id="seed_bedrooms" :min="0" :max="60" show-buttons />
            </FormField>
            <div class="space-y-2">
              <div v-if="!isBox" class="flex items-center gap-2">
                <Checkbox v-model="seed.furnished" input-id="seed_furnished" binary />
                <label for="seed_furnished" class="text-sm">{{ t('layout.furnished') }}</label>
                <HelpTip id="seed_furnished" :text="t('help.layout.furnished')" />
              </div>
              <template v-if="!isBox">
                <div v-for="f in features" :key="f" class="flex items-center gap-2">
                  <Checkbox v-model="seed[f]" :input-id="`seed_${f}`" binary />
                  <label :for="`seed_${f}`" class="text-sm">{{ t(`layout.feature.${f}` as Key) }}</label>
                </div>
              </template>
            </div>
          </div>
          <Button class="mt-4" :label="t('layout.seed')" icon="pi pi-th-large" :loading="busy" data-test="seed-layout" @click="doSeed" />
        </template>
      </div>

      <!-- The layout. -->
      <template v-else>
        <p class="text-sm text-slate-500" data-test="layout-summary">{{ t('layout.summary', { rooms: rooms.length, elements: elementCount(rooms) }) }}</p>
        <article v-for="(r, i) in rooms" :key="r.key" class="rounded-md border border-slate-200 bg-white p-4" data-test="room">
          <header class="mb-3 flex flex-wrap items-end gap-2">
            <template v-if="s.canWrite">
              <FormField :id="`room_${i}_label`" :label="t('layout.roomLabel')" :error="err(`rooms[${i}].label`)" class="min-w-0 flex-1">
                <InputText :id="`room_${i}_label`" v-model="r.label" :invalid="!!err(`rooms[${i}].label`)" data-test="room-label" @input="changed" />
              </FormField>
              <FormField :id="`room_${i}_kind`" :label="t('layout.roomKind')" :error="err(`rooms[${i}].kind`)">
                <Select v-model="r.kind" :input-id="`room_${i}_kind`" :options="kinds" option-label="label" option-value="value" class="w-44" @change="changed" />
              </FormField>
              <div class="flex gap-1 pb-1">
                <Button icon="pi pi-arrow-up" text severity="secondary" :aria-label="t('layout.up')" :disabled="i === 0" data-test="room-up" @click="moveRoom(i, -1)" />
                <Button icon="pi pi-arrow-down" text severity="secondary" :aria-label="t('layout.down')" :disabled="i === rooms.length - 1" data-test="room-down" @click="moveRoom(i, 1)" />
                <Button icon="pi pi-trash" text severity="danger" :aria-label="t('layout.removeRoom')" data-test="room-remove" @click="removeRoom(i)" />
              </div>
            </template>
            <h2 v-else class="font-medium" data-test="room-label">{{ r.label }} <span class="text-sm font-normal text-slate-500">· {{ t(`room.kind.${r.kind}` as Key) }}</span></h2>
          </header>
          <table class="w-full text-sm">
            <thead class="text-left text-slate-500">
              <tr>
                <th class="py-1 pr-2 font-normal">{{ t('layout.element') }}</th>
                <th class="py-1 pr-2 font-normal">{{ t('layout.category') }}</th>
                <th class="py-1 pr-2 font-normal">{{ t('layout.quantity') }}</th>
                <th class="py-1 pr-2 font-normal">{{ t('layout.installedOn') }} <HelpTip :id="`installed_${i}`" :text="t('help.layout.installedOn')" /></th>
                <th v-if="s.canWrite" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="(e, j) in r.elements" :key="e.key" class="border-t border-slate-100 align-top" data-test="element">
                <template v-if="s.canWrite">
                  <td class="py-1 pr-2">
                    <InputText v-model="e.label" :aria-label="t('layout.element')" class="w-full" :invalid="!!err(`rooms[${i}].elements[${j}].label`)" data-test="element-label" @input="changed" />
                  </td>
                  <td class="py-1 pr-2">
                    <Select v-model="e.category" :options="cats" option-label="label" option-value="value" :aria-label="t('layout.category')" class="w-40" @change="changed" />
                  </td>
                  <td class="py-1 pr-2">
                    <InputNumber v-model="e.quantity" :min="0" :aria-label="t('layout.quantity')" input-class="w-16" @input="changed" />
                  </td>
                  <td class="py-1 pr-2">
                    <DayInput :id="`el_${i}_${j}_installed`" v-model="e.installed_on" :invalid="!!err(`rooms[${i}].elements[${j}].installed_on`)" @update:model-value="changed" />
                    <small v-if="err(`rooms[${i}].elements[${j}].installed_on`)" class="text-red-700">{{ err(`rooms[${i}].elements[${j}].installed_on`) }}</small>
                  </td>
                  <td class="whitespace-nowrap py-1">
                    <Button icon="pi pi-arrow-up" text size="small" severity="secondary" :aria-label="t('layout.up')" :disabled="j === 0" @click="moveElement(r, j, -1)" />
                    <Button icon="pi pi-arrow-down" text size="small" severity="secondary" :aria-label="t('layout.down')" :disabled="j === r.elements.length - 1" @click="moveElement(r, j, 1)" />
                    <Button icon="pi pi-times" text size="small" severity="danger" :aria-label="t('layout.removeElement')" data-test="element-remove" @click="r.elements.splice(j, 1); changed()" />
                  </td>
                </template>
                <template v-else>
                  <td class="py-1 pr-2" data-test="element-label">{{ e.label }}</td>
                  <td class="py-1 pr-2">{{ t(`element.category.${e.category}` as Key) }}</td>
                  <td class="py-1 pr-2">{{ e.quantity || t('common.none') }}</td>
                  <td class="py-1 pr-2">{{ e.installed_on ? date(e.installed_on) : t('common.none') }}</td>
                </template>
              </tr>
            </tbody>
          </table>
          <Button v-if="s.canWrite" class="mt-2" :label="t('layout.addElement')" icon="pi pi-plus" text size="small" data-test="add-element" @click="addElement(r)" />
        </article>
        <div v-if="s.canWrite" class="flex flex-wrap items-center gap-3">
          <Button :label="t('layout.addRoom')" icon="pi pi-plus" severity="secondary" data-test="add-room" @click="addRoom" />
          <Button :label="t('common.save')" icon="pi pi-check" :loading="busy" :disabled="!dirty" data-test="save-layout" @click="save" />
          <span v-if="dirty" class="text-sm text-amber-700" data-test="unsaved">{{ t('layout.unsaved') }}</span>
        </div>
      </template>
    </template>
  </section>
</template>
