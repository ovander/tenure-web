# Open questions — tenure-web

Gaps in RENT-FE-001 (kept in ovander/tenure-api `docs/spec/`) and the provisional reading taken
for each. The backend's questions are numbered Q-nn in tenure-api; these are Q-Wn.

**Q-W1 PrimeVue styles under the CSP — Open (shell).** RENT-FE-001 asks for a CSP without
inline script. PrimeVue's styled mode (Aura) writes its theme into `<style>` elements at run
time, which `style-src 'self'` blocks. Provisional:
- tenure writes a fresh nonce into `index.html` (`<meta name="csp-nonce" content="__CSP_NONCE__">`)
  and allows `style-src 'self' 'nonce-…'`;
- the app passes that nonce to PrimeVue (`csp.nonce`);
- scripts stay `'self'` only, and `'unsafe-inline'` is never used;
- the smoke test runs under this policy and fails on any violation.
- a nonce never covers style **attributes**. PrimeVue's Tooltip directive writes one
  (`setAttribute('style', …)`), so it is not used: a blocker or a hash is named through the
  `title` attribute, and ESLint refuses `primevue/tooltip`. Any other component found writing a
  style attribute gets the same treatment, never `'unsafe-inline'`.

**Q-W2 What the shell holds — Open (shell).** Provisional:
- v0.1.0 has the layout, the session and two screens: S01 Home, with the last job runs and the
  invitation to create a profile, and S14 Settings › Profile;
- the other routes of §2 show « Bientôt disponible »;
- Settings stays in the menu for every role, since it holds the caller's own profile;
  Templates and Access show for the owner only.

**Q-W3 npm audit — Open (shell).** Provisional:
- runtime dependencies must have no known vulnerability (`npm audit --omit=dev`);
- build tooling must have nothing high or critical. Today's moderate findings are in the
  workbox build chain of vite-plugin-pwa, which never reaches the bundle; Dependabot proposes
  the fix when it is published.

**Q-W4 OpenAPI document — Open (shell).** tenure-api publishes Swagger 2.0 (swag v1).
Provisional:
- `api/openapi.json` is a copy at the tenure-api commit named in `api/SOURCE`;
- `npm run api` converts it to OpenAPI 3 and generates `src/api/schema.d.ts`, and CI checks the
  generated file is current;
- updating the copy is an explicit change, made with the screens that need it.

**Q-W5 Service worker — Open (shell).** "Offline shell only". Provisional:
- the hashed assets are precached;
- navigations are network-first with a cached fallback, since `index.html` carries a
  per-response nonce;
- `/api` and `/bff` are never cached;
- no offline write.

**Q-W6 Ownership shares in the form — Open (slice 1).** The API takes `shares` in basis points
per owner id. The app cannot list the owners of other portfolios, so it cannot offer them.
Provisional:
- a new asset gets the API's default, 100 % to the scope's owner;
- an edit sends the existing shares back unchanged;
- the hub shows the shares, naming the owners the caller knows;
- editing shares waits for a way to pick co-owners (an open question for the grants slice).

**Q-W7 Dwellings a box can hang off — Open (slice 1).** Provisional: the form lists the
houses and apartments among the scope's first 100 assets (RENT-FE-001 §1: a handful of
assets). A larger portfolio needs a search, which the API does not have yet.

**Q-W8 Activity tab — Open (slice 1).** RENT-FE-001 §5 lets the co-owner read the audit tabs,
but tenure-api serves `GET /audit/events` to the owner and the accountant only. Provisional:
- the Activity tab is hidden for a co-owner until the two specs agree;
- it lists the asset's own events, newest first, with the fields changed;
- a diagnostic's events are recorded under the diagnostic and are not shown on the asset yet.

**Q-W9 Tenants — Open (slice 2).** RENT-FE-001 has no tenants screen: S06 drafts them with the
lease. Provisional:
- the lease form picks existing tenants or creates one in a dialog (names, e-mail, phone,
  e-mail language, situation);
- every tenant is joint and several (`solidary: true`, the API's default);
- editing a tenant waits for a screen that needs it.

**Q-W10 Deposit settlement — Open (slice 2).** The API has the deposit's status but no
restitution amount or deductions. Provisional:
- « Solder le dépôt » sets the status to settled once the lease is in notice or ended, which
  lets the lease close;
- the restitution statement belongs with the exit inventory in phase 2 (RENT-SPEC-009).

**Q-W11 Amendments — Open (slice 2).** `POST /leases/{id}/amendments` (rent, tenant added,
asset added) is not in this slice: flow 1 ends at activation. Amendments come with the billing
slice, where a rent change shows on the next rent call.

**Q-W12 Blockers and actions — Open (slice 2).** Provisional:
- the hub lists the API's generation, activation and warning blockers by their titles, in the
  language the API answers in;
- « Générer le contrat » and « Activer le bail » are disabled while a blocker of their kind
  remains, with a tooltip naming the first one;
- every other refusal (a deposit not settled at close, a missing notice date) comes back as the
  API's problem inside the confirmation dialog.
