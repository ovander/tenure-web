# Contributing

This is a private product repository. Contributions are by invitation.

## Workflow
1. Open a GitHub issue describing the change and the spec section it implements (e.g. RENT-SPEC-003 §Monthly run).
2. Branch from `main`: `feat/<issue>-<slug>`, `fix/<issue>-<slug>`.
3. Pull request with the issue linked; the `ci` check must pass; the AI security audit comment must be addressed.
4. Squash merge; branches are deleted on merge; `main` is protected.

## Rules that are never relaxed
- Every change implements or amends a spec section; if the spec is wrong, change the spec in the same PR.
- Layering handler → service → repository; no SQL outside repositories; RLS on every owner table.
- Every write emits an audit event in the same transaction.
- No local authentication of any kind; identity is Socrate only.
- Money in integer cents; dates as `date`; timestamps UTC.
- Legal constants live in `legal_params` with an effective date, never in code.
- French is the default language of every user-facing string; generated documents are French only.
- Commit messages: Conventional Commits (`feat:`, `fix:`, `spec:`, `chore:`), one logical change per commit.

## Releases
Tag `vX.Y.Z` on `main`; CI builds and publishes the release. Breaking API changes only on a major.
