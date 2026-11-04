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

**Q-W16 Charges and reconciliation — Open (slice 4).** RENT-FE-001 flow 3 orders the wizard as
import → allocate → balances → issue → new provision. tenure-api sets the new provision and the
settlement on the allocated lines, before issuing, because issuing applies them. Provisional:
- the syndic import lives in S10. It uploads the CSV, plus the optional PDF statement, through
  `POST /documents` as class `supporting`, then maps the columns. The mapping proposed is the usual
  French export: « Libellé », « Montant », « Récupérable », `;` and a decimal comma. Imported lines
  are drafts, and each is confirmed one by one in the charge dialog, which shows the syndic's split
  beside the owner's;
- « Lancer la régularisation » stays disabled while drafts remain, and the API refuses to allocate
  them. The calendar year is proposed as the exercise;
- the wizard's steps are charges, allocation, balances, provisions and issue, kept in `?step=`. Steps
  after charges open once the reconciliation is allocated. Each choice on a line (new provision,
  « apply from the next rent call », settlement) is saved as it is made, with the line's
  `If-Match`, so Back loses nothing. When nothing has been typed, the proposed provision is the one
  sent;
- the issue step lists what will be written before « Émettre les décomptes ». After the issue it
  shows the RG statements, « Marquer comme soldée » and « Annuler la régularisation »; cancelling
  needs a reason;
- a new charge's recoverable part defaults to 0 €, so the tenant's share is never overstated. The
  help text points to décret 87-713 and to the syndic's column;
- the texts state no legal duration (archive retention, spread of a late statement). The spread
  shows the instalments the API returns.

**Q-W17 Tax year — Open (slice 5).** RENT-FE-001 S12 says « 2044 lines with drill-down » but not
where the lines' labels come from, and tenure-api makes both computing and issuing step_up.
Provisional:
- the app writes no 2044 line number. Each line is named by the categories that
  `form_2044_line_map` sends to it for that tax year (« Taxe foncière », « Frais de gestion »…).
  The lines that count as income or interest come from the same parameter. When the parameter
  is missing, a warning says so and the numbers are shown without labels;
- « Calculer » / « Recalculer » and « Émettre le récapitulatif » go through `withStepUp`. A sign-in
  older than the limit opens the step-up dialog, then Socrate, and the user comes back to
  `/tax/{year}`;
- micro-foncier and the régime réel are shown side by side. The card with the lower taxable base
  is outlined, with a note that the choice is the owner's. The issue dialog preselects that regime,
  disables micro-foncier when it is not open, and states the réel lock-in from
  `reel_option_lock_years`;
- a line opens onto its sources, charges and payments found by id, with a link to each. A source
  flagged by the API (no supporting document, draft, unmatched) is shown in orange, and so is its
  line;
- the issued year shows the RF PDF and the CSV of the lines as DocumentCards, opened through the
  signed link. The step-up export `GET …/lines.csv` of a draft is not offered in phase 1.

**Q-W18 Editing a tenant — Answered 2026-11-04 (owner request).** RENT-FE-001 has the tenants
drafted in the lease form (S06) but no screen to correct one afterwards. Decided:
- the lease hub's overview lists each tenant with their e-mail and a « Modifier » button, shown
  to the owner only;
- the button opens the same dialog as the lease form, prefilled, and saves through
  `PUT /tenants/{id}` with `If-Match`;
- a 412 reloads the tenant and says the data changed in the meantime, so the next save wins;
- the documents already issued keep the names they were issued with. Only later documents and
  e-mails use the correction;
- a separate tenants screen is not part of phase 1.

**Q-W19 Documents, parameters, grants — Open (slice 6).** Provisional:
- S13 lists `GET /documents` filtered by asset, year, class and number, with the filters in the
  URL. The API's document view carries no number, so the number is searched but not shown in the
  table. A row shows the original file name of an upload, or « Document généré (modèle vN) »
  with its SHA-256;
- the ZIP export of a year or an asset goes through step-up, then `GET /documents/exports/{id}`
  is polled every 1.5 s for at most a minute. The 10-minute link opens in a new tab;
- flow 5 is open from the archive. A rent call's billing document is found by period and lease,
  matched on `document_id`, then cancelled and reissued as on S08. If it no longer stands, the
  screen says so;
- the parameters are listed for everyone, newest value first, with their source link. Only an
  admin (`me.admin`) can add a value. Its JSON is prefilled from the value in force, it is checked
  before sending, and it is sent through step-up. The app writes no value of its own;
- grants are given to a Socrate subject as accountant (the default) or co-owner, and revoked,
  both through step-up. Revoked grants stay listed;
- the profile offers the RGPD export (`GET /me/export`, step-up) as a JSON file built in the
  browser (Blob, no data: URL);
- **Templates:** tenure-api serves no route to list or read the versioned templates, so the screen
  stays « Bientôt disponible » until the API offers one.

**Q-W20 Home to-dos, next dates, lease activity — Open (slice 7a).** tenure-api has no
portfolio to-do route, so S01 builds its list from what it already serves, most urgent kind first:
- **arrears:** a lease whose `GET /leases/{id}/arrears` has an overdue amount. An amount still
  outstanding but not yet due is not a to-do;
- **blocked:** a draft lease with generation or activation blockers (`GET /leases/{id}/blockers`),
  linking to its contract tab and naming the first blocker;
- **warning:** each warning the API returns for a lease, linking to its overview;
- **unmatched:** the payments with an unapplied part (`GET /payments?unmatched=true`), as one item;
- **billing:** this month's leases with no live rent call. A lease counts when it is active or
  under notice, starts by the period's last day and does not end before its first day. The item
  links to the billing month, whose dry run is the review (flow 2).

The home makes one request per lease (blockers, arrears), which is enough for a handful of
assets. A portfolio route would replace it if portfolios grow.

**Next dates** come from the leases themselves, with no legal delay added in the app. There are
three kinds, and the soonest six are shown:
- the end of a notice (`end_on`);
- the end of the current term (`start_on` plus `term_months`), renewed tacitly except for a
  mobility lease, which ends;
- the next month of IRL revision (`revision_month`), when the lease has an IRL reference, never
  before the lease starts. Diagnostics, guarantees and reconciliations wait for the obligations
  calendar (S16, phase 2).

The **lease hub** gets the audit tab of RENT-FE-001 §7 as `/leases/{id}/activity`, named like
the asset hub's (§2's URL scheme lists the asset's only). It lists the lease's own audit events. Events on its guarantees and inventories carry
their own entity type, and appear there once the audit API can filter by lease.

**Q-W21 What a blocker is about — Open (tenure-api Q-105).** A lease blocker used to show its
technical `detail`, an asset id. Provisional:
- the lease hub writes each blocker as « title — subject ». The subject is the diagnostic's name
  (`diag.kind.*`), the asset's label and, for an expired diagnostic, « valable jusqu’au
  dd/mm/yyyy »;
- the subject links to the asset's overview, where diagnostics are recorded;
- the disabled Generate and Activate buttons name the same subject in their tooltip;
- the home page's « blocked » and « warning » to-dos read the same way;
- a blocker without a subject, because it is about the lease itself, shows its title only. The
  technical `detail` is never shown.
