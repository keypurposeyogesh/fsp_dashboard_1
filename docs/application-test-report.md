# Application test report — 18 November 2026

## Rectification follow-up

The navigation and Resources UI findings below have been corrected. Ordinary admin destinations now share one allowlist between login routing and the server proxy; member restrictions and super-admin-only account creation remain enforced. New regression tests check every sidebar destination against both routing layers.

Resources no longer displays an empty library or stale cards after a failed request. The refresh button is disabled during loading, and a successful retry clears the error.

Migration `database/migrations/026_resource_read_permissions.sql` restores SELECT on resources and the joined courses table. It requires existing RLS/read policies, preserves those row filters, grants no writes, and additionally blocks disabled/missing trusted profiles. It has been verified in isolated PostgreSQL, including repeat application and privacy checks. **It has not been applied to live Supabase:** the workspace has only the public API key. Run this file in Supabase SQL Editor and refresh Resources to complete the live repair.

Validation after rectification: all 115 automated tests passed with none skipped; lint with zero-warning enforcement, TypeScript, and the production webpack build passed. The default `npm test` now includes the database navigation tests as well as the main tests. Live sign-in and account workflows still require browser verification after applying the migration.

The original test-run results below are retained for reference.

## Results

| Check | Result |
| --- | --- |
| Automated tests, including database/tests/*.cjs | 105 passed, 1 failed; none skipped |
| TypeScript: npx tsc --noEmit | Passed |
| ESLint with --max-warnings 0 | Passed |
| Production build with webpack | Passed; generated 62 static pages |
| Public authentication pages | Login, signup, forgot password, reset password returned HTTP 200 |
| Anonymous route protection | Checked 49 member/admin/super-admin routes; all redirected to shared login |
| Legacy admin sign-in | Redirected to /login |
| Anonymous API access | Account creation, profile sync, and valid activity POST requests returned HTTP 401 |
| Invalid activity payload | Returned HTTP 400 |

Tests cover authentication and trusted role routing, account settings, registration, profile repair, course access approvals, task order, reflections, community privacy/moderation, challenge calendars, points/rewards, enrollment approval, membership dates, and admin task progress.

The first database repair test run exhausted process memory while other checks were running. An isolated rerun passed all seven repair tests, followed by a complete rerun with 105 passing tests and only the navigation failure below. The first build was blocked by restricted Google Fonts network access; it passed when run with network access.

## Findings

### 1. Admin sidebar and server permissions disagree

Source: src/components/shell/nav.ts and src/proxy.ts:95.

The sidebar offers these 11 destinations to ordinary admins, but the server redirects each to /admin:

- /admin/applications
- /admin/documents
- /admin/events
- /admin/tasks
- /admin/resources
- /admin/fees
- /admin/community
- /admin/notifications
- /admin/reports
- /admin/member-logs
- /admin/settings

Reproduced by passing an authenticated, active admin through the actual proxy function with isolated authentication/profile responses. This is a code-level routing check, not a live browser login. Super-admin access is separate.

The failing database/tests/admin-navigation.cjs assertion also expects the smaller menu, while the actual sidebar includes the additional destinations. The intended role permissions must be made consistent across the sidebar, proxy, and tests; merely updating the expected menu would leave the redirects broken.

### 2. Resources permission failure is unresolved in the live database

The supplied screenshot shows a permission error. The member page queries resources and joins courses, so access to either relation can affect loading. The baseline SQL includes an authenticated SELECT policy, but repository migrations do not explicitly grant SELECT on these two tables. Actual database grants and migration state were not accessible with the available public key.

Do not conclude that the library is empty or grant broad permissions without checking the database grants and RLS for the affected member.

### 3. Failed Resources loading also displays the empty state

Source: src/components/pages/ResourcesView.tsx:67–70.

The error banner and the empty-library condition render independently. When a request fails with zero loaded resources, the page displays both the permission error and “No training guides or PDFs available yet.” The empty state should only appear after a successful load.

## Limits and remaining verification

No controllable browser was connected, and no dedicated member/admin/super-admin test accounts were available. The public Supabase key cannot inspect privileged database configuration or apply migrations. Database behavior was tested in isolated PGlite PostgreSQL instances, not against live account data.

These live workflows remain unverified: browser sign-in and session persistence, password recovery email, uploads/downloads, live resource permissions, membership/application decisions, payment reconciliation, notifications, and member-to-admin course approval flows. Automated checks passing does not establish that those live workflows work.

No application source or database settings were changed during this test run. Existing challenge-card edits were preserved.
