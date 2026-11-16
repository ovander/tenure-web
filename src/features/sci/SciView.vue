<script setup lang="ts">
// The SCI's page (tenure-api Q-133; Q-W42), in its own scope: its profile,
// its register of associates with the parts each holds on a day (today by
// default) and their holdings, and the movements of parts.
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import DayInput from '@/components/DayInput.vue'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'
import { date } from '@/i18n/format'
import AssociateDialog from './AssociateDialog.vue'
import EntityDialog from './EntityDialog.vue'
import MovementDialog from './MovementDialog.vue'
import { entity as getEntity, movements as getMovements, register as getRegister, sharePercent, type Associate, type Entity, type Movement, type Register } from './sci'

const s = useSession()
const ent = ref<Entity | null>(null)
const reg = ref<Register | null>(null)
const moves = ref<Movement[] | null>(null)
const on = ref<string | null>(null)
const failure = ref('')
const editing = ref(false)
const assocDialog = ref(false)
const assoc = ref<Associate | null>(null)
const moveDialog = ref(false)

async function load(): Promise<void> {
  failure.value = ''
  try {
    ;[ent.value, reg.value, moves.value] = await Promise.all([getEntity(), getRegister(on.value ?? undefined), getMovements()])
  } catch {
    failure.value = t('error.network')
  }
}
onMounted(load)
watch(on, async (d) => (reg.value = await getRegister(d ?? undefined)))
const names = computed(() => new Map((reg.value?.associates ?? []).map((a) => [a.id, a.name])))
const complete = computed(() => reg.value && reg.value.held_parts === reg.value.capital_parts)
const editAssoc = (a: Associate | null) => {
  assoc.value = a
  assocDialog.value = true
}
</script>

<template>
  <section class="max-w-5xl space-y-5">
    <Message v-if="failure" severity="error" :closable="false" data-test="sci-error">{{ failure }}</Message>
    <Skeleton v-if="!ent" height="6rem" />
    <article v-else class="rounded-md border border-slate-200 bg-white p-4" data-test="sci-profile">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold" data-test="sci-name">{{ ent.legal_name }} <Tag :value="t('sci.regimeIR')" severity="info" class="ml-2" /></h1>
          <p class="text-sm text-slate-600">
            <span v-if="ent.siren">{{ t('sci.sirenLine', { siren: ent.siren }) }} · </span>
            <span data-test="sci-capital">{{ t('sci.capitalLine', { parts: ent.capital_parts ?? 0 }) }}</span>
            <span v-if="ent.regime_from"> · {{ t('sci.regimeFromLine', { on: date(ent.regime_from) }) }}</span>
          </p>
          <p v-if="ent.address" class="text-sm text-slate-500">{{ ent.address }}</p>
        </div>
        <div class="flex gap-2">
          <RouterLink to="/sci/2072"><Button :label="t('nav.sci2072')" icon="pi pi-file" size="small" severity="secondary" /></RouterLink>
          <Button v-if="s.canWrite" :label="t('sci.edit')" icon="pi pi-pencil" size="small" severity="secondary" data-test="sci-edit" @click="editing = true" />
        </div>
      </div>
    </article>

    <article class="rounded-md border border-slate-200 bg-white p-4" data-test="register">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="font-semibold">{{ t('sci.register') }}</h2>
        <div class="flex flex-wrap items-center gap-2">
          <label class="text-sm text-slate-600" for="reg_on">{{ t('sci.on') }}</label>
          <DayInput id="reg_on" v-model="on" class="w-36" data-test="register-on" />
          <Button v-if="s.canWrite" :label="t('sci.associateAdd')" icon="pi pi-user-plus" size="small" data-test="associate-add" @click="editAssoc(null)" />
          <Button
            v-if="s.canWrite && (reg?.associates ?? []).length" :label="t('sci.movementAdd')" icon="pi pi-arrow-right-arrow-left" size="small"
            severity="secondary" data-test="movement-add" @click="moveDialog = true"
          />
        </div>
      </div>
      <p v-if="reg" class="mt-2 text-sm" :class="complete ? 'text-slate-600' : 'text-orange-700'" data-test="register-held">
        {{ t('sci.heldLine', { held: reg.held_parts ?? 0, capital: reg.capital_parts ?? 0, on: date(reg.on) }) }}
      </p>
      <Message v-if="reg && !(reg.associates ?? []).length" severity="secondary" :closable="false" class="mt-3" data-test="register-empty">{{ t('sci.registerEmpty') }}</Message>
      <table v-else-if="reg" class="mt-3 w-full text-sm">
        <thead class="text-left text-xs text-slate-500"><tr><th class="py-1">{{ t('sci.associateName') }}</th><th class="amount">{{ t('sci.parts') }}</th><th class="amount">{{ t('sci.share') }}</th><th>{{ t('sci.holdings') }}</th><th /></tr></thead>
        <tbody>
          <tr v-for="a in reg.associates" :key="a.id" class="border-t border-slate-100 align-top" data-test="associate">
            <td class="py-1">
              {{ a.name }}
              <Tag v-if="a.me" :value="t('sci.me')" severity="success" class="ml-1" data-test="associate-me" />
              <Tag v-else-if="a.person_sub" :value="t('sci.linked')" severity="secondary" class="ml-1" />
            </td>
            <td class="amount" data-test="associate-parts">{{ a.parts_on ?? 0 }}</td>
            <td class="amount">{{ sharePercent(a.parts_on, reg.held_parts) }}</td>
            <td class="text-xs text-slate-600">
              <div v-for="h in a.holdings ?? []" :key="h.id" data-test="holding">
                {{ t(h.closed_on ? 'sci.holdingClosed' : 'sci.holdingOpen', { parts: h.parts ?? 0, from: date(h.from_on), to: h.closed_on ? date(h.closed_on) : '' }) }}
              </div>
            </td>
            <td class="text-right"><Button v-if="s.canWrite" icon="pi pi-pencil" size="small" text :aria-label="t('common.edit')" data-test="associate-edit" @click="editAssoc(a)" /></td>
          </tr>
        </tbody>
      </table>
    </article>

    <article class="rounded-md border border-slate-200 bg-white p-4" data-test="movements">
      <h2 class="font-semibold">{{ t('sci.movements') }}</h2>
      <p v-if="moves && !moves.length" class="mt-2 text-sm text-slate-500" data-test="movements-empty">{{ t('sci.movementsEmpty') }}</p>
      <table v-else-if="moves" class="mt-3 w-full text-sm">
        <thead class="text-left text-xs text-slate-500"><tr><th class="py-1">{{ t('sci.onDate') }}</th><th>{{ t('sci.reasonLabel') }}</th><th class="amount">{{ t('sci.parts') }}</th><th>{{ t('sci.toAssociate') }}</th><th>{{ t('sci.note') }}</th></tr></thead>
        <tbody>
          <tr v-for="m in moves" :key="m.id" class="border-t border-slate-100" data-test="movement">
            <td class="py-1">{{ date(m.on_date) }}</td><td>{{ t(`sci.reason.${m.reason}` as Key) }}</td>
            <td class="amount">{{ m.parts }}</td><td>{{ names.get(m.to_associate_id) ?? '' }}</td><td class="text-slate-500">{{ m.note }}</td>
          </tr>
        </tbody>
      </table>
    </article>

    <EntityDialog v-model:visible="editing" :entity="ent" @saved="load" />
    <AssociateDialog v-model:visible="assocDialog" :associate="assoc" @saved="load" />
    <MovementDialog v-model:visible="moveDialog" :associates="reg?.associates ?? []" @saved="load" />
  </section>
</template>
