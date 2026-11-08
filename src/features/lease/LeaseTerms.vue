<script setup lang="ts">
// « Périodes du bail » on the lease overview (Q-W34): the first term and
// each tacit renewal, the term a notice cuts short, the next renewal.
import { ref, watch } from 'vue'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { t, type Key } from '@/i18n'
import { date } from '@/i18n/format'
import { getTerms, type TermsView } from './terms'
import type { Lease } from './store'

const props = defineProps<{ lease: Lease }>()
const v = ref<TermsView | null>(null)
watch(() => [props.lease.id, props.lease.version], async () => {
  v.value = props.lease.id ? await getTerms(props.lease.id).catch(() => null) : null
}, { immediate: true })
const severity = (s?: string) => (s === 'current' ? 'success' : s === 'upcoming' ? 'info' : 'secondary')
</script>

<template>
  <section v-if="v && (v.terms ?? []).length" class="rounded-md border border-slate-200 bg-white p-5 lg:col-span-2" data-test="lease-terms-card">
    <h2 class="mb-3 font-medium">{{ t('terms.title') }}</h2>
    <ol class="space-y-1 text-sm">
      <li v-for="x in v.terms" :key="x.n" class="flex flex-wrap items-center gap-2" data-test="term">
        <span class="w-6 text-slate-500">{{ x.n }}.</span>
        <span>{{ t('terms.range', { from: date(x.start_on), to: date(x.end_on) }) }}</span>
        <span class="text-slate-500" data-test="term-renewal">{{ t(`terms.renewal.${x.renewal}` as Key) }}</span>
        <Tag :value="t(`terms.status.${x.status}` as Key)" :severity="severity(x.status)" data-test="term-status" />
        <span v-if="x.ended_early" class="text-orange-700" data-test="term-ended">{{ t('terms.endedEarly') }}</span>
      </li>
    </ol>
    <p v-if="v.next_renewal_on" class="mt-3 text-sm" data-test="next-renewal">{{ t('terms.nextRenewal', { day: date(v.next_renewal_on) }) }}</p>
    <p v-else-if="!v.renews && !v.beyond_term" class="mt-3 text-sm text-slate-500" data-test="no-renewal">{{ t('terms.noRenewal') }}</p>
    <Message v-if="v.beyond_term" severity="warn" :closable="false" class="mt-3" data-test="beyond-term">{{ t('terms.beyondTerm') }}</Message>
  </section>
</template>
