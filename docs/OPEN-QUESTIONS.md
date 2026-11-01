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
