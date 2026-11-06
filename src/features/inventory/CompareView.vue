<script setup lang="ts">
// S15d Comparison (RENT-INV-001 §6, §8; tenure-api Q-113; Q-W28): an exit
// against its entry, the entry corrected by its accepted completion lines.
// One row per exit item with both states and a result tag, a « changes only »
// filter, the keys, and the count of worse or missing results the owner
// qualifies before the deposit settlement (slice 9). Read only; the co-owner
// reads, an accountant has no access.
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import Checkbox from 'primevue/checkbox'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import HelpTip from '@/components/HelpTip.vue'
import { ApiError } from '@/api/client'
import { t, type Key } from '@/i18n'
import { date } from '@/i18n/format'
import { changed, comparison, type Comparison, type ItemState } from './capture'

const route = useRoute()
const id = computed(() => route.params.id as string)
const cmp = ref<Comparison | null>(null)
const denied = ref(false)
const error = ref('')
const onlyChanges = ref(true)

onMounted(async () => {
  try {
    cmp.value = await comparison(id.value)
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) denied.value = true
    else error.value = e instanceof ApiError ? e.problem.title ?? t('error.title') : t('error.network')
  }
})

const items = computed(() => (cmp.value?.items ?? []).filter((r) => !onlyChanges.value || changed(r.result)))
const severity: Record<string, string> = { same: 'secondary', better: 'success', worse: 'danger', missing: 'danger', new: 'info' }
function stateLabel(s: ItemState | undefined): string {
  if (!s) return '—'
  return [s.condition ? t(`inventory.condition.${s.condition}` as Key) : t('inventory.notAssessed'),
    s.works ? t(`inventory.works.${s.works === 'n/a' ? 'na' : s.works}` as Key) : '',
    s.quantity ? `× ${s.quantity}` : ''].filter(Boolean).join(' · ')
}
</script>

<template>
  <section class="max-w-5xl space-y-4" data-test="compare">
    <nav class="text-sm text-slate-500" aria-label="breadcrumb">
      <RouterLink :to="`/inventories/${id}/capture`" class="hover:underline" data-test="crumb-exit">{{ t('compare.backToExit') }}</RouterLink>
    </nav>
    <Message v-if="denied" severity="warn" :closable="false" data-test="compare-denied">{{ t('inventory.denied') }}</Message>
    <Message v-else-if="error" severity="error" :closable="false" data-test="compare-error">{{ error }}</Message>
    <Skeleton v-else-if="!cmp" height="12rem" />
    <template v-else>
      <header class="flex flex-wrap items-center gap-3">
        <h1 class="flex items-center gap-2 text-xl font-semibold">{{ t('compare.title') }} <HelpTip id="compare" :text="t('help.compare')" /></h1>
        <span class="text-sm text-slate-500" data-test="compare-dates">{{ t('compare.dates', { entry: date(cmp.entry_done_on), exit: cmp.exit_done_on ? date(cmp.exit_done_on) : t('compare.notDone') }) }}</span>
      </header>
      <Message :severity="cmp.flagged ? 'warn' : 'success'" :closable="false" data-test="flagged">
        {{ cmp.flagged ? t('compare.flagged', { n: cmp.flagged }) : t('compare.none') }}
      </Message>

      <div class="rounded-md border border-slate-200 bg-white p-4">
        <div class="mb-3 flex items-center justify-between gap-2">
          <h2 class="font-medium">{{ t('compare.items') }}</h2>
          <label class="flex items-center gap-2 text-sm">
            <Checkbox v-model="onlyChanges" input-id="only_changes" binary data-test="only-changes" />
            {{ t('compare.onlyChanges') }}
          </label>
        </div>
        <p v-if="!items.length" class="text-sm text-slate-500" data-test="no-changes">{{ t('compare.noChanges') }}</p>
        <table v-else class="w-full text-sm">
          <thead class="text-left text-slate-500">
            <tr>
              <th class="py-1 pr-2 font-normal">{{ t('compare.item') }}</th>
              <th class="py-1 pr-2 font-normal">{{ t('compare.entry') }}</th>
              <th class="py-1 pr-2 font-normal">{{ t('compare.exit') }}</th>
              <th class="py-1 font-normal">{{ t('compare.result') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in items" :key="r.exit_item_id" class="border-t border-slate-100 align-top" data-test="compare-row">
              <td class="py-2 pr-2"><span class="text-slate-500">{{ r.room }} ·</span> {{ r.label }}</td>
              <td class="py-2 pr-2">{{ stateLabel(r.entry) }}</td>
              <td class="py-2 pr-2">{{ stateLabel(r.exit) }}<span v-if="r.exit?.comment" class="block text-xs text-slate-500">{{ r.exit.comment }}</span></td>
              <td class="py-2"><Tag :value="t(`compare.result.${r.result}` as Key)" :severity="severity[r.result ?? 'same']" data-test="result" /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="rounded-md border border-slate-200 bg-white p-4">
        <h2 class="mb-2 font-medium">{{ t('inventory.section.keys') }}</h2>
        <table class="w-full text-sm" data-test="compare-keys">
          <thead class="text-left text-slate-500">
            <tr>
              <th class="py-1 pr-2 font-normal">{{ t('inventory.keyOpens') }}</th>
              <th class="py-1 pr-2 font-normal">{{ t('compare.entry') }}</th>
              <th class="py-1 pr-2 font-normal">{{ t('compare.exit') }}</th>
              <th class="py-1 font-normal">{{ t('compare.result') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(k, i) in cmp.keys" :key="i" class="border-t border-slate-100" data-test="compare-key">
              <td class="py-2 pr-2">{{ t(`inventory.key.${k.kind}` as Key) }} · {{ k.destination }}</td>
              <td class="py-2 pr-2">{{ k.entry }}</td>
              <td class="py-2 pr-2">{{ k.exit }}</td>
              <td class="py-2"><Tag :value="t(`compare.result.${k.result}` as Key)" :severity="severity[k.result ?? 'same']" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
