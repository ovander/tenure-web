<script setup lang="ts">
// The IRL revision of a lease (RENT-SPEC-003, Q-W23): computed as a dry run
// when the dialog opens, shown with what limited it, then applied on
// confirmation, which issues the revision notice. The daily job applies a due
// revision anyway; this applies it now. When none is due, the API says why.
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { ApiError } from '@/api/client'
import { t, type Key } from '@/i18n'
import { date, hundredths, money } from '@/i18n/format'
import { revisionNotes, useBilling, type RevisionView } from '@/features/billing/store'
import type { Lease } from './store'

const visible = defineModel<boolean>('visible')
const props = defineProps<{ lease: Lease }>()
const emit = defineEmits<{ applied: [v: RevisionView] }>()
const billing = useBilling()
const preview = ref<RevisionView | null>(null)
const loading = ref(false)
const busy = ref(false)
const error = ref('')

const problem = (e: unknown) => (e instanceof ApiError ? [e.problem.title, e.problem.detail].filter(Boolean).join(' ') : t('error.network'))

watch(visible, async (v) => {
  if (!v || !props.lease.id) return
  preview.value = null
  error.value = ''
  loading.value = true
  try {
    preview.value = await billing.revise(props.lease.id, true)
  } catch (e) {
    error.value = problem(e)
  } finally {
    loading.value = false
  }
}, { immediate: true })

const r = computed(() => preview.value?.revision?.revision)
const due = computed(() => preview.value?.revision?.due)
const notes = computed(() => (r.value ? revisionNotes(r.value) : []))
const changes = computed(() => !!r.value && r.value.new_rent_cents !== r.value.old_rent_cents)
function monthOf(p: string | undefined): string {
  if (!p) return ''
  const [y, m] = p.split('-').map(Number)
  return `${t(`month.${m}` as Key)} ${y}`
}

async function apply(): Promise<void> {
  if (!props.lease.id) return
  busy.value = true
  error.value = ''
  try {
    const v = await billing.revise(props.lease.id, false)
    visible.value = false
    emit('applied', v)
  } catch (e) {
    error.value = problem(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="t('revision.title')" class="w-[34rem]" data-test="revision-dialog">
    <Skeleton v-if="loading" height="8rem" />
    <Message v-if="error" severity="warn" :closable="false" class="mb-3" data-test="revision-error">{{ error }}</Message>
    <template v-if="r">
      <dl class="grid grid-cols-[13rem_1fr] gap-x-4 gap-y-2 text-sm" data-test="revision">
        <dt class="text-slate-500">{{ t('revision.anniversary') }}</dt><dd>{{ date(r.anniversary ?? due?.anniversary) }}</dd>
        <dt class="text-slate-500">{{ t('revision.index') }}</dt>
        <dd>{{ t('revision.indexLine', { quarter: r.new_ref_quarter ?? '', value: hundredths(r.new_ref_value ?? 0), old: lease.irl_ref_quarter ?? '', oldValue: hundredths(lease.irl_ref_value ?? 0) }) }}</dd>
        <dt class="text-slate-500">{{ t('revision.oldRent') }}</dt><dd class="amount text-left">{{ money(r.old_rent_cents ?? 0) }}</dd>
        <dt class="text-slate-500">{{ t('revision.indexedRent') }}</dt><dd class="amount text-left" data-test="revision-indexed">{{ money(r.indexed_rent_cents ?? 0) }}</dd>
        <dt class="text-slate-500">{{ t('revision.newRent') }}</dt><dd class="amount text-left font-semibold" data-test="revision-new">{{ money(r.new_rent_cents ?? 0) }}</dd>
        <template v-if="(r.ceiling_cents ?? 0) > 0"><dt class="text-slate-500">{{ t('revision.ceiling') }}</dt><dd class="amount text-left">{{ money(r.ceiling_cents ?? 0) }}</dd></template>
        <dt class="text-slate-500">{{ t('revision.from') }}</dt><dd data-test="revision-from">{{ monthOf(r.effective_from ?? due?.from) }}</dd>
      </dl>
      <Message v-for="n in notes" :key="n" severity="info" :closable="false" class="mt-3" data-test="revision-note">{{ t(n) }}</Message>
      <p class="mt-4 text-sm leading-6 text-slate-600">{{ t(changes ? 'revision.confirm' : 'revision.confirmUnchanged') }}</p>
    </template>
    <div class="mt-6 flex justify-end gap-2">
      <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button v-if="r" :label="t('revision.apply')" icon="pi pi-check" :loading="busy" data-test="apply-revision" @click="apply" />
    </div>
  </Dialog>
</template>
