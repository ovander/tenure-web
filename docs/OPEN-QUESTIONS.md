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

**Q-W13 Field help and defaults — Open (owner feedback).** The owner asked for default values
and an explanation on every input. Provisional:
- **Help:** every field has a help tip beside its label: a short FR/EN text saying what is asked
  and why, shown on hover and on keyboard focus and linked by `aria-describedby`. It is CSS only
  (Q-W1). The texts state no legal number, because those come from the parameters.
- **Defaults of a new lease:**
  - start date: the 1st of next month (Europe/Paris);
  - due day: the 1st;
  - revision month: the start month;
  - IRL: the latest published quarter and its value;
  - term: `lease_term_months` for unfurnished and furnished, the longest `mobility_term_months`
    for a mobility lease, none for a box;
  - deposit: the rent × `deposit_max_months` for the kind, none for a box.
- Each default follows its source (the kind, the rent, the start date) until the user changes
  the field, and is then never overwritten. Without the parameter (tenure-api < v0.1.2) there is
  no default, and the term's help says so.
- **Other defaults:** a guarantee other than the deposit is valid from the lease start; an entry
  inventory is dated the lease start, an exit one the lease end or today.
- The deposit is proposed at the legal cap, as owners usually ask; the help says less may be
  asked. No default is proposed for a notice date: the notice periods (`notice_months.*`) arrive
  in phase 2.

**Q-W14 Zone tendue — Answered 2026-11-03 (owner question, tenure-api Q-102).** A Baillargues flat
is in a zone tendue but outside rent control. tenure-api now has `tense_zone` beside
`controlled_zone`. Decided:
- S04 shows « En zone tendue » above the rent-control switch. While rent control is on, the
  zone-tendue switch shows on and locked, because rent control implies the zone tendue;
- the help text points to service-public.fr's simulator, since the app does not encode a list of
  communes;
- S03 shows the zone tendue in the overview;
- S06 offers the rent exemption when any asset of the lease is in a zone tendue, because the
  exemption lifts the relocation rule, never a rent-control cap.

**Q-W15 Billing month and payments — Open (slice 3).** RENT-FE-001 gives S08 and S09 but no URL
for payments, no « send again » route in the API, and receipts that tenure-api issues every hour
(`billing.receipts`). Provisional:
- S09 lives at `/billing/payments` under the Billing entry, since the navigation keeps six entries.
  Its filters stay in the URL (`?unmatched=1`). The lease hub's Billing tab shows the same list,
  restricted to the lease, along with its arrears and documents;
- « Issue » stays disabled until a dry run has been shown in the « Simulation » panel. The dialog
  restates the count and total of what the dry run computed. A part month (start or notice end)
  and a carried-over credit are flagged as « À vérifier »;
- « Cancel and reissue » needs a reason, which tenure-api prints on the cancellation. It is offered
  on every live rent call; tenure-api refuses it once a receipt exists, and the dialog shows that
  refusal;
- « Send again » is not shown: tenure-api has no route to resend a document yet. The download
  stays available;
- a new payment proposes what the lease still owes, today's date and a bank transfer, and is
  applied to the oldest rent calls unless the owner unticks the box. A manual match proposes the
  same oldest-first split, which the owner can change;
- « Émettre les quittances maintenant » triggers `billing.receipts` for the owner's scope rather
  than waiting for the next hourly run.
