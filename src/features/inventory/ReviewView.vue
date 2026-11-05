<script setup lang="ts">
// S15c Review and sign (RENT-INV-001 §5, §8; tenure-api Q-112; Q-W27). A
// completed inventory is signed by every party: the owner and each
// co-tenant. By hand: the copy to sign is downloaded and printed, then the
// signed copy is uploaded (scanned) for the parties who signed it, with
// their reservations. Electronically, when the instance has a provider
// (OD-08): one e-mail per party, then each party signs in turn on the tablet
// through their link (INV-OD-03), and « actualiser » reads where the request
// stands. The last signature issues the EE document. The co-owner reads
// without links or actions; an accountant has no access.
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import FilePicker from '@/components/FilePicker.vue'
import HelpTip from '@/components/HelpTip.vue'
import { ApiError } from '@/api/client'
import { useProblemForm } from '@/app/form'
import { useSession } from '@/stores/session'
import { useLeases, download, type Lease } from '@/features/lease/store'
import { t, type Key } from '@/i18n'
import { date } from '@/i18n/format'
import {
  blocking, cancelSignatures, getCapture, getSignatures, partyKey, preview, refreshSignatures, sign, unsigned,
  type Capture, type Signatures,
} from './capture'

const route = useRoute()
const toast = useToast()
const s = useSession()
const leases = useLeases()
const id = computed(() => route.params.id as string)
const inv = ref<Capture | null>(null)
const sig = ref<Signatures | null>(null)
const lease = ref<Lease | null>(null)
const denied = ref(false)
const pdfURL = ref('')

async function reload(): Promise<void> {
  inv.value = await getCapture(id.value)
  sig.value = await getSignatures(id.value)
  for (const p of unsigned(sig.value)) {
    const k = partyKey(p)
    form[k] ??= { picked: false, reservations: '', email: '' }
  }
  if (!lease.value && inv.value.lease_id) lease.value = await leases.get(inv.value.lease_id)
}
const { errors, summary, busy, submit } = useProblemForm(reload)

onMounted(async () => {
  try {
    await reload()
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) denied.value = true
    else summary.value = t('error.network')
  }
})
onBeforeUnmount(() => {
  if (pdfURL.value) URL.revokeObjectURL(pdfURL.value)
})

// Per party: picked for a hand-signed copy, reservations, e-mail.
const form = reactive<Record<string, { picked: boolean; reservations: string; email: string }>>({})
const open = computed(() => (sig.value ? unsigned(sig.value) : []))
const request = computed(() => sig.value?.request)
const pending = computed(() => request.value?.state === 'pending')
const signing = computed(() => sig.value?.state === 'completed')
const checks = computed(() => (inv.value ? blocking(inv.value, 'complete') : []))
const file = ref<File | null>(null)

async function preparePDF(): Promise<void> {
  await submit(async () => {
    const b = await preview(id.value)
    if (pdfURL.value) URL.revokeObjectURL(pdfURL.value)
    pdfURL.value = URL.createObjectURL(b)
  })
}

async function signByHand(): Promise<void> {
  const signers = open.value.filter((p) => form[partyKey(p)]?.picked)
    .map((p) => ({ party: p.party as 'owner' | 'tenant', signer_name: p.name ?? '', reservations: form[partyKey(p)]?.reservations.trim() || undefined }))
  const local: Record<string, string> = {}
  if (!file.value) local.document_id = t('review.fileRequired')
  if (!signers.length) local.signers = t('review.pickRequired')
  const ok = await submit(async () => {
    if (!lease.value || !file.value) return
    const doc = await leases.upload('inventory', lease.value, file.value)
    sig.value = await sign(id.value, { method: 'wet_scan', document_id: doc.id, signers })
    file.value = null
  }, local)
  if (ok) toast.add({ severity: 'success', summary: t(sig.value?.state === 'issued' ? 'review.issued' : 'review.recorded'), life: 4000 })
}

async function requestESign(): Promise<void> {
  const signers = open.value.map((p) => ({ party: p.party as 'owner' | 'tenant', signer_name: p.name ?? '', email: form[partyKey(p)]?.email.trim() ?? '',
    reservations: form[partyKey(p)]?.reservations.trim() || undefined }))
  const local: Record<string, string> = {}
  signers.forEach((x, i) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email)) local[`signers[${i}].email`] = t('review.emailRequired')
  })
  const ok = await submit(async () => {
    sig.value = await sign(id.value, { method: 'esign', signers })
  }, local)
  if (ok) toast.add({ severity: 'success', summary: t('review.requested'), life: 4000 })
}
async function refresh(): Promise<void> {
  const ok = await submit(async () => {
    sig.value = await refreshSignatures(id.value)
  })
  if (ok && sig.value?.state === 'issued') toast.add({ severity: 'success', summary: t('review.issued'), life: 4000 })
}
async function cancel(): Promise<void> {
  await submit(async () => {
    sig.value = await cancelSignatures(id.value)
  })
}
function partyLabel(p: { party?: string }): string {
  return t(`review.party.${p.party ?? 'owner'}` as Key)
}
</script>

<template>
  <section class="max-w-4xl space-y-4" data-test="review">
    <nav class="text-sm text-slate-500" aria-label="breadcrumb">
      <RouterLink :to="`/inventories/${id}/capture`" class="hover:underline" data-test="crumb-capture">{{ t('review.backToCapture') }}</RouterLink>
    </nav>
    <Message v-if="denied" severity="warn" :closable="false" data-test="review-denied">{{ t('inventory.denied') }}</Message>
    <Skeleton v-else-if="!inv || !sig" height="12rem" />
    <template v-else>
      <header class="flex flex-wrap items-center gap-3">
        <h1 class="flex items-center gap-2 text-xl font-semibold">{{ t('review.title') }} <HelpTip id="review" :text="t('help.review')" /></h1>
        <Tag :value="t(`inventory.state.${sig.state}` as Key)" :severity="sig.state === 'issued' ? 'success' : 'contrast'" data-test="review-state" />
        <span v-if="inv.done_on" class="text-sm text-slate-500">{{ t('inventory.doneOn') }} {{ date(inv.done_on) }}</span>
      </header>
      <Message v-if="summary" severity="error" :closable="false" data-test="form-error">{{ summary }}</Message>

      <!-- Issued: the document. -->
      <div v-if="sig.state === 'issued' && sig.document_id" class="flex flex-wrap items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4" data-test="issued-doc">
        <span class="text-sm text-emerald-900">{{ t('review.issuedNote') }}</span>
        <Button :label="t('review.download')" icon="pi pi-download" size="small" data-test="download-ee" @click="download(sig.document_id)" />
      </div>
      <Message v-else-if="!signing" severity="info" :closable="false" data-test="not-signable">{{ t('review.notSignable') }}</Message>

      <!-- The parties. -->
      <div class="rounded-md border border-slate-200 bg-white p-4">
        <h2 class="mb-2 font-medium">{{ t('review.parties') }}</h2>
        <ul class="divide-y divide-slate-100" data-test="parties">
          <li v-for="p in sig.parties" :key="partyKey(p)" class="flex items-center justify-between py-2 text-sm" data-test="party">
            <span><span class="text-slate-500">{{ partyLabel(p) }}</span> · {{ p.name }}</span>
            <Tag :value="p.signed ? t('review.signed') : t('review.toSign')" :severity="p.signed ? 'success' : 'secondary'" />
          </li>
        </ul>
        <ul v-if="sig.signatures?.length" class="mt-3 space-y-1 text-xs text-slate-600" data-test="signatures">
          <li v-for="(x, i) in sig.signatures" :key="i">
            {{ x.signer_name }} — {{ t(`review.method.${x.method}` as Key) }}, {{ date(x.signed_at?.slice(0, 10)) }}<template v-if="x.reservations"> · {{ t('review.reservations') }} : {{ x.reservations }}</template>
          </li>
        </ul>
      </div>

      <template v-if="signing && s.canWrite">
        <ul v-if="checks.length" class="list-disc pl-5 text-sm text-amber-800" data-test="checks">
          <li v-for="(c, i) in checks" :key="i">{{ t(`inventory.check.${c.code}` as Key) }}</li>
        </ul>

        <!-- A pending electronic request: sign in turn on the tablet. -->
        <div v-if="pending" class="space-y-3 rounded-md border border-sky-200 bg-sky-50 p-4" data-test="esign-pending">
          <p class="text-sm text-sky-900">{{ t('review.inTurn') }}</p>
          <ul class="space-y-2">
            <li v-for="x in request?.signers" :key="partyKey(x)" class="flex flex-wrap items-center justify-between gap-2" data-test="esign-signer">
              <span class="text-sm">{{ partyLabel(x) }} · {{ x.signer_name }}</span>
              <Tag v-if="x.signed" :value="t('review.signed')" severity="success" />
              <a v-else-if="x.link" :href="x.link" target="_blank" rel="noopener noreferrer" class="rounded-md bg-sky-700 px-3 py-1.5 text-sm text-white hover:bg-sky-800" data-test="esign-link">{{ t('review.signNow') }}</a>
            </li>
          </ul>
          <div class="flex flex-wrap gap-2">
            <Button :label="t('review.refresh')" icon="pi pi-refresh" :loading="busy" data-test="esign-refresh" @click="refresh" />
            <Button :label="t('review.cancel')" icon="pi pi-times" severity="secondary" text :loading="busy" data-test="esign-cancel" @click="cancel" />
          </div>
        </div>

        <template v-else>
          <Message v-if="request && request.state !== 'done'" severity="warn" :closable="false" data-test="esign-ended">{{ t(`review.request.${request.state}` as Key) }}</Message>

          <!-- Each party still to sign: reservations, e-mail, picked. -->
          <div class="space-y-3 rounded-md border border-slate-200 bg-white p-4" data-test="sign-form">
            <h2 class="font-medium">{{ t('review.toSignTitle') }}</h2>
            <div v-for="(p, i) in open" :key="partyKey(p)" class="grid gap-2 border-t border-slate-100 pt-3 md:grid-cols-[14rem_1fr]" data-test="sign-party">
              <label class="flex items-center gap-2 text-sm">
                <Checkbox v-model="form[partyKey(p)]!.picked" :input-id="`pick_${i}`" binary data-test="pick" />
                <span>{{ partyLabel(p) }} · {{ p.name }}</span>
              </label>
              <div class="space-y-2">
                <Textarea v-model="form[partyKey(p)]!.reservations" :placeholder="t('review.reservationsHint')" :aria-label="t('review.reservations')" auto-resize rows="1" class="w-full" data-test="reservations" />
                <template v-if="sig.esign_available">
                  <InputText
                    v-model="form[partyKey(p)]!.email" type="email" :placeholder="t('review.email')" :aria-label="t('review.email')" class="w-full"
                    :invalid="!!errors[`signers[${i}].email`]" data-test="email"
                  />
                  <small v-if="errors[`signers[${i}].email`]" class="text-red-700">{{ errors[`signers[${i}].email`] }}</small>
                </template>
              </div>
            </div>
          </div>

          <div class="grid gap-4" :class="sig.esign_available ? 'md:grid-cols-2' : ''">
            <!-- Electronic, when configured. -->
            <div v-if="sig.esign_available" class="space-y-2 rounded-md border border-slate-200 bg-white p-4" data-test="esign">
              <h2 class="font-medium">{{ t('review.esignTitle') }}</h2>
              <p class="text-sm text-slate-600">{{ t('review.esignHelp') }}</p>
              <Button :label="t('review.esignStart')" icon="pi pi-pen-to-square" :loading="busy" data-test="esign-start" @click="requestESign" />
            </div>
            <!-- By hand. -->
            <div class="space-y-3 rounded-md border border-slate-200 bg-white p-4" data-test="wet">
              <h2 class="font-medium">{{ t('review.wetTitle') }}</h2>
              <div class="flex flex-wrap items-center gap-2">
                <Button :label="t('review.preparePDF')" icon="pi pi-file-pdf" severity="secondary" :loading="busy" data-test="prepare-pdf" @click="preparePDF" />
                <a v-if="pdfURL" :href="pdfURL" download="etat-des-lieux-a-signer.pdf" class="text-sm text-emerald-800 underline" data-test="pdf-link">{{ t('review.downloadPDF') }}</a>
              </div>
              <FilePicker id="signed" v-model="file" accept="application/pdf,image/jpeg,image/png" />
              <small v-if="errors.document_id" class="block text-red-700">{{ errors.document_id }}</small>
              <small v-if="errors.signers" class="block text-red-700">{{ errors.signers }}</small>
              <Button :label="t('review.wetRecord')" icon="pi pi-check" :loading="busy" data-test="wet-record" @click="signByHand" />
            </div>
          </div>
        </template>
      </template>
    </template>
  </section>
</template>
