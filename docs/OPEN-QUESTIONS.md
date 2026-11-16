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

**Q-W11 Amendments — Answered by slice 8 (Q-W23).** `POST /leases/{id}/amendments` (rent,
tenant added, asset added) was not in slice 2, whose flow 1 ends at activation. Slice 8 gives it a
screen.

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

**Q-W22 Dependency alerts with no fix — Open (#29).** Dependabot reported three advisories, all
in the build, lint and test toolchain. None reaches the bundle (`npm audit --omit=dev`: 0).
- **glob** 9.0.0–14.0.1 (GHSA-3g3m-2fjr-6pw4) and **minimatch** 7.0.0–11.0.0
  (GHSA-g3hv-75wg-m249) are fixed through `overrides`: glob 14.0.3, and minimatch 11.0.4 for the
  affected range. The 5.x line used by `filelist` and `@redocly/openapi-core` is outside the
  advisory. The built bundle is byte-for-byte the one of v0.12.0.
- **deepmerge** ≤ 4.3.1 (GHSA-gcqx-w48m-w2h4, low) has no fixed version: 4.3.1 is the latest.
  It is reached only through vite-plugin-pwa › workbox-build › @rollup/plugin-node-resolve.
  There it merges the plugin options from our own vite configuration, at build time, never
  untrusted input. Provisional: the alert is dismissed as a tolerable risk, and the override is
  added once a fixed version is published. `npm audit` therefore keeps one low entry for it.

**Q-W23 Amendments and the IRL revision on the lease hub — Open (slice 8, #35).** RENT-FE-001
gives S05 a contract tab and the IRL reference but no screen for amending a current lease or
revising its rent. tenure-api has both routes: amendments (Q-71) and the revision (Q-13, Q-34).
Provisional:
- « Établir un avenant » is on the contract tab, for an owner, on an active lease or one under
  notice. The dialog takes:
  - the kind: a rent change outside IRL, a tenant added, or a box added;
  - the effective date (today);
  - the new rent (proposed at the current one for a rent change; empty, so unchanged, for a box);
  - the tenant, among those not yet on the lease, or created on the spot;
  - the box, among the portfolio's boxes not on the lease;
  - an optional reason.
- The AV-… joins the lease documents, and the hub reloads the amended lease. The API's refusals
  (same rent, a box under another lease, a zone ceiling) show in the dialog.
- The signed copy of an amendment is not asked for: Q-71 makes it optional, and it can be
  uploaded later.
- « Réviser le loyer » is on the overview, for an owner, on a current lease with an IRL
  reference. Opening it runs the revision as a dry run and shows:
  - the anniversary;
  - the new index against the reference;
  - the current, indexed and revised rents;
  - the zone ceiling, when there is one;
  - the first month at the new rent;
  - what limited it: forfeited, already above the ceiling, the IRL cap, or the zone ceiling.
- « Appliquer la révision » applies it and issues the revision notice. When none is due, the
  dialog shows the API's problem and offers nothing to apply.
- The daily job applies a due revision anyway. The button only lets the owner see it and apply
  it sooner.

**Q-W24 Settings › Templates — Open (#37, tenure-api Q-106).** RENT-FE-001 S14 lists « templates
and versions » without saying what the screen shows or who sees it. Provisional:
- the screen is read only and built on `GET /templates`. Each template shows:
  - its French name;
  - its versions, newest first, the current one tagged « en vigueur »;
  - for each version, the documents it produced and the days of the first and last issue;
  - the head of each version's SHA-256, the full one in the title.
- A template that produced documents links to the archive (S13) filtered on its class.
- Every role sees the tab; an accountant gets the financial templates from the API. Editing a
  template is not offered, since tenure-api defers the per-owner override (Q-106).
- The unused `ComingSoon` screen is removed; the hub's `ComingSoonPanel` stays.

**Q-W25 Asset layout, S15a — Open (#39, tenure-api Q-109).** RENT-INV-001 §8 asks for a room list
« with drag to reorder », elements per room, « seed from template » and `installed_on` per
element. Provisional:
- **Route.** `/assets/{id}/layout`, opened from a « Plan des pièces » button on the asset hub,
  shown to every role but the accountant.
- **No layout yet.** The owner seeds one: the number of bedrooms (not asked for a box), cellar,
  garage, garden, and « loué meublé », proposed from the asset's own flag.
- **Editing.**
  - Rooms and elements are reordered with « monter / descendre » buttons rather than by drag:
    usable on a tablet and from the keyboard, with no drag library to add under the CSP.
  - A room has its name and kind. An element has its name, category, quantity and
    installation date.
  - Rooms and elements are added or removed in place. Removing one does not change the
    inventories already made, since an inventory copies its labels (tenure-api Q-109).
- **Save.** The whole layout is saved with If-Match on its version; an « unsaved changes »
  marker shows until then. A field error (an empty room name) shows on its row, and a 412
  reloads the stored layout and says so.
- **Roles.** The co-owner reads without any write control. The accountant gets the API's 403,
  shown as « not available to your role ».

**Q-W26 Entry inventory capture, S15b — Open (#41, tenure-api Q-111).** RENT-INV-001 §8 describes
the capture screen: rooms with their progress on the left, one card per item on the right, and
a camera button. It does not say how the inventory is created, what each state shows, or how a
failed save looks. Provisional:
- **Creation.** On the lease's inventories tab, an entry inventory is « saisi dans Tenure »
  (`mode: amicable`, proposed first) or recorded from its signed PDF. The exit is recorded from
  its PDF only until RENT-INV-001 slice 8. Creating a captured entry opens
  `/inventories/{id}/capture`. An asset without a layout is refused with the API's message,
  and the owner seeds it from S15a. The tab shows each inventory's state, with a link to its
  capture.
- **Next step.** A panel above the rooms offers the owner the one step the state allows:
  - schedule, with the date, time and place;
  - start on site;
  - complete, disabled while a blocking check of the complete stage remains (the list is
    shown, at most 8 lines) or a photo is still sending;
  - reopen;
  - issue once signed.

  Signing comes with slice 6, so a completed inventory says so.
- **Items.** The 5-level condition is a SelectButton, and the chosen state is repeated as a
  coloured tag. « Fonctionne » is asked for appliance, electrical and plumbing items only.
  - The condition and works are saved on change; the quantity and comment when left. Each
    item is its own PUT with If-Match on its version.
  - A failed save keeps the edit, marks the item, and shows a « N modification(s) non
    enregistrée(s) » banner with a retry button. A 412 reloads the inventory. Starting a
    transition retries the unsaved saves first.
  - The blocking checks are read again from the server after each burst of saves.
  - Items are edited in a draft and on site, and read only otherwise. An item found on site
    is added to the current room.
- **Photos.**
  - `<input type="file" accept="image/*" capture="environment">`, resized on the device to
    2 048 px on the long side (JPEG 0.8, with the EXIF orientation applied by
    `createImageBitmap`).
  - Uploaded one at a time in the background. The preview comes from `blob:`; a failure stays
    on the card with its message and a retry.
  - An archived photo is shown through its signed link, fetched once per photo.
  - Meters take a photo once saved, since a photo needs the meter's id.
- **Meters, keys, header.** Each is a section of its own, saved as a whole with If-Match on the
  inventory's version.
- **CSP.** The e2e server now mirrors tenure's `img-src 'self' data: blob: <archive origin>`,
  with the photos served from a second port. A thumbnail blocked by the CSP fails the tests.
- **Roles.** The co-owner reads with no write control and no next-step panel. The accountant
  gets the API's 403, shown as « not available to your role ».
- **Not yet.** True offline capture (INV-OD-02), the review and signature screen S15c
  (slice 6), the windows and deadlines on the tab (slice 7), and the exit capture (slice 8).

**Q-W27 Review and sign, S15c — Open (#43, tenure-api Q-112).** RENT-INV-001 §8 describes S15c
as a read-only summary with the blocking checks, a reservations field per party, and « request
signatures ». Provisional:
- **Route.** `/inventories/{id}/review`. It opens from the completed capture (« Relire et
  signer ») and from the lease's inventories tab.
- **Content.** The parties (the owner and each co-tenant) with their status, and the signatures
  already recorded (method, date, reservations). Once issued, the EE document to download. The
  full content stays on the capture screen, read only, so it is not repeated here.
- **By hand.** « Préparer la copie à signer » fetches the PDF (`GET …/preview`) and offers it as
  a `blob:` link to download and print. The signed copy is uploaded like any lease document
  (class inventory, scanned). The owner then ticks the parties who signed it and records their
  reservations. Several copies may each be signed by some of the parties.
- **Electronic** (only when the API says the provider is configured):
  - an e-mail per party, required by the provider, then « Lancer la signature »;
  - each party has a « Signer maintenant » button, which opens their link in a new tab
    (INV-OD-03); « Actualiser » reads where the request stands;
  - a pending request can be cancelled, after which the parties can sign by hand;
  - a cancelled or refused request is said so.

  The links are shown to the owner only, as the API sends them.
- **Issue.** The last signature issues the document: the screen shows it as « Émis » with the
  download.
- **Roles.** The co-owner reads the parties and signatures, with no links and no actions. The
  accountant gets the API's 403.

**Q-W28 Exit capture and comparison, S15d — Open (#45, tenure-api Q-113).** RENT-INV-001 §6 and
§8 describe the exit as captured from the entry and compared with it. Provisional:
- **Creation.** From the lease's inventories tab, an exit can be captured in Tenure only once the
  entry is issued; otherwise the only mode offered is « Déposer le PDF signé » (the API refuses
  409 `inventory/exit-without-entry`).
- **Capture.** The same screen as S15b. Each item shows « À l’entrée : … » and « À vérifier »
  until it is saved; « Conforme à l’entrée » saves it unchanged in one tap, since a second tap on
  the pre-filled condition clears it. The « Date et observations » section adds the return of
  the keys (not in the future) and the tenant's new address, both required to complete.
- **Comparison.** `/inventories/{id}/compare`, opened from the exit capture (« Comparer avec
  l’entrée ») and the lease tab. One row per exit item with the entry state, the exit state and
  a result tag (identique, mieux, dégradé, manquant, nouveau); « Écarts seulement » is ticked
  by default. The keys follow, then the count of worse or missing results that the deposit
  settlement (slice 9) will qualify. Read only.
- **Roles.** The co-owner reads the comparison; the accountant gets the API's 403.

**Q-W29 Entry completions — Open (#47, tenure-api Q-114).** RENT-INV-001 §5 step 5 and §8 say
the windows show on the inventories tab and that a request is decided line by line. They say
nothing of the screen. Provisional:
- **Tab.** For the lease's issued entry captured in Tenure, the inventories tab shows:
  - the end of the ten-day window;
  - the heating window, when there is one;
  - the requests still to decide;
  - « Compléments », which opens `/inventories/{id}/completions`.
- **Screen.** The windows, each open or closed today. The owner records a tenant's request as
  received:
  - the reason and the date;
  - the letter, optional, uploaded like any lease document;
  - one line per entry item, with the condition, works or comment asked for. A heating
    request offers heating items only.

  Each request lists its lines: the state at entry next to the state asked for. While
  pending, the owner accepts or refuses every line, then saves (If-Match). The decision issues
  the EC document, offered for download with the letter.
- **Home.** The API's warning `inventory/completion-pending` is a to-do linking to the
  inventories tab.
- **Roles.** The co-owner reads, with no actions; the accountant gets the API's 403.

**Q-W30 Deposit restitution — Open (#49, tenure-api Q-115).** RENT-INV-001 §6 and §8 describe
the settlement wizard and the RD statement, not the screen. Provisional:
- **Tab.** A « Dépôt de garantie » tab on the lease hub (`/leases/{id}/deposit`). It shows the
  deposit held, whether the building is collective, and a link to the entry / exit comparison.
- **Grid.** The annexed grid is shown, can be picked from the scope's grids, or removed. « Nouvelle
  grille » records one and annexes it: name, source, and per category the lifetime, franchise,
  yearly reduction and residual value. Rates are typed as percentages and kept in basis
  points.
- **Deductions.** The exit's worse or missing items and missing keys are listed. « Retenir » takes
  a description (the item by default), the cost, quote or invoice, and the document, uploaded
  as `supporting`. The API computes the tenant's share. Each deduction can be removed until a
  statement is issued, and an item already retained says so.
- **Statement.**
  - The preview shows each figure, the deadline and the penalty.
  - In a collective building, and for the release, it also takes the accounts approval date,
    a regularisation and its document. « Recalculer » runs a dry run.
  - « Émettre le relevé » asks for confirmation, then lists the statement with its download.
  - After the release, the deposit is shown as settled.
- **Asset form.** The « Immeuble en copropriété » toggle (`collective_building`).
- **Roles.** The co-owner reads, with no actions; the accountant gets the API's 403.

**Q-W31 Build information, « À propos » — Open (#51, tenure-api #113).** RENT-FE-001 does not
say how the user tells which build runs. Provisional:
- **Where.** A tab in Settings, « À propos », with no other entry point.
- **Web.** The version in `package.json`, and the Vue, PrimeVue and Vite versions installed.
  They are read from the package files by `vite.config.ts` at build time, so the bundle stays
  reproducible: no date, host or git call. Under the Vite dev server it says so.
- **API.** `GET /api/v1/version`: version, release or local build (and local changes), commit,
  build date, Go toolchain and platform, backendkit, last embedded migration, and the web
  release the binary pins. A failed call says the server's information is unavailable.
- **Mismatch.** When the loaded bundle is not the release the API pins, a warning suggests
  reloading. Examples are a cached older bundle, or a local build served from `web/dist`. It
  is not shown under the dev server.
- **Report.** « Copier pour un signalement » copies both builds as plain text.
**Q-W32 Obligations calendar, computed base — Open (#52, tenure-api Q-116).** RENT-SPEC-012
renders the calendar as a per-asset timeline and a cross-portfolio « next 90 days » list.
Provisional:
- **Home.** « Échéances des 90 prochains jours » replaces the « Prochaines échéances » the app
  computed from the leases itself. The list comes from `GET /calendar`: date, an « En retard »
  tag for an overdue item, the item's label, and the lease (or asset) it concerns.
  - When the calendar cannot be read (the accountant gets 403), the leases' own dates are
    shown as before.
- **Asset.** An « Échéances » tab on the asset hub lists its coming year
  (`/calendar?asset_id=…&to=`). That year always holds the next IRL revision and insurance
  anniversary.
- **Links.** Each item opens where it is dealt with:
  - a diagnostic: the asset's overview;
  - a completion window: the lease's inventories tab;
  - a deposit deadline: the lease's deposit tab;
  - the insurance certificate: the lease's guarantees tab;
  - any other item: the lease's overview.
- **Not built yet.** Items entered by hand, reminders and the digest (tenure-api Q-116).


**Q-W33 Lease notice — Open (#59, tenure-api Q-118).** RENT-FE-001 lists « notice » among
S05's transitions, with no screen of its own. Provisional reading:

- **Where.** « Enregistrer un congé » on the lease hub opens a dialog for every lease under loi
  89-462: unfurnished, furnished and mobility. A box keeps the confirmation with an end date typed
  by hand, because tenure-api computes nothing for it.
- **Tenant.** The owner records:
  - who gave notice;
  - the reduced-notice ground, or « aucun motif »;
  - the reception date (today by default), the delivery and its reference;
  - optionally, the tenant's letter, uploaded as class `notice`.
  
  « Calculer la date de fin » asks the API (`dry_run`), which shows the end and whether the notice
  is reduced. Saving uploads the letter first, then records the notice.
- **Owner.**
  - Offered only for an unfurnished or furnished lease. The owner gives a ground (sale, with its
    price; repossession, with the beneficiary; legitimate, with its statement) and answers the
    protected-tenant question.
  - « Calculer l'échéance » shows the term reached and the last day of receipt. « Générer la lettre
    de congé » issues the CG letter.
  - The reception is recorded on that letter. Reopening the dialog finds the latest CG letter of
    the lease, so the owner can record its reception once it is delivered.
  - The web checks the fields of the ground before calling. The API remains the judge of the legal
    rules: too late, protected tenant, kinds.
- **Overview.** For a lease under notice or after, the overview shows the recorded notice: who
  gave it, the ground, the reception and delivery, the period and the end. It is not shown to an
  accountant, who is refused by the API.
- **Not built yet:** a notice withdrawn, and the letter's attachments, which the owner adds
  (tenure-api Q-118).

**Q-W34 Lease terms and vacancy — Open (#61, tenure-api Q-119).** RENT-FE-001 has no screen for
tacit renewal or vacancy. Provisional reading:

- **Lease overview (S05).** A « Périodes du bail » card shows every term the API lists: its
  dates, « première période » or « tacite reconduction », and its status (passée, en cours, à
  venir).
  - A term cut short by the lease's end reads « terminée par le congé ».
  - The next renewal is shown when the lease renews and has no end. A lease that does not renew
    says so.
  - A lease past its term with no end gets a warning asking the owner to record its end or a new
    lease.
- **Asset overview (S03).** A « Vacance » card lists the periods without a lease, the last one
  « en cours » while it lasts, and the vacant days of each year, latest first. When nothing is
  known (no acquisition date and no lease), the card is hidden. When there was never a gap, it
  says « aucune vacance depuis … ».
- Both are read-only and computed by the API. Nothing is entered on these screens.

**Q-W35 Rent re-evaluation at renewal — Open (#70, tenure-api Q-120).** RENT-FE-001 has no screen
for the under-valued rent procedure (loi 89-462 art. 17-2). Provisional reading:

- **Lease overview (S05).** A « Réévaluation du loyer au renouvellement » card is shown on an
  unfurnished lease when a proposal exists, or when the owner may make one (active, no end set).
  It shows the latest proposal:
  - the renewal it aims at and its status (lettre prête, reçue, acceptée, refusée);
  - the PR letter to download;
  - the current and proposed rents, and the zone tendue cap;
  - the last day of receipt, or the days of reception and answer;
  - the yearly steps, each marked « appliqué » once applied.
- **Proposal.**
  - The dialog takes the new rent, the references (address, description, monthly rent; three
    rows to start, more can be added) and whether the home is in an agglomeration of more than a
    million inhabitants.
  - « Calculer » shows what the API computes (renewal, last day of receipt, increase and its
    share, cap, steps). « Préparer la lettre » issues the PR letter.
  - A half-filled reference is refused before sending. Empty rows are ignored.
  - While the letter is not received, a new one replaces it.
- **Then:**
  1. the reception (date, delivery, reference);
  2. the tenant's answer (accepted or refused, on a day). A refusal shows the conciliation and
     court route; tenure does not track it yet.
  3. Once accepted, « Appliquer les paliers échus » appears when a step is due, and the rent is
     reloaded.
- An accountant sees the card read-only; a co-owner gets no buttons.
- The archive (S13) gains the classes « Congé » and « Proposition de nouveau loyer ». The notice
  class had no label since part 12b.

**Q-W36 Recovery of unpaid rent and payment plans — Open (#72, tenure-api Q-121, Q-122).**
RENT-FE-001 has no screen for the escalation of unpaid rent. Provisional reading:

- **Where it shows.** A « Recouvrement » card on the lease's billing tab, under the arrears. It
  shows while something is overdue, or once a step or a plan exists. Everything in it comes
  from `GET /leases/{id}/recovery`; the screen computes no day and no step.
- **Next steps.** Each step shows its day and a « à faire » tag once that day has passed. A
  surety step names the surety.
  - The formal notice and the surety's information have a « Préparer la lettre » button
    (MD, IC). The letter can be downloaded at once.
  - « Enregistrer » records the step: day, delivery, reference, the insurer's deadline for a
    claim, and a note. A step with a letter is recorded on the letter prepared in this visit,
    or on the letter sent, uploaded. Any other step can carry the deed uploaded.
- **What else the card shows.** The steps recorded, with their documents and what was owed
  that day, and the clause résolutoire's day after a commandement.
- **Payment plan.**
  - « Proposer un plan d'apurement » opens a dialog. The debt is spread evenly over the chosen
    number of monthly instalments, the remainder on the last, and each row stays editable.
  - « Vérifier » asks the API (dry run). The total must equal the overdue debt, and the screen
    says so before sending.
  - The card shows the plan's status (respecté, non respecté, soldé, annulé), what was paid
    against what is due, the next instalment, and why a plan is not respected. While it is
    respected, it says the escalation is suspended.
  - The plan can be cancelled.
- **Who sees what.** An accountant or a co-owner reads the card without buttons.
- **Archive.** It gains the class « Recouvrement ».

**Q-W37 Bank reconciliation screen — Open (#74, tenure-api Q-123 to Q-125).** RENT-FE-001 has no
bank screen; RENT-SPEC-013 asks that only exceptions be left to the owner. Provisional reading:

- **Where.** A « Banque » entry in the navigation opens the lines of one account. The account
  and the status (à rapprocher by default, rapprochées, ignorées) are kept in the URL. A line
  the API flags stale is tagged « en attente depuis trop longtemps »; the delay is the API's
  parameter, and the screen never states a number.
- **Accounts.** A label, and optionally the last four IBAN characters. The full IBAN is never
  asked for.
- **Import.**
  - The statement is uploaded (scanned and archived), then imported. Its format comes from the
    extension: .ofx/.qfx or .csv.
  - For a CSV, the screen reads the header row in the browser, guesses the delimiter, and
    proposes the columns of a French export: date, label, debit and credit or a signed amount,
    and reference. The owner checks the mapping and the date format.
  - « Vérifier » is the API's dry run (new lines, and lines already imported); « Importer »
    writes.
- **Matching.**
  - « Rapprocher automatiquement » first shows how many credits the API is sure of, and how
    many stay for the owner. It matches nothing until confirmed.
  - On a credit, « Rapprocher » lists the API's rent suggestions with their rule, each taken in
    one click for the whole line. « Répartir sur des baux » splits the line across leases,
    each part with its method; the parts must add up to the amount, and the screen checks this
    before sending.
  - On a debit, the charge suggestions are listed: a whole syndic statement, or one charge. A
    debit with none says to record the charge in the ledger first.
- **Other actions.** A line is ignored with a note, and reopened from the « ignorées » filter.
- **Who sees what.** An accountant or a co-owner reads the screen without buttons.

**Q-W38 Loans, the owner's journal and the exports — Open (#76, tenure-api Q-126 to Q-128).**
RENT-FE-001 has no screen for them; RENT-SPEC-014 asks for loans whose interest feeds line 250,
a double-entry ledger and the year-end exports. Provisional reading:

- **Loans live on the asset.** An « Emprunts » tab of the asset hub lists the loans that
  finance it. Each one shows its terms, its totals by year (principal, interest, insurance,
  balance at the year's end), and its amortisation table, folded by default and opened after
  a save.
- **Two ways to record a loan.**
  - **Computed**: rate in percent, term, first due day, insurance per instalment. The rate is
    read by string into parts per million, never through a float. A preview shows the monthly
    instalment and the totals before saving.
  - **Pasted**: the bank's table from a spreadsheet or its export, one instalment a line, tab-
    or semicolon-separated, header and total lines skipped. The dialog counts the instalments
    and the principal they repay against the principal borrowed, and reports the lines it
    cannot read before sending. The API makes the final check.

  A change touching a closed year comes back as the API's 409 `ledger/period-locked`, shown at
  the top of the dialog.
- **The journal** is a « Journal » entry in the navigation, `/ledger/:year`, the current year by
  default, with the previous and next years one click away.
  - Entries come with their lines. A charge or instalment without a supporting document is
    marked.
  - Balances are grouped by class of the chart, with a total that is always zero.
  - A tag says whether the year is closed.
- **The exports** (journal CSV, FEC, year-end pack) are buttons on the journal, step-up
  actions like the tax summary's: without a fresh strong sign-in, the StepUpDialog opens. The
  file is saved through a Blob and a temporary link, named as the API names it. The FEC button
  is disabled until the year is closed, with the reason shown.
- **The tax screen** reads the new flag `superseded_by_loan` (loan charges typed by hand, set
  aside) and names a loan's sources « Emprunt — intérêts / assurance de l'échéance n° … ».
- **Not built yet:** deleting a loan (the API has no route), a link from a tax line's loan
  source to its loan, and the opening balances (tenure-api Q-127).

**Q-W39 The dashboard screen — Open (#78, tenure-api Q-129).** RENT-FE-001 has no dashboard
screen; RENT-SPEC-016 asks to see « the portfolio's performance at a glance ». Provisional
reading:

- **Where.** A « Tableau de bord » entry heads the navigation and opens `/dashboard/:year`,
  the current year by default, with the previous and next years one click away. A running year
  shows the day its figures run to. The home page keeps its to-dos and obligations.
- **What.**
  - Four tiles for the portfolio: rent, expenses (the loan interest named), net and arrears.
  - The year to date against the same days of last year, with the change in percent.
  - The tax estimate under both regimes and the lower one, with a link to the tax summary.
    When the year's 2044 lines are not published, the screen says so rather than guess.
  - One row per asset: rent, net, gross and net yield, occupancy with the vacant days,
    provisions received against recoverable charges paid, and arrears with their non-empty age
    buckets. Each row links to the asset and to its deadlines (the calendar).
  - The bank month by month as plain CSS bars, money in and out scaled to the largest month,
    with the month's balance. There is no chart library.
- **Percentages** are formatted from the API's basis points; occupancy is computed in integers.
- **The CSV export** is a step-up action like the other exports, saved through a Blob.
- **Not built yet:** charts per asset, a trailing twelve months, comparing several years.

**Q-W40 The maintenance screen — Open (#80, tenure-api Q-130, Q-131).** RENT-FE-001 has no
maintenance screen; RENT-SPEC-015 tracks incidents and works « from report to invoice » and the
recurring maintenance on the calendar. Provisional reading:

- **Where.** An « Entretien » entry in the navigation opens `/maintenance` with three tabs:
  incidents, recurring maintenance and contractors. Every role reads; the owner writes.
- **Incidents.**
  - The open ones by default (neither invoiced nor cancelled); a box shows them all.
  - A card per incident: its status, urgency, asset, who reported it and how, the contractor,
    the quote, the days scheduled and done, the photos.
  - The buttons are the steps the API's machine allows from the status. The report can be
    changed until the works are done.
  - A quote or an invoice can carry its document; photos and documents are uploaded as
    supporting documents of the asset.
- **The invoice** asks for the kind of works: repair or upkeep, improvement, or construction
  and enlargement (tenure-api Q-130, #84). A help tip explains each, and a line says what
  follows for the incident's asset:
  - a deductible charge, for a repair, or for an improvement when the asset's kind is listed in
    the legal parameter `tax.improvement_deductible`, read from the API;
  - otherwise capitalised and never deducted.

  The card says whether a charge was created, and links to the charges. The amount starts
  from the quote.
- **Recurring maintenance.**
  - One row per contract: its kind, asset, interval, who must have it done, the last visit and
    the next one, red when overdue and orange within 30 days. The 30 days are a display choice,
    not a legal delay.
  - For a boiler or a chimney the interval and who is responsible may be left empty: the API
    fills the legal rhythm and refuses a longer interval. The screen holds no legal value.
  - A visit is recorded with its certificate.
  - A chimney asks for its fuel; its rhythm by fuel is the API's (tenure-api Q-131, #84).
- **The calendar** names the `maintenance_due` items (boiler, chimney, other) and links them to
  the recurring maintenance tab.
- **Not built yet:** an incident tab on the asset hub, the incident's lease, viewing a photo
  from the card, and the visits' history in the row.

**Q-W41 The furnished-letting screens — Open (#86, tenure-api Q-132).** RENT-FE-001 has no
screen for LMNP under the réel. Provisional reading:

- **The asset's « Meublé » tab** shows its component grid:
  - until one is recorded, the API's proposal (its legal parameters), marked « proposée »;
  - recording it asks for the day first let furnished, the price and the acquisition costs,
    capitalised unless expensed, and a share and a duration per component;
  - shares are typed as percentages and read by string, never through a float; a total that is
    not 100 % is refused before it is sent;
  - a version after the first needs its reason; a version is never changed, and once a
    declaration has used the grid it is frozen and the edit button goes away.
- **Furniture and works.** The treatment is the API's rule by default (the threshold applies
  to furniture only; works by their nature). Forcing the other one needs a reason, and the row
  says « forcé ». The default duration of furniture is the API's.
- **The depreciation of a year** per component and item, with the amount expensed that year.
- **`/bic/{year}`**: the réel (receipts, charges, depreciation within the art. 39 C room and the
  carry, the result, the deficits) beside the micro-BIC, closed when the API says so, and the
  lower regime. Issuing the year's declaration goes through a confirmation and the step-up; a
  declared year shows its regime and no longer offers to issue.
- **The screen holds no legal value**: no threshold, rate, duration or abatement is coded.
- **Not built yet:** the 2033 forms (their line mapping waits for the accountant, tenure-api
  Q-132), a document attached to an item, and the per-asset detail of the result.

**Q-W42 The SCI screens — Open (#88, tenure-api Q-133).** RENT-FE-001 has no screen for an SCI.
Provisional reading:

- **Creating an SCI** is in Settings › Profile (« Créer une SCI »), behind the step-up: its name,
  SIREN, the day it is at the income tax and its capital in parts, which does not change later.
  Only an SCI at the IR is offered. Once created, the app switches to the SCI's scope and opens
  its page.
- **The scope selector** names an SCI « (SCI · gérant) » for its manager. In an SCI's scope the
  navigation shows « SCI » and « 2072 » instead of « Fiscalité » and « Meublé (BIC) », which an
  SCI does not file; those routes go back home there, and the SCI routes do in a person's scope.
  The grants of an SCI offer the manager role.
- **The SCI's page:** its profile; the register on a day (today by default), each associate's
  parts, share and holdings, the parts held against the capital; an associate is a name only,
  the caller (« Moi ») or a person with live access to the SCI; the movements of parts
  (subscription, transfer, gift, succession), recorded in a dialog that lists the open holdings.
  The API checks the capital, the holdings and the declared years.
- **The 2072 of a year:** the result by nature, each associate's share and percentage, the
  blockers in words (year open, furnished rent, register short of the capital, issued), the
  issue behind a confirmation and the step-up. The 2072's line numbers are not shown: they wait
  for the accountant.
- **A person's SCI shares** (`/shares/{year}`): their shares of the issued 2072s and their total,
  the SCIs still to issue theirs, and their loans for parts, recorded with the loan dialog
  without an asset and with the SCI's name.
- **The dashboard** lists, under the 2044 estimate, the SCI shares, the loans for parts and the
  SCIs pending it holds, and the BIC result beside, never added. In an SCI's scope it says the SCI
  files the 2072 and links to it.
- **Not built yet:** undoing a movement, the capital's increase or reduction, the SCI's name in a
  pending SCI (the associate does not read the SCI's row), and a printed 2072.
