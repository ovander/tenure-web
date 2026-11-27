<script setup lang="ts">
// The contract tab: documents generated from the lease (contract,
// amendments, DG, CA) as DocumentCards, and the signed copy of the contract,
// uploaded (scanned) and linked to the document it signs (Q-69). A current
// lease is amended from here (AmendmentDialog, Q-W23).
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import DocumentCard from '@/components/DocumentCard.vue'
import FilePicker from '@/components/FilePicker.vue'
import HelpTip from '@/components/HelpTip.vue'
import AmendmentDialog from './AmendmentDialog.vue'
import { ApiError } from '@/api/client'
import { useLeases, amendable, type AmendmentResult, type DocumentMeta, type Lease, type LeaseDocument } from './store'
import { useSession } from '@/stores/session'
import { t, type Key } from '@/i18n'

const props = defineProps<{ lease: Lease }>()
const emit = defineEmits<{ changed: [] }>()
const store = useLeases()
const s = useSession()
const toast = useToast()
const docs = ref<LeaseDocument[]>([])
const uploads = ref<DocumentMeta[]>([])
const file = ref<File | null>(null)
const busy = ref(false)
const error = ref('')
const amending = ref(false)
async function amended(r: AmendmentResult): Promise<void> {
  toast.add({ severity: 'success', summary: t('amendment.done', { number: r.amendment?.number ?? '' }), life: 5000 })
  await load()
  emit('changed')
}
const contract = computed(() => docs.value.filter((d) => d.kind === 'contract').at(-1))

async function load(): Promise<void> {
  if (!props.lease.id) return
  ;[docs.value, uploads.value] = await Promise.all([store.documents(props.lease.id), store.uploads(props.lease.id)])
}
onMounted(load)

async function uploadSigned(): Promise<void> {
  if (!file.value || !contract.value?.document_id) return
  busy.value = true
  error.value = ''
  try {
    await store.upload('contract', props.lease, file.value, contract.value.document_id)
    toast.add({ severity: 'success', summary: t('upload.done'), life: 3000 })
    file.value = null
    await load()
    emit('changed')
  } catch (e) {
    error.value = e instanceof ApiError ? (e.problem.title || t('error.title')) : t('error.network')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <section>
      <div class="mb-3 flex items-center justify-between gap-2">
        <h2 class="font-medium">{{ t('contract.documents') }}</h2>
        <Button v-if="s.canWrite && amendable(lease)" :label="t('amendment.open')" icon="pi pi-file-edit" size="small" severity="secondary" data-test="amend" @click="amending = true" />
      </div>
      <p v-if="docs.length === 0" class="text-sm text-slate-500" data-test="no-documents">{{ t('contract.none') }}</p>
      <div class="space-y-2">
        <DocumentCard v-for="d in docs" :key="d.id" :label="t(`doc.kind.${d.kind}` as Key)" :number="d.number" :issued-at="d.issued_at" :sha256="d.sha256" :document-id="d.document_id" />
      </div>
    </section>
    <section v-if="s.canWrite && contract && lease.state === 'draft'" class="rounded-md border border-slate-200 bg-white p-5" data-test="upload-signed">
      <h2 class="mb-3 flex items-center gap-1 font-medium">{{ t('contract.uploadSigned') }} <HelpTip id="signed" :text="t('help.contract.signed')" /></h2>
      <Message v-if="error" severity="error" :closable="false" class="mb-3" data-test="upload-error">{{ error }}</Message>
      <div class="flex flex-wrap items-center gap-3">
        <FilePicker id="signed" v-model="file" accept="application/pdf" />
        <Button :label="t('contract.uploadSigned')" icon="pi pi-upload" :disabled="!file" :loading="busy" data-test="send-signed" @click="uploadSigned" />
      </div>
    </section>
    <section v-if="uploads.length">
      <h2 class="mb-3 font-medium">{{ t('contract.signedCopies') }}</h2>
      <div class="space-y-2">
        <DocumentCard v-for="u in uploads" :key="u.id" :label="u.original_name || u.number || t(`docs.class.${u.class}` as Key)" :issued-at="u.issued_at" :sha256="u.sha256" :document-id="u.id" />
      </div>
    </section>
    <AmendmentDialog v-if="amending" v-model:visible="amending" :lease="lease" @saved="amended" />
  </div>
</template>
