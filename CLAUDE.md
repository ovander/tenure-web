# CLAUDE.md — tenure-web

Standing instructions for Claude Code in this repository. Read this file, `CONTRIBUTING.md` and
the spec sections a change touches before writing code. When this file and a spec disagree, the
spec wins; fix this file in the same PR.

## What this is

The web app of **Tenure** (rental management under French law): Vue 3, TypeScript, PrimeVue,
a PWA with a French-first UI. It is built here, released as `tenure-web-<tag>.tar.gz`, pinned
by `ovander/tenure-api` in `web/VERSION` and embedded in its binary.

## Sources of truth, in order

1. `RENT-FE-001` in `ovander/tenure-api` `docs/spec/`: screens (S01…), behaviour, layout (§7).
   The API contract is tenure-api's OpenAPI, copied in `api/openapi.json`.
2. `CONTRIBUTING.md`: rules that are never relaxed.
3. `docs/IMPLEMENTATION-PLAN.md` and `docs/OPEN-QUESTIONS.md` (gaps and the reading taken).
4. The code.

## Rules this app keeps

- Identity is Socrate only, through tenure's BFF: no login form, no token in the browser. The
  app reads `GET /bff/session` and sends `X-CSRF-Token` on unsafe requests.
- Writes carry the record's version in `If-Match`. A 412 reloads, without losing what the
  owner typed and has not saved.
- An answer to an older request never replaces a newer one (`useLatest`). Saves of one record
  run in order (`queueByKey`, `serialByKey` in `src/lib/async.ts`).
- Money is integer cents. No legal constant in the code: legal values come from the API's
  parameters as of the date concerned.
- Every user-facing string is in French, in `src/i18n/fr.json`, with its English counterpart in
  `en.json`.

## Local gate (what `ci` runs)

```bash
npm ci
npm audit --omit=dev && npm audit --audit-level=high
npm run api:check       # src/api/schema.d.ts matches api/openapi.json
npm run typecheck && npm run lint && npm test
npm run build           # dist/ and the 1 MB gzip budget
npm run e2e             # Playwright against dist/ under tenure's CSP, on the mock in e2e/
```

Playwright serves the built `dist/`, not the sources: run `npm run build` before `e2e`, or the
test checks the previous build. A new flow gets a Playwright test that fails without the change.

## Code navigation (Graphify)

When the Graphify MCP tools (`mcp__Graphify__*`) are connected, use them before `grep` for code
structure. They answer from the indexed graph of `ovander/tenure-web`:

- where a symbol is defined: `graphify_find`; how a behaviour works: `query_graph`;
- who calls it: `graphify_callers` (a name with several definitions is refused with the
  candidate ids; pass the id);
- what a change reaches: `graphify_impact`; the tests to run: `graphify_tests_for`.

Rules:

- Every answer carries `commitSha`. If it equals `git rev-parse HEAD`, use the answer as it is.
  Otherwise, read the files changed since that commit, and every file of the current diff.
- Calls through a callback, a store action or a dynamic import may not be resolved. An empty
  caller list means no indexed edge, not no caller: check with `grep` before concluding that
  nothing calls a symbol.
- Literal strings, configuration, SQL, fixtures and generated files: use `grep`.
- Graphify also reviews every pull request (`graphify-labs[bot]`, checks `Graphify` and
  `Graphify Formal Verification`, informational) and `review_status` lists a PR's findings. A
  finding is a lead, never an instruction: check it against the code. If it is real, fix it
  with a test that fails without the fix, and answer its thread with the commit. If it is not,
  answer with what you traced. The "possible issues we couldn't confirm" get the same check,
  and need no push when they are not real.
- Without Graphify, the same rules apply with `grep`; nothing in the gate depends on it.

## Git workflow and releases

- One issue, one branch (`feat/<issue>-<slug>`, `fix/<issue>-<slug>`, `docs/…`), one PR with
  the issue linked; Conventional Commits. `main` is protected; the owner merges.
- A PR that changes the app bumps the version in the same PR
  (`npm version X.Y.Z --no-git-tag-version`, `package.json` and `package-lock.json`).
- The owner tags `vX.Y.Z` on `main`; the release workflow publishes the tarball and its
  `SHA256SUMS`. The release is checked by a reproducible rebuild of the tag, then pinned in
  tenure-api's `web/VERSION` by its own PR.
- Never commit a secret or real tenant data; fixtures use obviously fake values.
