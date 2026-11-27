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
import { useLatest } from '@/lib/async'
import { date, money } from '@/i18n/format'
import { useLeaseNames } from '@/features/billing/names'
import ImportStatementDialog from './ImportStatementDialog.vue'
import SplitDialog from './SplitDialog.vue'
import {
  accounts as listAccounts, autoMatch, chargeSuggestions, createAccount, lines as listLines, linkPayments, matchCharges, matchRent, oneLease, paymentSuggestions, rentSuggestions, setStatus,
  type Account, type AutoResult, type ChargeSuggestion, type Line, type RecordedPayment, type RentSuggestion,
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
  const msg = e instanceof ApiError ? (e.problem.title || t('error.title')) : t('error.network')
  toast.add({ severity: 'error', summary: msg, life: 6000 })
}
// One write at a time: while a write's request (and the reload after it) is
// in flight, the write buttons are disabled and another click does nothing,
// so a double click sends one request.
const writing = ref(false)
async function write(action: () => Promise<void>): Promise<void> {
  if (writing.value) return
  writing.value = true
  try {
    await action()
  } catch (e) {
    fail(e)
  } finally {
    writing.value = false
  }
}
async function loadAccounts(): Promise<void> {
  accs.value = await listAccounts().catch(() => [])
}
// Only the answer for the account and status shown is kept.
const latest = useLatest()
async function load(): Promise<void> {
  const token = latest.next()
  open.value = {}
  if (!account.value) {
    rows.value = []
    return
  }
  rows.value = null
  const p = await listLines({ account_id: account.value, status: status.value, size: 100 }).catch(() => ({ items: [], total: 0 }))
  if (!latest.isLatest(token)) return
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
function addAccount(): Promise<void> {
  return write(async () => {
    const a = await createAccount(accLabel.value.trim(), accLast4.value.trim())
    adding.value = false
    await loadAccounts()
    account.value = a.id ?? ''
  })
}

const importing = ref(false)
function imported(r: { new?: number; duplicates?: number }): void {
  toast.add({ severity: 'success', summary: t('bank.imported', { n: r.new ?? 0, d: r.duplicates ?? 0 }), life: 5000 })
  void load()
}

// Automatic matching: a preview first.
const auto = ref<AutoResult | null>(null)
function previewAuto(): Promise<void> {
  return write(async () => {
    auto.value = await autoMatch(account.value, true)
  })
}
function runAuto(): Promise<void> {
  return write(async () => {
    const r = await autoMatch(account.value, false)
    auto.value = null
    toast.add({ severity: 'success', summary: t('bank.autoDone', { n: (r.matched ?? []).length }), life: 5000 })
    await load()
  })
}

// A line opened shows its suggestions.
const open = ref<Record<string, { rent?: RentSuggestion[]; payments?: RecordedPayment[]; charges?: ChargeSuggestion[] }>>({})
async function toggle(l: Line): Promise<void> {
  const id = l.id ?? ''
  if (open.value[id]) {
    const rest = { ...open.value }
    delete rest[id]
    open.value = rest
    return
  }
  try {
    if ((l.amount_cents ?? 0) > 0) {
      // The recorded payments only help: their failure leaves the rent
      // suggestions, which the line can still be matched to.
      const [payments, rent] = await Promise.all([paymentSuggestions(id).catch((): RecordedPayment[] => []), rentSuggestions(id)])
      open.value = { ...open.value, [id]: { payments, rent } }
      picked.value = { ...picked.value, [id]: [] }
    } else {
      open.value = { ...open.value, [id]: { charges: await chargeSuggestions(id) } }
    }
  } catch (e) {
    fail(e)
  }
}
function takeRent(l: Line, sg: RentSuggestion): Promise<void> {
  return write(async () => {
    await matchRent(l, oneLease(l, sg))
    toast.add({ severity: 'success', summary: t('bank.matched'), life: 3000 })
    await load()
  })
}
// Several recorded payments may make one credit (a rent paid in two
// transfers): the owner ticks them, and the selection links once it adds up
// to the credit exactly.
const picked = ref<Record<string, string[]>>({})
function pickedSum(l: Line): number {
  const ids = picked.value[l.id ?? ''] ?? []
  return (open.value[l.id ?? '']?.payments ?? []).filter((p) => ids.includes(p.id ?? '')).reduce((s, p) => s + (p.amount_cents ?? 0), 0)
}
function takePicked(l: Line): Promise<void> {
  return linkIds(l, picked.value[l.id ?? ''] ?? [])
}
function takePayment(l: Line, p: RecordedPayment): Promise<void> {
  return linkIds(l, [p.id ?? ''])
}
function linkIds(l: Line, ids: string[]): Promise<void> {
  return write(async () => {
    await linkPayments(l, ids)
    toast.add({ severity: 'success', summary: t('bank.linked'), life: 3000 })
    await load()
  })
}
function takeCharges(l: Line, sg: ChargeSuggestion): Promise<void> {
  return write(async () => {
    await matchCharges(l, (sg.charges ?? []).map((c) => c.id ?? ''))
    toast.add({ severity: 'success', summary: t('bank.matched'), life: 3000 })
    await load()
  })
}
const splitting = ref<Line | null>(null)
const splitOpen = computed({ get: () => splitting.value !== null, set: (v) => { if (!v) splitting.value = null } })

// Ignoring a line, with a note; reopening it.
const ignoring = ref<Line | null>(null)
const note = ref('')
function ignore(): Promise<void> {
  const l = ignoring.value
  if (!l) return Promise.resolve()
  return write(async () => {
    await setStatus(l, 'ignored', note.value.trim())
    ignoring.value = null
    await load()
  })
}
function reopen(l: Line): Promise<void> {
  return write(async () => {
    await setStatus(l, 'unmatched', '')
    await load()
  })
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
        <Button v-if="account" :label="t('bank.auto')" icon="pi pi-bolt" severity="secondary" size="small" data-test="bank-auto" :disabled="writing" @click="previewAuto" />
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
            <Button v-else-if="l.status === 'ignored'" :label="t('bank.reopen')" size="small" text :disabled="writing" data-test="bank-reopen" @click="reopen(l)" />
          </template>
        </div>
        <div v-if="open[l.id ?? '']" class="mt-2 space-y-2 rounded bg-slate-50 p-3 text-sm" data-test="bank-suggestions">
          <template v-if="open[l.id ?? '']?.rent">
            <div v-if="open[l.id ?? '']?.payments?.length" class="space-y-2 border-b border-slate-200 pb-2" data-test="recorded-payments">
              <p class="font-medium">{{ t('bank.recorded') }}</p>
              <p class="text-xs text-slate-500">{{ t('bank.recordedHelp') }}</p>
              <div v-for="p in open[l.id ?? '']?.payments" :key="p.id" class="flex flex-wrap items-center gap-2" data-test="recorded-payment">
                <input v-model="picked[l.id ?? '']" type="checkbox" :value="p.id" :aria-label="t('bank.link')" data-test="payment-pick" />
                <span>{{ date(p.paid_on) }} · {{ names.label(p.lease_id) }} · {{ money(p.amount_cents ?? 0) }}</span>
                <span class="text-slate-500">{{ t(`payments.method.${p.method}` as Key) }}</span>
                <Button v-if="p.amount_cents === l.amount_cents" :label="t('bank.link')" size="small" :disabled="writing" data-test="payment-link" @click="takePayment(l, p)" />
              </div>
              <Button
                v-if="(open[l.id ?? '']?.payments?.length ?? 0) > 1" :label="t('bank.linkSelected', { sum: money(pickedSum(l)), amount: money(l.amount_cents ?? 0) })" size="small" severity="secondary"
                :disabled="writing || pickedSum(l) !== l.amount_cents" data-test="payment-link-picked" @click="takePicked(l)"
              />
            </div>
            <p v-if="!open[l.id ?? '']?.rent?.length" class="text-slate-500">{{ t('bank.noRentSuggestion') }}</p>
            <div v-for="sg in open[l.id ?? '']?.rent" :key="sg.billing_document_id" class="flex flex-wrap items-center gap-2" data-test="rent-suggestion">
              <Tag :value="t(`bank.rule.${sg.rule}` as Key)" severity="info" />
              <span>{{ sg.number }} · {{ names.label(sg.lease_id) }}</span>
              <span v-if="sg.method === 'caf'" class="text-slate-500">{{ t('payments.method.caf') }}</span>
              <Button :label="t('bank.match')" size="small" :disabled="writing" data-test="rent-take" @click="takeRent(l, sg)" />
            </div>
            <Button :label="t('bank.split')" icon="pi pi-sitemap" size="small" text data-test="bank-split" @click="splitting = l" />
          </template>
          <template v-else>
            <p v-if="!open[l.id ?? '']?.charges?.length" class="text-slate-500">{{ t('bank.noChargeSuggestion') }}</p>
            <div v-for="(sg, i) in open[l.id ?? '']?.charges" :key="i" class="flex flex-wrap items-center gap-2" data-test="charge-suggestion">
              <Tag :value="t(`bank.rule.${sg.rule}` as Key)" severity="info" />
              <span>{{ (sg.charges ?? []).map((c) => `${c.label} (${money(c.amount_cents ?? 0)})`).join(' + ') }}</span>
              <Button :label="t('bank.match')" size="small" :disabled="writing" data-test="charge-take" @click="takeCharges(l, sg)" />
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
        <Button :label="t('common.save')" :disabled="!accLabel.trim()" :loading="writing" data-test="account-save" @click="addAccount" />
      </div>
    </Dialog>
    <Dialog :visible="auto !== null" modal :header="t('bank.auto')" class="w-[32rem]" data-test="auto-dialog" @update:visible="(v) => !v && (auto = null)">
      <p class="text-sm" data-test="auto-preview">{{ t('bank.autoPreview', { n: (auto?.matched ?? []).length, left: auto?.left ?? 0 }) }}</p>
      <div class="mt-6 flex justify-end gap-2">
        <Button :label="t('common.cancel')" severity="secondary" text @click="auto = null" />
        <Button :label="t('bank.autoRun')" :disabled="!(auto?.matched ?? []).length" :loading="writing" data-test="auto-run" @click="runAuto" />
      </div>
    </Dialog>
    <Dialog :visible="ignoring !== null" modal :header="t('bank.ignore')" class="w-[28rem]" data-test="ignore-dialog" @update:visible="(v) => !v && (ignoring = null)">
      <FormField id="ign_note" :help="t('help.bank.note')" :label="`${t('bank.note')} (${t('common.optional')})`"><InputText id="ign_note" v-model="note" class="w-full" /></FormField>
      <div class="mt-6 flex justify-end gap-2">
        <Button :label="t('common.cancel')" severity="secondary" text @click="ignoring = null" />
        <Button :label="t('bank.ignore')" :loading="writing" data-test="ignore-save" @click="ignore" />
      </div>
    </Dialog>
  </div>
</template>
