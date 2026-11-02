// useProblemForm maps an API problem onto a form (RENT-FE-001 §6): field
// errors inline from errors[], a summary at the top for a rule, a reload when
// the data changed in the meantime (412 on If-Match).
import { ref } from 'vue'
import { ApiError } from '@/api/client'
import { t } from '@/i18n'

export function useProblemForm(onStale?: () => Promise<void>) {
  const errors = ref<Record<string, string>>({})
  const summary = ref('')
  const busy = ref(false)

  function reset(): void {
    errors.value = {}
    summary.value = ''
  }

  // submit runs action and reports its problem; it resolves true on success.
  async function submit(action: () => Promise<unknown>, local: Record<string, string> = {}): Promise<boolean> {
    reset()
    if (Object.keys(local).length) {
      errors.value = local
      summary.value = t('error.form')
      return false
    }
    busy.value = true
    try {
      await action()
      return true
    } catch (e) {
      if (!(e instanceof ApiError)) {
        summary.value = t('error.network')
        return false
      }
      for (const f of e.problem.errors ?? []) if (f.field) errors.value[f.field] = f.message ?? ''
      if (e.status === 412 && onStale) {
        await onStale()
        summary.value = t('error.stale')
      } else {
        summary.value = e.problem.errors?.length ? t('error.form') : e.problem.title || t('error.title')
        if (e.problem.detail && !e.problem.errors?.length) summary.value += ` ${e.problem.detail}`
      }
      return false
    } finally {
      busy.value = false
    }
  }

  return { errors, summary, busy, submit, reset }
}
