// What the running app is (Settings › À propos, Q-W31): the web bundle's
// build facts injected by vite.config.ts, and the API's from GET
// /api/v1/version (tenure-api #113). Pure helpers are exported for the tests.
import { api } from '@/api/client'
import type { Schemas } from '@/api/types'

declare const __WEB_BUILD__: { version: string; vue: string; primevue: string; vite: string }

export interface WebBuild { version: string; vue: string; primevue: string; vite: string; dev: boolean }
export type ApiBuild = Schemas['version.View']

export const webBuild: WebBuild = { ...__WEB_BUILD__, dev: import.meta.env.DEV }

export async function apiBuild(): Promise<ApiBuild> {
  return (await api.get<ApiBuild>('/version')).data
}

// mismatch says the bundle in the browser is not the release the API pins:
// a newer local build, or a cache from an older deployment.
export function mismatch(web: Pick<WebBuild, 'version' | 'dev'>, a: ApiBuild | null): boolean {
  const pinned = a?.web?.release
  return !web.dev && !!pinned && pinned !== `v${web.version}`
}

// report is the plain-text block copied for a bug report.
export function report(web: WebBuild, a: ApiBuild | null): string {
  const x = a?.api
  return [
    `tenure-web v${web.version}${web.dev ? ' (vite dev)' : ''} · vue ${web.vue} · primevue ${web.primevue} · vite ${web.vite}`,
    x ? `tenure ${x.version ?? '?'}${x.stamped ? '' : ' (unstamped)'} · commit ${x.commit || 'unknown'} · built ${x.build_time || 'unknown'}` : 'tenure: unavailable',
    x ? `${x.go_version ?? '?'} ${x.platform ?? ''} · backendkit ${x.backendkit || 'unknown'} · schema ${x.schema || 'unknown'}` : '',
    a?.web?.release ? `pinned web ${a.web.release} ${a.web.sha256 ?? ''}`.trim() : '',
  ].filter(Boolean).join('\n')
}
