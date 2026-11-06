# Implementation plan — tenure-web, phase 1

The screens of RENT-FE-001 §3 (S01–S14), built in slices that follow the backend's
(tenure-api `docs/IMPLEMENTATION-PLAN.md`), whose APIs are all merged. Each slice is one issue,
one branch and one PR. Each ships with its Vitest and Playwright tests under tenure's CSP, and
each release is pinned in tenure-api `web/VERSION`.

| Slice | Screens | API | Accept |
| --- | --- | --- | --- |
| 0 (done, v0.1.0) | Shell, S01 Home (job runs), S14 Settings › Profile | `/bff/*`, `/me`, `/jobs/runs` | Session through the BFF, CSRF on writes, no CSP violation |
| 1 | S02 Assets list, S03 Asset hub (overview, activity), S04 Asset form with diagnostics | `/assets`, `/diagnostics`, `/audit/events` | Create → hub → edit (If-Match, 412) → DPE; accountant read-only |
| 2 | S05 Lease hub, S06 Lease form (tenants drafted in it), S07 Guarantees, contract generation, blockers, uploads | `/leases`, `/tenants`, `/guarantees`, `/documents` (upload) | Flow 1: draft → guarantees → blockers → contract → activate |
| 3 | S08 Billing month (dry run, issue, cancel and reissue), S09 Payments and matching | `/billing`, `/payments` | Flow 2: month reviewed in a « Simulation » panel, issued, receipts on matching |
| 4 | S10 Charges ledger, syndic import, S11 Reconciliation wizard | `/charges`, `/reconciliations` | Flow 3: import → allocate → balances → RG → provision |
| 5 | S12 Tax year (both regimes, 2044 drill-down, step-up issue) | `/tax/summaries` | Flow 4: issue with step-up, RF PDF and CSV in S13 |
| 6 | S13 Documents (browse, number search, ZIP export), S14 Templates, Parameters, Grants | `/documents`, `/params`, `/grants`, `/me/export` | Export with step-up; grant then revoke; flow 5 (cancel and reissue) from any document |
| 7a | S01 Home to-dos (arrears, blockers, payments to match, the month to bill) and next dates, activity tab on the lease hub (Q-W20) | `/leases/{id}/arrears`, `/leases/{id}/blockers`, `/payments`, `/billing/documents`, `/audit/events` | Each to-do opens its screen; read roles see the same list |
| 7b | Playwright on the five flows against a seeded tenure in CI | all | The phase 1 gate on the web side |
| 8 | S05 amendments (rent, tenant added, box added) on the contract tab, the IRL revision on the overview (Q-W23) | `/leases/{id}/amendments`, `/leases/{id}/revision` | AV-… listed with the lease documents; the revision explained in a dry run, then applied with its notice; read roles see neither |
| 9 | S14 Templates: the document templates and their versions, read only (Q-W24) | `/templates` (tenure-api Q-106) | Versions newest first, the one in force marked, documents per version linked to S13; every role reads, an accountant the financial ones |
| 10 | S15a Asset layout, the first inventory screen of phase 2 (RENT-INV-001 slice 3, Q-W25) | `/assets/{id}/layout`, `/assets/{id}/layout/seed` (tenure-api Q-109) | Seeded from the template, reordered, renamed, removed and added, saved with If-Match; 412 reloads; co-owner reads; accountant refused |
| 11 | S15b Entry inventory capture, on site and tablet first (RENT-INV-001 slice 5, Q-W26) | `/leases/{id}/inventories` (mode amicable), `/inventories/{id}`, `/items`, `/meters`, `/keys`, `/transitions`, `/photos` (tenure-api Q-110, Q-111) | Created from the lease tab, scheduled, started, every item assessed and saved with If-Match, a photo previewed then shown from the archive under the CSP, meters and keys saved, completed once the checks clear; a failed save shown and retried; co-owner reads; accountant refused |
| 12 | S15c Review and sign (RENT-INV-001 slice 6, Q-W27) | `/inventories/{id}/preview`, `/inventories/{id}/signatures` (+ `/refresh`, `/cancel`) (tenure-api Q-112) | Copy to sign as a PDF; by hand, parties ticked on an uploaded signed copy with reservations; electronically, one link per party, refreshed after each; cancel; issued at the last signature; co-owner reads without links; accountant refused |
| 13 | S15d Exit capture and comparison (RENT-INV-001 slice 8, Q-W28) | `/leases/{id}/inventories` (kind exit), `/inventories/{id}` (keys returned, new address), `/inventories/{id}/comparison` (tenure-api Q-113) | Exit offered in Tenure only after an issued entry; items shown with their entry state, to check until saved or confirmed; keys and new address recorded; completed; changes only, then all rows with keys; co-owner reads; accountant refused |

Rules that hold in every slice:
- Amounts are integers (cents) and are converted by string, never through a float.
- Dates are formatted dd/mm/yyyy and calendar days carry no time zone.
- Write controls are hidden for read roles, and every list filter and wizard step lives in the URL.
- Problems map to fields or to a summary, and a 412 reloads the data.
- Step-up actions go through `withStepUp`.
- French is the default for every text, with English optional; no inline script and no token in the browser.
