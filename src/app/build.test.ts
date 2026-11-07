import { describe, expect, it } from 'vitest'
import { mismatch, report, type ApiBuild, type WebBuild } from './build'

const web: WebBuild = { version: '0.21.0', vue: '3.5.44', primevue: '4.4.1', vite: '8.3.5', dev: false }
const api: ApiBuild = {
  api: { version: 'v0.1.21', commit: 'abc123', build_time: '2026-11-07T01:00:00Z', stamped: true, go_version: 'go1.27.3', platform: 'linux/amd64', backendkit: 'v1.27.0', schema: '000016' },
  web: { release: 'v0.21.0', sha256: 'ff' },
}

describe('build', () => {
  it('flags a bundle that is not the release the API pins', () => {
    expect(mismatch(web, api)).toBe(false)
    expect(mismatch({ ...web, version: '0.22.0' }, api)).toBe(true)
    expect(mismatch({ ...web, version: '0.22.0', dev: true }, api)).toBe(false)
    expect(mismatch(web, { api: api.api, web: {} })).toBe(false)
    expect(mismatch(web, null)).toBe(false)
  })
  it('reports both builds as plain text', () => {
    expect(report(web, api)).toBe([
      'tenure-web v0.21.0 · vue 3.5.44 · primevue 4.4.1 · vite 8.3.5',
      'tenure v0.1.21 · commit abc123 · built 2026-11-07T01:00:00Z',
      'go1.27.3 linux/amd64 · backendkit v1.27.0 · schema 000016',
      'pinned web v0.21.0 ff',
    ].join('\n'))
    expect(report({ ...web, dev: true }, null)).toBe('tenure-web v0.21.0 (vite dev) · vue 3.5.44 · primevue 4.4.1 · vite 8.3.5\ntenure: unavailable')
    expect(report(web, { api: { version: 'dev', stamped: false, go_version: 'go1.27.3', platform: 'linux/amd64' }, web: {} })).toContain('tenure dev (unstamped) · commit unknown')
  })
})
