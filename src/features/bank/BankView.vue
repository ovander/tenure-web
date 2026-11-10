<script setup lang="ts">
// « Banque » (RENT-SPEC-013; Q-W37): a bank account's lines as imported,
// by status, the stale ones flagged. A credit is matched to rent from the
// API's suggestions, or split by hand; a debit to the charges it paid. The
// sure credits are matched automatically after a preview. A line is ignored
// with a note, or reopened.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import FormField from '@/components/FormField.vue'
import { ApiError } from '@/api/client'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'
import { date, money } from '@/i18n/format'
import { useLeaseNames } from '@/features/billing/names'
import ImportStatementDialog from './ImportStatementDialog.vue'
import SplitDialog from './SplitDialog.vue'
import {
  accounts as listAccounts, autoMatch, chargeSuggestions, createAccount, lines as listLines, matchCharges, matchRent, oneLease, rentSuggestions, setStatus,
  type Account, type AutoResult, type ChargeSuggestion, type Line, type RentSuggestion,
} from './bank'

const s = useSession()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const names = useLeaseNames()
const accs = ref<Account[] | null>(null)
const rows = ref<Line[] | null>(null)
const total = ref(0)
const account = computed({
  get: () => (route.query.account as string) || accs.value?.[0]?.id || '',
  set: (v: string) => void router.replace({ query: { ...route.query, account: v || undefined } }),
})
const status = computed({
  get: () => (route.query.status as string) || 'unmatched',
  set: (v: string) => void router.replace({ query: { ...route.query, status: v } }),
})
const statusOptions = ['unmatched', 'matched', 'ignored'].map((x) => ({ value: x, label: t(`bank.status.${x}` as Key) }))
const accountOptions = computed(() => (accs.value ?? []).map((a) => ({ value: a.id ?? '', label: a.iban_last4 ? `${a.label} ··${a.iban_last4}` : a.label ?? '' })))

function fail(e: unknown): void {
  const msg = e instanceof ApiError ? [e.problem.title, e.problem.detail].filter(Boolean).join(' ') : t('error.network')
  toast.add({ severity: 'error', summary: msg, life: 6000 })
}
async function loadAccounts(): Promise<void> {
  accs.value = await listAccounts().catch(() => [])
}
async function load(): Promise<void> {
  open.value = {}
  if (!account.value) {
    rows.value = []
    return
  }
  rows.value = null
  const p = await listLines({ account_id: account.value, status: status.value, size: 100 }).catch(() => ({ items: [], total: 0 }))
  rows.value = p.items ?? []
  total.value = p.total ?? 0
}
onMounted(async () => {
  await Promise.all([loadAccounts(), names.load()])
  await load()
})
watch([account, status], load)

// Adding an account.
const adding = ref(false)
const accLabel = ref('')
const accLast4 = ref('')
async function addAccount(): Promise<void> {
  try {
    const a = await createAccount(accLabel.value.trim(), accLast4.value.trim())
    adding.value = false
    await loadAccounts()
    account.value = a.id ?? ''
  } catch (e) {
    fail(e)
  }
}

const importing = ref(false)
function imported(r: { new?: number; duplicates?: number }): void {
  toast.add({ severity: 'success', summary: t('bank.imported', { n: r.new ?? 0, d: r.duplicates ?? 0 }), life: 5000 })
  void load()
}

// Automatic matching: a preview first.
const auto = ref<AutoResult | null>(null)
async function previewAuto(): Promise<void> {
  try {
    auto.value = await autoMatch(account.value, true)
  } catch (e) {
    fail(e)
  }
}
async function runAuto(): Promise<void> {
  try {
    const r = await autoMatch(account.value, false)
    auto.value = null
    toast.add({ severity: 'success', summary: t('bank.autoDone', { n: (r.matched ?? []).length }), life: 5000 })
    await load()
  } catch (e) {
    fail(e)
  }
}

// A line opened shows its suggestions.
const open = ref<Record<string, { rent?: RentSuggestion[]; charges?: ChargeSuggestion[] }>>({})
async function toggle(l: Line): Promise<void> {
  const id = l.id ?? ''
  if (open.value[id]) {
    const rest = { ...open.value }
    delete rest[id]
    open.value = rest
    return
  }
  try {
    open.value = { ...open.value, [id]: (l.amount_cents ?? 0) > 0 ? { rent: await rentSuggestions(id) } : { charges: await chargeSuggestions(id) } }
  } catch (e) {
    fail(e)
  }
}
async function takeRent(l: Line, sg: RentSuggestion): Promise<void> {
  try {
    await matchRent(l, oneLease(l, sg))
    toast.add({ severity: 'success', summary: t('bank.matched'), life: 3000 })
    await load()
  } catch (e) {
    fail(e)
  }
}
async function takeCharges(l: Line, sg: ChargeSuggestion): Promise<void> {
  try {
    await matchCharges(l, (sg.charges ?? []).map((c) => c.id ?? ''))
    toast.add({ severity: 'success', summary: t('bank.matched'), life: 3000 })
    await load()
  } catch (e) {
    fail(e)
  }
}
const splitting = ref<Line | null>(null)
const splitOpen = computed({ get: () => splitting.value !== null, set: (v) => { if (!v) splitting.value = null } })

// Ignoring a line, with a note; reopening it.
const ignoring = ref<Line | null>(null)
const note = ref('')
async function ignore(): Promise<void> {
  if (!ignoring.value) return
  try {
    await setStatus(ignoring.value, 'ignored', note.value.trim())
    ignoring.value = null
    await load()
  } catch (e) {
    fail(e)
  }
}
async function reopen(l: Line): Promise<void> {
  try {
    await setStatus(l, 'unmatched', '')
    await load()
  } catch (e) {
    fail(e)
  }
}
const amountClass = (c?: number) => ((c ?? 0) < 0 ? 'text-red-700' : 'text-emerald-800')
</script>

<template>
  <div class="space-y-4" data-test="bank-view">
    <div class="flex flex-wrap items-end gap-3">
      <h1 class="mr-auto text-xl font-semibold">{{ t('bank.title') }}</h1>
      <Select v-if="(accs ?? []).length" v-model="account" :options="accountOptions" option-label="label" option-value="value" class="w-64" data-test="bank-account" />
      <Select v-model="status" :options="statusOptions" option-label="label" option-value="value" class="w-48" data-test="bank-status" />
      <template v-if="s.canWrite">
        <Button :label="t('bank.addAccount')" icon="pi pi-plus" severity="secondary" size="small" data-test="bank-add-account" @click="adding = true; accLabel = ''; accLast4 = ''" />
        <Button v-if="account" :label="t('bank.import')" icon="pi pi-upload" size="small" data-test="bank-import" @click="importing = true" />
        <Button v-if="account" :label="t('bank.auto')" icon="pi pi-bolt" severity="secondary" size="small" data-test="bank-auto" @click="previewAuto" />
      </template>
    </div>
    <Message v-if="accs && !accs.length" severity="info" :closable="false" data-test="bank-no-account">{{ t('bank.noAccount') }}</Message>
    <Skeleton v-else-if="rows === null" height="6rem" />
    <p v-else-if="!rows.length" class="text-sm text-slate-500" data-test="bank-empty">{{ t('bank.empty') }}</p>
    <ul v-else class="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
      <li v-for="l in rows" :key="l.id" class="p-3" data-test="bank-line">
        <div class="flex flex-wrap items-center gap-3 text-sm">
          <span class="w-24 text-slate-500">{{ date(l.booked_on) }}</span>
          <span class="min-w-0 flex-1 truncate">{{ l.label }}<span v-if="l.reference" class="text-slate-500"> · {{ l.reference }}</span></span>
          <span class="amount w-28 text-right font-medium" :class="amountClass(l.amount_cents)">{{ money(l.amount_cents ?? 0) }}</span>
          <Tag v-if="l.stale" :value="t('bank.stale')" severity="warn" data-test="bank-stale" />
          <span v-if="l.note" class="text-slate-500">« {{ l.note }} »</span>
          <template v-if="s.canWrite">
            <template v-if="l.status === 'unmatched'">
              <Button :label="t('bank.matchOpen')" size="small" severity="secondary" data-test="bank-open" @click="toggle(l)" />
              <Button :label="t('bank.ignore')" size="small" text data-test="bank-ignore" @click="ignoring = l; note = ''" />
            </template>
            <Button v-else-if="l.status === 'ignored'" :label="t('bank.reopen')" size="small" text data-test="bank-reopen" @click="reopen(l)" />
          </template>
        </div>
        <div v-if="open[l.id ?? '']" class="mt-2 space-y-2 rounded bg-slate-50 p-3 text-sm" data-test="bank-suggestions">
          <template v-if="open[l.id ?? '']?.rent">
            <p v-if="!open[l.id ?? '']?.rent?.length" class="text-slate-500">{{ t('bank.noRentSuggestion') }}</p>
            <div v-for="sg in open[l.id ?? '']?.rent" :key="sg.billing_document_id" class="flex flex-wrap items-center gap-2" data-test="rent-suggestion">
              <Tag :value="t(`bank.rule.${sg.rule}` as Key)" severity="info" />
              <span>{{ sg.number }} · {{ names.label(sg.lease_id) }}</span>
              <span v-if="sg.method === 'caf'" class="text-slate-500">{{ t('payments.method.caf') }}</span>
              <Button :label="t('bank.match')" size="small" data-test="rent-take" @click="takeRent(l, sg)" />
            </div>
            <Button :label="t('bank.split')" icon="pi pi-sitemap" size="small" text data-test="bank-split" @click="splitting = l" />
          </template>
          <template v-else>
            <p v-if="!open[l.id ?? '']?.charges?.length" class="text-slate-500">{{ t('bank.noChargeSuggestion') }}</p>
            <div v-for="(sg, i) in open[l.id ?? '']?.charges" :key="i" class="flex flex-wrap items-center gap-2" data-test="charge-suggestion">
              <Tag :value="t(`bank.rule.${sg.rule}` as Key)" severity="info" />
              <span>{{ (sg.charges ?? []).map((c) => `${c.label} (${money(c.amount_cents ?? 0)})`).join(' + ') }}</span>
              <Button :label="t('bank.match')" size="small" data-test="charge-take" @click="takeCharges(l, sg)" />
            </div>
          </template>
        </div>
      </li>
    </ul>
    <p v-if="rows && total > rows.length" class="text-xs text-slate-500">{{ t('bank.more', { n: rows.length, total }) }}</p>

    <ImportStatementDialog v-model:visible="importing" :account-id="account" @imported="imported" />
    <SplitDialog v-model:visible="splitOpen" :line="splitting" @matched="load" />
    <Dialog v-model:visible="adding" modal :header="t('bank.addAccount')" class="w-[28rem]" data-test="account-dialog">
      <div class="space-y-4">
        <FormField id="acc_label" :help="t('help.bank.label')" :label="t('bank.accountLabel')"><InputText id="acc_label" v-model="accLabel" class="w-full" /></FormField>
        <FormField id="acc_last4" :help="t('help.bank.last4')" :label="`${t('bank.last4')} (${t('common.optional')})`"><InputText id="acc_last4" v-model="accLast4" maxlength="4" class="w-24" /></FormField>
      </div>
      <div class="mt-6 flex justify-end gap-2">
        <Button :label="t('common.cancel')" severity="secondary" text @click="adding = false" />
        <Button :label="t('common.save')" :disabled="!accLabel.trim()" data-test="account-save" @click="addAccount" />
      </div>
    </Dialog>
    <Dialog :visible="auto !== null" modal :header="t('bank.auto')" class="w-[32rem]" data-test="auto-dialog" @update:visible="(v) => !v && (auto = null)">
      <p class="text-sm" data-test="auto-preview">{{ t('bank.autoPreview', { n: (auto?.matched ?? []).length, left: auto?.left ?? 0 }) }}</p>
      <div class="mt-6 flex justify-end gap-2">
        <Button :label="t('common.cancel')" severity="secondary" text @click="auto = null" />
        <Button :label="t('bank.autoRun')" :disabled="!(auto?.matched ?? []).length" data-test="auto-run" @click="runAuto" />
      </div>
    </Dialog>
    <Dialog :visible="ignoring !== null" modal :header="t('bank.ignore')" class="w-[28rem]" data-test="ignore-dialog" @update:visible="(v) => !v && (ignoring = null)">
      <FormField id="ign_note" :help="t('help.bank.note')" :label="`${t('bank.note')} (${t('common.optional')})`"><InputText id="ign_note" v-model="note" class="w-full" /></FormField>
      <div class="mt-6 flex justify-end gap-2">
        <Button :label="t('common.cancel')" severity="secondary" text @click="ignoring = null" />
        <Button :label="t('bank.ignore')" data-test="ignore-save" @click="ignore" />
      </div>
    </Dialog>
  </div>
</template>
