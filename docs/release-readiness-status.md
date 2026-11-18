# Release readiness — 18 November 2026

**Release is blocked; no production deployment was performed.**

## Verified locally

| Check | Result |
| --- | --- |
| Unit/SQL tests | 116 passed, zero skipped |
| Real browser public tests | 40 passed: Chromium, WebKit, 360px and 768px viewports |
| ESLint, zero-warning enforcement | Passed |
| TypeScript | Passed |
| Production webpack build | Passed, 62 static pages |
| npm dependency audit | Zero vulnerabilities after compatible updates |
| Secret scan | Tracked files, example configuration, built client assets, and local Git history passed |
| GitHub workflow YAML | Both workflows parsed successfully |

Browser verification used the actual production build. It caught a signup initialization race in WebKit; the form is now disabled until authentication initialization finishes. Authentication transport failures now stop at an explicit retry screen instead of bouncing between the login page and a protected page.

SQL tests now use the normal PGlite development dependency instead of an ignored local install. Missing database-test dependencies cannot silently skip the privacy tests. CI workflow files have been added locally, but have not run on GitHub.

## Live checks are blocked

The 11-test live browser suite is implemented. Running it with `--max-failures=1` stopped at the explicit missing `E2E_MEMBER_A_EMAIL` configuration error; one test failed setup and ten did not run. **This is a blocked live verification, not eleven passing tests.** No live account mutations were performed by that run.

Required external inputs/actions:

1. Configure dedicated member A, member B, admin, and super-admin accounts plus disposable enrollment fixtures in ignored `.env.e2e.local`. See `.env.e2e.example` and the runbook. The live suite includes actual sessions, authenticated role routes, direct RLS isolation with positive controls, task persistence/idempotency, Resources permissions, admin approval, signup, recovery request handling, and dashboard viewport checks.
2. Verify the exact live Supabase project, take/confirm a recoverable backup, run `database/production_preflight.sql`, review unresolved profile conflicts, and apply missing migrations in order. The available public API key cannot inspect/apply privileged SQL; live migration 003/022–026 state is not certified.
3. Confirm the production hostname/provider and its authentication callback allowlist. No deployment target or hosting credentials were configured.
4. Authenticate GitHub locally and push the changes before claiming remote CI is passing. `gh auth status` reports no logged-in hosts.
5. Complete controlled-inbox email confirmation and recovery-link consumption, real phone/Safari-iOS, screen-reader/contrast/performance, and monitoring-owner checks.

Public browser testing is not evidence that the authenticated dashboard works against live RLS. WebKit emulation is not an actual iPhone test. A documented backup plan is not a verified backup.

Use [production-release.md](production-release.md) for the exact release and rollback sequence. Do not publish until the outstanding live gates are satisfied.
