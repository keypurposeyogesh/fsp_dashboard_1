# Production release runbook

## Current release rule

Do not publish until the target Supabase project is verified, dedicated live-account checks pass, and a backup/rollback destination is recorded. Passing local unit tests or a production build alone does not satisfy this rule.

## Reproducible checks

Use Node 22 or newer. `npm ci` installs both Playwright and PGlite. SQL tests now import the project dependency directly: a missing PGlite install fails instead of silently skipping privacy tests.

```text
npm ci
npm run check:secrets
npm test
npm run lint -- --max-warnings 0
npx tsc --noEmit
npm run build -- --webpack
npx playwright install chromium webkit
npm run test:e2e
```

The public browser suite runs the actual production app with Chromium, WebKit, and 360px/768px viewports. It exercises hydration, keyboard navigation, signup validation, recovery navigation, missing recovery sessions, protected redirects, API access, and viewport overflow. It does not create real accounts or confirm inbox delivery. Playwright starts `next start` on port 3100 unless `E2E_BASE_URL` is set. Keep that port free or explicitly supply the intended server URL.

## Live database and accounts

1. Confirm the exact Supabase project and application hosting destination.
2. Record an available backup/PITR restore point from Supabase and the current deployed application version. Confirm the plan actually provides the required recovery feature; otherwise take and verify an appropriate backup first. Never paste backup credentials into chat or commit them.
3. Run `database/production_preflight.sql` in SQL Editor. It is read-only. Review unresolved sync issues and duplicate profiles before any repair. In particular, do not blindly rerun migration 003 over unknown production data.
4. Compare against the numbered migrations and apply only missing migrations in order. Run 024 after 023, then 025 and 026 as needed. Running 023 again after 024 restores the old completion validator. Re-run the preflight and review the actual function bodies as well as their signatures.
5. Create four dedicated confirmed accounts in a staging project: member A, member B, admin, and super-admin. Assign trusted roles through the supported audited administration flow, not user metadata. Never use actual member accounts for write tests.
6. Copy `.env.e2e.example` to ignored `.env.e2e.local` and supply credentials locally. Also supply the staging Supabase public settings in `.env.local` or environment variables. Check that the application and direct-query tests point to the same Supabase project.
7. Fixtures: A needs an active FSP-30DC enrollment with an unfinished task. B needs one pending access request and a separate active challenge with a completion/private reflection. Supply those three enrollment IDs. Use a fresh controlled signup inbox each run. Confirm the email redirect allowlist includes the test application's `/auth/callback` and recovery destination.
8. Set `E2E_ALLOW_WRITES=1` only for those disposable fixtures, then run `npm run test:e2e:live`. Missing credentials or fixture IDs fail the suite; nothing is skipped. Task completion and enrollment activation persist, so replace/reset fixtures deliberately before another run. Tests never delete user data automatically.

Live checks exercise login/reload/logout, all discovered static member/admin/super-admin routes, direct cross-member table queries with positive controls, private reflection/reward RPC isolation, Resources permissions, task persistence/idempotency, admin approval, signup request handling, and password-reset request handling. They use real Supabase calls, with no service-role bypass. Dynamic detail routes, full email confirmation, recovery-link consumption/password change, and real-device testing remain additional release checks.

## CI

`.github/workflows/ci.yml` runs tests, static checks, production build, secret checks, and the public browser suite on pushes and pull requests. It uses a non-production Supabase URL/key fixture and does not need privileged credentials. Do not confuse this with live RLS validation.

`.github/workflows/live-release-checks.yml` is a manually dispatched check using the protected `staging` GitHub environment. Configure the variables/secrets named in `.env.e2e.example`; Supabase settings and passwords are secrets. Supply the controlled signup address as a secret. Configure environment access/review requirements in GitHub. The workflow does not deploy. Browser traces/videos and live screenshots are disabled because they can contain credentials/member information.

Neither workflow runs remotely until the changes are pushed to an authenticated GitHub repository. Configure branch protection to require the checks before merging.

## Secrets and deployment

`.env.example` contains placeholders only. Supabase public URL/publishable key are expected in the browser; a service-role/secret key is not. `npm run check:secrets` scans tracked files and built client assets for privileged credentials. Review historical commits and provider secrets separately, and rotate any actual privileged credential found exposed. Account creation requires `SUPABASE_SERVICE_ROLE_KEY` exclusively in the server runtime.

Use a host supporting this app's Node/Next.js server, such as the existing Node hosting destination. This is not a static-only export: the proxy, authentication callbacks, and API routes require server execution. Set the real public Supabase values during build and configure server-only secrets in the hosting provider. The production hostname must be in Supabase Auth's redirect allowlist. The local `.env.local` is not a production secret store.

After release, repeat the public smoke checks against the production URL, confirm sign-in/role redirects, and review authentication/server logs. Add an error-monitoring destination and alert owner before opening access broadly.

## Rollback

- Record and retain the previous immutable deployment ID/artifact and its public build-time configuration before promoting the new version.
- Roll back application code through the hosting provider's previous deployment, then recheck login and API health.
- Do not drop tables, remove reflections, or reverse repair migrations to roll back the UI. Prefer an additive forward database fix.
- If database restoration is necessary, stop writes, have the owner select the recorded backup/PITR point, account for data written since that point, restore and validate a staging copy, then restore production under a documented maintenance window. A code rollback does not roll back member data.

## Owner release sign-off

- [ ] Backup and restore point verified; rollback deployment recorded.
- [ ] Preflight/migration state reviewed against live Supabase.
- [ ] Local/CI tests, lint, types, build and browser checks passed.
- [ ] Authenticated role matrix and direct-query live isolation passed.
- [ ] Signup confirmation email and complete recovery-link/password flow verified using a controlled inbox.
- [ ] Dashboard and task dialog checked at 360px/768px and on an actual phone.
- [ ] Keyboard/screen-reader, contrast, performance and Safari/iOS checks reviewed.
- [ ] Production secrets, redirect URLs, monitoring owner and deployment target confirmed.
- [ ] Post-deployment smoke checks passed; rollout recorded.
