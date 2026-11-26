# tenure-web

Tenure — rental management frontend: Vue 3, TypeScript, PrimeVue, PWA, French-first UI

Part of **Tenure**, a rental-management platform for houses, apartments and parking boxes under French law:
monthly fee (rent + provisional charges), receipts, syndic charge reconciliation, annual owner tax summary (2044),
contracts and guarantees, 10-year immutable archive.

- **Specification:** RENT-FE-001 in ovander/tenure-api `docs/spec/` is the source of truth. Gaps
  and the provisional readings taken are in `docs/OPEN-QUESTIONS.md`.
- **Identity:** Socrate only, through tenure's Backend-for-Frontend. The app has no login form and
  holds no token. It reads `GET /bff/session` and sends `X-CSRF-Token` on unsafe requests.
- **Delivery:** a tag `vX.Y.Z` publishes `tenure-web-<tag>.tar.gz`, which tenure-api pins in
  `web/VERSION` and embeds.

## Status
Phase 1, slice by slice (`docs/IMPLEMENTATION-PLAN.md`):
- v0.1.0 is the shell: layout, session, S01 Home and S14 Settings › Profile;
- slice 1 adds the assets: list, hub, form and diagnostics.
- slice 2 adds the leases: form with tenants, hub with blockers and transitions, contract,
  guarantees and inventories.

## Development

```bash
npm ci
TENURE_URL=http://127.0.0.1:8080 npm run dev   # /api and /bff proxied to a local tenure
```

| Script | Does |
| --- | --- |
| `npm run typecheck` / `lint` / `test` | vue-tsc, ESLint, Vitest |
| `npm run build` | Production bundle in `dist/`, then the 1 MB gzip budget |
| `npm run e2e` | Playwright smoke of `dist/` under tenure's CSP (`e2e/server.mjs`) |
| `npm run api` / `api:check` | Regenerate / check `src/api/schema.d.ts` from `api/openapi.json` |

Layout: `src/{app,api,components,stores,i18n,features/<module>}`, as RENT-FE-001 §7 sets out.
See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).

## Licence
Copyright © 2026 Olivier Vandermoten. Licensed under the Apache License, Version 2.0; see
[LICENSE](LICENSE). SPDX-License-Identifier: Apache-2.0
