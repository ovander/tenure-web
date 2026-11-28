// withStepUp runs a step_up action (tax issue, grants, parameters, exports):
// when the API answers auth/step-up-required, the StepUpDialog explains it and
// sends the user to /bff/login?step_up=1, coming back to this page
// (RENT-FE-001 §7). It resolves undefined in that case.
import { MFARequired, StepUpRequired } from '@/api/client'
import { useSession } from '@/stores/session'

export async function withStepUp<T>(action: () => Promise<T>): Promise<T | undefined> {
  try {
    return await action()
  } catch (e) {
    if (e instanceof StepUpRequired) {
      useSession().stepUpPending = true
      return undefined
    }
    // No second factor on the account: no trip to Socrate's sign-in, a link
    // to the page where it is turned on (tenure-api #262, #270).
    if (e instanceof MFARequired) {
      useSession().mfaRequired = true
      return undefined
    }
    throw e
  }
}
