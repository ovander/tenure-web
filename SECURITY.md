# Security policy

## Reporting a vulnerability
Please do not open a public issue: the repository is public. Report it privately through GitHub's
**Security → Report a vulnerability** on this repository, with a description, the affected version and
reproduction steps. You will get an acknowledgement within 72 hours and a fix or mitigation
plan within 14 days for high-severity issues.

## Scope
Tenure handles tenants' personal data, financial documents and tax summaries. In scope: authentication and
authorisation bypass, row-level-security leaks between owners, audit-chain tampering, document archive access,
injection, dependency vulnerabilities. Out of scope: Socrate itself (report to its repository), denial of service
without a design flaw.

## Controls in place
OWASP ASVS level 2 baseline, hash-chained append-only audit log, object-lock archive, MFA and step-up via Socrate,
gitleaks and dependency scanning in CI, SBOM per release. See `docs/spec/` RENT-SPEC-022.

## Supported versions
Only the latest release on `main` receives security fixes.
