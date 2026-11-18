# FSP Community Dashboard — Project Data

Generated 2026-11-18 from the working tree at `d:\fspcommunitydashboard` (branch `main`).

> **Note:** sections 1–13 describe the tree **as surveyed**. The cleanup in section 13 was then applied — see **section 14** for what changed. Where the two disagree, section 14 is current.

A member, admin and super-admin portal for the Facilitator Support Program (FSP), built on Next.js and Supabase.

---

## 1. At a glance

| Item | Value |
|---|---|
| Package name | `fsp-member-hub` |
| Version | `0.1.0` (private) |
| Framework | Next.js `16.4.6` (App Router, Turbopack) |
| UI | React `19.2.8`, React DOM `19.2.8` |
| Styling | Tailwind CSS `4` via `@tailwindcss/postcss`, CSS Modules |
| Icons | `lucide-react` `^1.28.0` |
| Backend | Supabase (`@supabase/supabase-js` `^2.112.2`, `@supabase/ssr` `^0.12.4`) |
| Utilities | `clsx`, `tailwind-merge` |
| Language | TypeScript `^5` |
| Lint | ESLint `^9` + `eslint-config-next` `16.4.6` |
| Currency | INR only (enforced by DB check constraints) |

### Size

| Metric | Count |
|---|---|
| TypeScript / TSX files in `src/` | 191 |
| Lines of code in `src/` | ~22,431 |
| SQL migrations | 25 (~3,709 lines) |
| Setup / process docs in `docs/` | 19 |
| Test files | 31 (16 Node tests + 15 SQL/script checks) |
| App routes (pages + API) | 68 |

### Scripts

| Script | Command |
|---|---|
| `dev` | `next dev` |
| `build` | `next build` (production uses `npm run build -- --webpack`) |
| `start` | `next start` |
| `lint` | `eslint` |

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Server-side privileged account creation only. Never `NEXT_PUBLIC_`-prefixed, never committed. |

### Next.js config (`next.config.ts`)

- `turbopack.root` and `outputFileTracingRoot` pinned to `process.cwd()` — the checkout is nested under another directory that has its own `package-lock.json`, so module resolution and file watching are scoped to this project.
- Remote images allowed from `images.unsplash.com`.

---

## 2. Roles and access model

Three trusted roles, read from `public.users.role` — **never** from user metadata.

| Role | Landing route | Scope |
|---|---|---|
| member (default) | `/dashboard` | Own profile, application, membership, documents, programs |
| `admin` | `/admin` | Member management, approvals, content, reports |
| `super_admin` | `/super-admin` | Role changes, security, audit logs, settings |

Access is enforced in **four layers**:

1. **`src/proxy.ts`** — server-side route gate. Reads the role from `public.users`.
2. **RLS** on every table.
3. **`SECURITY DEFINER` RPCs** for every state change (migrations `001`–`005` onward).
4. **The UI**, which only hides navigation — never the real boundary.

Public paths bypassing the gate: `/login`, `/login/admin`, `/auth/callback`, `/signup`, `/forgot-password`, `/reset-password`.

Rules the database enforces on admin decisions:

- A reason is required to reject or to request changes.
- Admins cannot review their own application or documents.
- Approving an application activates the membership.

---

## 3. Route inventory

### Public

| Route | Purpose |
|---|---|
| `/` | Redirects to `/dashboard` |
| `/login` | Shared sign-in for all roles (Google or email) |
| `/login/admin` | Compatibility redirect to `/login` |
| `/signup` | New member registration |
| `/forgot-password` | Request a password reset |
| `/reset-password` | Set a new password from the emailed link |
| `/auth/callback` | OAuth code exchange, then role-aware redirect |

### Member area — `src/app/(member)/`

| Route | Purpose |
|---|---|
| `/dashboard` | Overview: status cards, required actions, recent activity, membership summary |
| `/profile`, `/profile/edit` | View profile and completion; edit permitted fields and photo |
| `/application` | Application status, step timeline, action required |
| `/application/[id]` | Application detail, edit draft or requested changes, submit |
| `/membership` | Membership card, validity, renewal, history |
| `/membership/register` | Redirects to `/application` |
| `/documents` | Required documents: upload, re-upload, view via signed URLs |
| `/notifications` | Tabs: All / Unread / Membership / Application / Documents / System |
| `/settings` | Account, security (password for email accounts), session |
| `/courses` | Course catalogue, enrollment, daily progress |
| `/tasks` | Daily tasks and completion forms |
| `/challenge-community` | Challenge community feed and reflections |
| `/events`, `/payments`, `/certificates`, `/community`, `/resources` | Program features, grouped under "Programs" in the sidebar |

### Admin area — `src/app/admin/` (roles `admin`, `super_admin`)

| Route | Purpose |
|---|---|
| `/admin` | KPIs, new-members chart, application status, pending actions |
| `/admin/dashboard` | Redirects to `/admin` |
| `/admin/members` | Server-side search/filter/sort/paginate (`?q=&membership=&application=&sort=&desc=&page=`) |
| `/admin/members/new` | Create a member via `POST /api/admin/members` (roles checked server-side) |
| `/admin/members/[memberId]` | Tabs: Overview, Profile, Application, Membership, Documents, Activity |
| `/admin/applications` | Approval queue (`?tab=review\|changes\|approved\|rejected\|all`) |
| `/admin/applications/[id]` | Review page: start review, approve, request changes, reject |
| `/admin/documents` | Document review queue (`?tab=pending\|approved\|rejected\|all`) |
| `/admin/memberships` | Membership assignment, one-year terms, change history |
| `/admin/courses` | Course / program publishing and access approvals |
| `/admin/tasks`, `/admin/task-progress` | Daily task authoring and progress tracking |
| `/admin/challenge-community` | Challenge moderation and reflections |
| `/admin/updates` | Member updates: publish, expiry, archive |
| `/admin/events`, `/admin/payments`, `/admin/certificates`, `/admin/resources`, `/admin/content`, `/admin/community` | Content and operations tools |
| `/admin/reports` | Date-filtered charts and KPIs |
| `/admin/notifications`, `/admin/support` | Messaging and support |
| `/admin/audit-logs`, `/admin/member-logs` | Audit and member activity trails |
| `/admin/settings` | Admin settings |
| `/admin/account` (+ `/profile`, `/profile/edit`, `/notifications`) | The admin's own account |
| `/admin/unauthorized` | Access-denied page (not role-gated) |

### Super-admin area — `src/app/super-admin/` (role `super_admin` only)

| Route | Purpose |
|---|---|
| `/super-admin` | Overview: role counts, sync issues, recent access and settings changes |
| `/super-admin/admins` | Promote, demote, disable, enable admins (via `set_user_role`; reason required, audited) |
| `/super-admin/users` | All users, with role and access changes |
| `/super-admin/security` | Security posture and sync issues |
| `/super-admin/audit-logs` | Full audit event log |
| `/super-admin/settings` | Platform settings |

### API routes

| Route | Purpose |
|---|---|
| `POST /api/admin/members` | Privileged member creation (service role) |
| `/api/auth/sync` | Sync the Supabase auth user into `public.users` / `public.members` |
| `/api/activity` | Activity logging |
| `/auth/callback` | OAuth code exchange handler |

---

## 4. Data model

### Core tables (`database/supabase_migrations.sql`)

| Table | Holds |
|---|---|
| `users` | Identity and trusted `role` |
| `members` | Member profile (name, address, phone) linked to `users` |
| `memberships` | Term dates and status per member |
| `courses` | Course catalogue (legacy) |
| `course_enrollments` | Member ↔ course links |
| `tasks` | Task definitions |
| `task_submissions` | Member task submissions |
| `events` | Events |
| `event_registrations` | Event sign-ups |
| `payments` | Payments and receipts |
| `certificates` | Issued certificates |
| `resources` | Downloadable / linked resources |
| `notifications` | Per-user notifications |
| `community_posts` | Community feed |
| `audit_logs` | Legacy audit trail |
| `app_settings` | Key/value platform settings |
| `member_activity_logs` | Member-facing activity trail |

Every core table carries `created_at`, `updated_at`, `created_by`, `updated_by`.

### Tables added by numbered migrations (`database/migrations/`)

| Table | Holds |
|---|---|
| `offerings` | Unified courses **and** programs (`kind` = `course` \| `program`), code, price, currency, active flag, sort order |
| `offering_enrollments` | Enrollment with payment lifecycle: `pending_payment` → `payment_review` → `active` |
| `offering_daily_tasks` | Per-offering daily task definitions |
| `offering_task_completions` | Member completions of daily tasks |
| `enrollment_payment_settings` | Payment configuration for enrollment |
| `membership_applications` | Application records and review state |
| `member_documents` | Uploaded documents and review status |
| `member_updates` | Published updates with expiry and archiving |
| `session_reminder_deliveries` | Sent session reminders |
| `challenge_reward_windows` | Open reward windows for challenges |
| `challenge_point_redemptions` | Points redeemed |
| `challenge_task_reflections` | Member reflections on tasks |
| `audit_events` | Structured audit events |
| `auth_sync_issues` | Auth-to-database sync failures |
| `trainer_profiles` | Trainer records |
| `client_organizations` | Client organizations |
| `organizations`, `organization_memberships` | Multi-org foundation — **retired** by `021_retire_organizations.sql` (feature disabled, records preserved) |

### Enum types

`membership_status`, `enrollment_status`, `registration_status`, `payment_status`, `notification_type`, `resource_type`, `application_status`, `document_status`

### TypeScript mirror — `database/types.ts`

16 interfaces mirroring the core schema: `User`, `Member`, `Membership`, `Course`, `CourseEnrollment`, `Task`, `TaskSubmission`, `Event`, `EventRegistration`, `Payment`, `Certificate`, `Resource`, `Notification`, `CommunityPost`, `AuditLog`, `AppSetting`, plus a `Json` helper type.

---

## 5. Database functions (RPCs)

All state changes go through `SECURITY DEFINER` functions — never direct table writes from the client.

**Role and permission predicates**
`is_admin`, `is_super_admin`, `is_platform_admin`, `is_api_caller`, `current_app_role`, `can_manage_setting`, `is_org_member`, `has_org_role`, `can_admin_org`, `org_role`, `my_org_ids`, `platform_org_id`

**Auth and user sync**
`handle_new_user`, `_sync_user`, `sync_current_user`, `set_user_role`, `_record_sync_issue`

**Applications and documents**
`submit_application`, `review_application`, `review_document`, `on_document_uploaded`, `on_member_profile_updated`, `guard_applications_write`

**Membership administration**
`admin_save_membership`, `admin_membership_users`, `admin_membership_history`, `membership_effective_status`, `admin_search_members`

**Offerings, enrollment and payment**
`save_program`, `enroll_offering`, `submit_enrollment_payment`, `review_enrollment_payment`, `request_course_access`, `review_course_access`, `audit_offering_update`

**Daily tasks and updates**
`complete_daily_task`, `publish_member_update`, `archive_member_update`, `set_update_expiry`, `expire_member_updates`, `sync_program_dashboard_update`, `send_session_reminders`

**Challenges**
`start_challenge_reward_window`, `_challenge_reward_values`, `get_challenge_rewards`, `redeem_challenge_points`, `get_challenge_community`, `get_task_reflections`, `hide_challenge_reflection`, `guard_reward_task_definition`

**Reporting**
`admin_dashboard_stats`, `admin_monthly_series`

**Organizations (retired)**
`create_organization`, `add_organization_member`, `accept_organization_invite`, `set_organization_member_role`, `update_organization_settings`, `upsert_client_organization`, `upsert_trainer_profile`

**Audit, notification and write guards**
`_audit`, `_audit_event`, `_notify`, `_notify_admins`, `guard_users_write`, `guard_members_write`, `guard_notifications_write`, `guard_audit_logs`, `guard_audit_events`

---

## 6. Migration history

| # | File | Theme |
|---|---|---|
| 000 | `000_diagnostics.sql` | Diagnostics |
| 001 | `001_security_hotfix.sql` | Security hotfix |
| 002 | `002_user_sync.sql` | Auth → database user sync |
| 004 | `004_member_workflow.sql` | Member workflow |
| 005 | `005_workflow_rpcs.sql` | Workflow RPCs |
| 006 | `006_offering_enrollments.sql` | Offerings and enrollments |
| 007 | `007_profile_read_permissions.sql` | Profile read permissions |
| 008 | `008_payment_receipts_membership.sql` | Payment receipts and membership |
| 009 | `009_profile_edit_permissions.sql` | Profile edit permissions |
| 010 | `010_member_updates.sql` | Member updates |
| 011 | `011_course_details_dates.sql` | Course details and dates |
| 012 | `012_programs_dashboard_updates.sql` | Program dashboard updates |
| 013 | `013_updates_storage_audit_permissions.sql` | Storage and audit permissions |
| 014 | `014_update_time_expiry.sql` | Update expiry |
| 015 | `015_unified_dashboard_programs.sql` | Unified dashboard programs |
| 016 | `016_course_daily_tasks.sql` | Daily tasks |
| 017 | `017_session_reminders.sql` | Session reminders |
| 018 | `018_restore_api_grants.sql` | Restore API grants |
| 019 | `019_org_foundation.sql` | Organization foundation |
| 020 | `020_admin_membership_management.sql` | Membership assignment, one-year terms, history |
| 021 | `021_retire_organizations.sql` | Retire the organization feature |
| 022 | `022_challenge_rewards.sql` | Challenge rewards |
| 023 | `023_challenge_reflections.sql` | Challenge reflections |
| 024 | `024_single_task_explanation.sql` | Single-task explanation |
| 025 | `025_course_access_requests.sql` | Course access requests |

> Migration `003` is absent from the sequence.

Migrations are **not** applied by deploying the repo — they are run separately through Supabase, in numbered order.

### Standalone SQL utilities (`database/`)

| File | Purpose |
|---|---|
| `supabase_migrations.sql` | Base schema |
| `20260909_fix_google_oauth_member_sync.sql` + `.ANALYSIS.md` | Google OAuth member-sync fix and its analysis |
| `diagnose_current_profile_conflicts.sql` | Diagnose profile conflicts |
| `repair_orphaned_profiles.sql` | Repair orphaned profiles |
| `repair_single_task_saving.sql` | Repair single-task saving |
| `open_mastermind_registration.sql` | Open mastermind registration |
| `reset_30_day_progress.sql` | Reset 30-day challenge progress |
| `diagram.mmd` | Mermaid schema diagram |

---

## 7. Source layout

```
src/
├── proxy.ts                  Server-side route gate (role from public.users)
├── app/
│   ├── layout.tsx, page.tsx
│   ├── (member)/             Member area + shared layout
│   ├── admin/                Admin area + shared layout
│   ├── super-admin/          Super-admin area + shared layout
│   ├── api/                  activity, admin/members, auth/sync
│   ├── auth/callback/        OAuth code exchange
│   └── login, signup, forgot-password, reset-password
├── components/
│   ├── shell/                AppShell, Header, Sidebar, nav.ts
│   ├── layout/               Sidebar, TopNav, LogoutModal
│   ├── ui/                   26 primitives (listed below)
│   ├── admin-ui/             AuditTimeline, DecisionPanel, DocumentReview, MemberHeader, MemberAvatar, format, useQueryParams
│   ├── admin/                Enrollment, membership, courses, tasks, payments, fees, resources, events, challenge discount, task reflections, course access review
│   ├── member/               UnifiedDashboard, DashboardPrograms, MembershipCard, DailyCourseProgress, TaskCompletionForm, ChallengeCommunity, ChallengeRewards, CourseAccessDetails, TodaysUpdates, RequiredActions, ProfileCompletionCard, DocumentCard, PaymentReceiptLink, workflow.ts
│   ├── pages/                CoursesView, TasksView, EventsView, PaymentsView, CertificatesView, CommunityView, ResourcesView
│   ├── super-admin/          AuditDetailDialog, RoleChangeDialog, UserPills, accessData, auditLabels, useDebounced
│   ├── auth/                 AuthProvider
│   └── charts/               Charts
├── lib/
│   ├── supabase/             client.ts, server.ts, admin.ts
│   ├── data/                 admin, member, overview, superAdmin, enrollments, catalog-types, challenge-community, challenge-rewards, task-progress, errors, types
│   ├── auth.tsx, auth-redirect.ts, navigation.ts, status.ts
│   ├── gamification.ts, challenge-calendar.ts, program-schedule.ts
│   ├── membership-dates.ts, profile.ts, enrollment-refresh.ts
│   └── activity-log.ts, error-message.ts, greeting.ts, useAsync.ts, utils.ts, types.ts
└── data/                     courses, members, programs, mockData, mockUsers (seed / mock)
```

### UI primitives (`src/components/ui/`)

`Avatar`, `Badge`, `Button`, `CalendarCard`, `Card`, `ConfirmDialog`, `DataTable`, `EmptyState`, `Form`, `Input`, `Logo`, `NotificationCard`, `PageHeader`, `ProgressBar`, `ProgressRing`, `ScrollArea`, `Select`, `StatCard`, `States`, `StatusBadge`, `Switch`, `TabBar`, `Table`, `Tabs`, `Timeline`, `Toast`

Every signed-in page renders inside the shared `AppShell` (`src/components/shell/`), which supplies the sidebar (a drawer on mobile), a header with page search, a notification bell, a user menu, and loading and access states.

---

## 8. Feature documentation (`docs/`)

| Document | Covers |
|---|---|
| `route-map.md` | Full route map and the four access layers |
| `signup-process.md` | Registration and sign-in |
| `member-management-plan.md` | Member management plan |
| `admin-management-process.md` | Admin management process |
| `admin-membership-management.md` | Membership administration |
| `account-settings-and-organization-retirement.md` | Account settings; organization retirement |
| `org-foundation-setup.md` | Organization foundation (retired feature) |
| `enrollment-setup.md` | Enrollment configuration |
| `program-publishing-setup.md` | Program publishing |
| `course-access-approvals.md` | Course access approval flow |
| `course-update-setup.md` | Course updates |
| `unified-dashboard-setup.md` | Unified dashboard |
| `daily-task-setup.md` | Daily tasks |
| `member-updates-setup.md` | Member updates |
| `update-expiry-setup.md` | Update expiry |
| `session-reminders-setup.md` | Session reminders |
| `payment-receipt-setup.md` | Payment receipts |
| `challenge-community.md` | Challenge community |
| `challenge-rewards.md` | Challenge rewards |

---

## 9. Tests and checks

```bash
node --test tests/*.cjs
npx tsc --noEmit
npm run lint
```

### Node tests (`tests/`)

`account-settings`, `admin-task-progress`, `auth-performance`, `auth-routing`, `challenge-calendar`, `challenge-front`, `challenge-reflections-sql`, `challenge-rewards-sql`, `challenge-rewards-ui`, `course-access-sql`, `course-access-ui`, `enrollment-approval`, `gamification`, `membership-dates`, `signup-flow`, `task-completion-form`

Some use isolated authentication stubs.

### Database permission tests (`database/tests/`)

SQL checks matched to migrations `006`, `008`, `009`, `010`, `012`, `014`, `015`, `016`, `017`, `019`, `020`, `021`, plus the scripts `admin-navigation.cjs`, `program-schedule.cjs`, `run-enrollment-check.mjs`. These require the corresponding migration state.

Browser sign-in, email delivery, uploads and database writes still need verification against the configured Supabase project.

---

## 10. Repository state

- Branch `main`, a single commit `e840276` ("Initial commit"), with a large uncommitted working set (~60+ modified files across `src/`, `database/` and config).
- Build artifacts sit in the repo root and are not source: `build_output.txt` through `build_output7.txt`, `dev_output.txt`, `tsconfig.tsbuildinfo`.
- Brand assets in the root: `FSP LOGO.png`, `FSP LOGO COLOR OPTION.png`.
- `AGENTS.md` (included by `CLAUDE.md`) warns that this Next.js version has breaking changes and that `node_modules/next/dist/docs/` is the authority; that block is regenerated by `next dev`.

---

## 11. Verified state — what is actually built

All checks below were run against the working tree on 2026-11-18.

| Check | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | **Pass** (exit 0, no errors) |
| Lint | `npm run lint` | **Pass** (no output) |
| Tests | `node --test tests/*.cjs` | **Pass** — 92/92, 0 fail, ~9s |
| Production build | `npm run build` | **Pass** — all 68 routes emitted, proxy middleware active |

So the app is in a genuinely working state, not a half-wired scaffold.

### The data layer is real, not mocked

Every feature view queries Supabase directly or through `src/lib/data/*`. 26 tables and 20 RPCs are called from application code. There is exactly **one** vestigial mock reference left: `CalendarCard.tsx` imports the `EventItem` *type* (not data) from `@/data/mockData`.

That makes `src/data/` effectively dead weight — ~1,900 lines of unused fixtures:

| File | Lines | Status |
|---|---|---|
| `mockData.ts` | 1,340 | Only its `EventItem` type is used |
| `members.ts` | 412 | Unreferenced |
| `programs.ts` | 101 | Unreferenced |
| `courses.ts` | 55 | Unreferenced |
| `mockUsers.ts` | 1 | Unreferenced |

### RPC coverage

Of ~70 database functions, 20 are invoked from the frontend. The remainder are legitimately not frontend-callable:

- **RLS predicates** — `is_admin`, `is_super_admin`, `current_app_role`, `has_org_role`, …
- **Triggers / write guards** — `guard_*`, `_audit`, `_notify`, `handle_new_user`, `on_document_uploaded`, `membership_effective_status`
- **Scheduled jobs** — `expire_member_updates`, `send_session_reminders`
- **Retired** — all seven organization functions

### Feature completeness by area

| Area | State |
|---|---|
| Auth: sign-up, sign-in, Google OAuth, password reset, role routing | Complete, test-covered (`signup-flow`, `auth-routing`, `auth-performance`) |
| Application → review → membership activation | Complete, RPC-backed, audited |
| Document upload and review (signed URLs) | Complete |
| Membership administration, one-year terms, history, CSV export | Complete (`membership-dates` tests) |
| Offerings, enrollment, payment submission and review | Complete (`enrollment-approval` tests) |
| Course access requests and approval | Complete — newest feature (migration `025`), covered by `course-access-sql` / `course-access-ui` |
| Daily tasks, completion, single-explanation form | Complete (`task-completion-form`, `admin-task-progress`) |
| Challenges: rewards, points, redemption, reflections, community | Complete (5 dedicated test files) |
| Gamification: XP, levels, streaks, badges | Complete (`gamification`, `challenge-calendar`) |
| Member updates: publish, expiry, archive | Code complete, **but expiry depends on pg_cron** (see risks) |
| Session reminders | Code complete, **but depends on pg_cron** (see risks) |
| Reports, audit logs, member logs, super-admin role management | Complete |
| `/admin/support` | **Placeholder** — static fiction (see risks) |
| Organizations / multi-tenancy | Deliberately retired by migration `021` |

### Work currently in flight (uncommitted)

The working tree holds **one coherent feature wave**, not scattered edits: 62 modified files (+1,103 / −870) and 49 untracked files, all serving **challenges / gamification** and **course access approvals**.

- **Migrations** `022_challenge_rewards`, `023_challenge_reflections`, `024_single_task_explanation`, `025_course_access_requests`
- **Docs** `challenge-rewards.md`, `challenge-community.md`, `course-access-approvals.md`
- **Components** `ChallengeCommunity`, `ChallengeRewards`, `ChallengeDiscount`, `TaskReflections`, `CourseAccessReview`, `CourseAccessDetails`, `TaskCompletionForm`
- **Libraries** `gamification.ts`, `challenge-calendar.ts`, `navigation.ts`, `enrollment-refresh.ts`, `error-message.ts`, `data/challenge-*`, `data/task-progress.ts`, `data/overview.ts`, `data/catalog-types.ts`
- **Routes** `(member)/challenge-community`, `admin/challenge-community`, `admin/task-progress`, `admin/account/notifications`
- **Tests** 11 new files, all passing

This is a complete, tested, buildable feature set sitting on top of a single `Initial commit` — it has simply never been committed.

---

## 12. Risks and open items

Ordered by how much they can bite.

### 1. `/admin/support` ships fabricated information

[src/app/admin/support/page.tsx](src/app/admin/support/page.tsx) is entirely static and the content is invented:

- `support@fsp-guild.org` — an email that is not the project's
- `+1 (800) 555-0199` — a US toll-free number, for an INR-only, India-based program
- `#fsp-dashboard-help` — a Slack channel
- Asserted facts: "Daily, 2:00 AM UTC" backups, "Sundays, 3:00-5:00 AM EST" maintenance, "Database Mirroring Replicas — Sync Active"

Admins will act on these. It also renders literal `**Audit Logs**` because Markdown bold was written into JSX text. This page needs real contact details or should be removed from the nav.

### 2. Two features silently depend on pg_cron being enabled

Migrations `014` and `017` try to schedule jobs and, if `pg_cron` is unavailable, only `RAISE NOTICE`:

```
cron.schedule('fsp-expire-updates','* * * * *','SELECT public.expire_member_updates()')
cron.schedule('fsp-session-reminders','* * * * *','SELECT public.send_session_reminders()')
```

If nobody enabled the extension in Supabase, **update expiry and session reminders never fire** and the migration still reports success. Worth verifying against the live project. (Expired posts are at least hidden by RLS regardless.)

### 3. `.env.example` contains live-looking credentials

It holds a real project URL (`pbavixiusvyvhkmfocyw.supabase.co`) and a publishable key rather than placeholders. The anon key is designed to be public, but an example file is not the place to pin a specific project.

### 4. Legacy and new schemas both live

Two parallel models coexist, and the legacy one is still queried more heavily:

| Legacy | Replacement |
|---|---|
| `courses`, `course_enrollments` | `offerings`, `offering_enrollments` |
| `tasks`, `task_submissions` | `offering_daily_tasks`, `offering_task_completions` |
| `audit_logs` (27 call sites) | `audit_events` |

No migration path is documented. Which table is authoritative for a given screen is not obvious from the code.

### 5. Dead code

- `src/data/` — ~1,900 lines of mock fixtures, one type import away from fully unused
- `src/components/layout/Sidebar.tsx` and `TopNav.tsx` — superseded by `src/components/shell/`; only `LogoutModal` is still imported from that folder
- Organization tables and seven RPCs, retired but retained

### 6. Repository hygiene

- Everything real is uncommitted on top of one `Initial commit`, so there is no history to bisect and nothing is backed up by a push.
- `build_output.txt` … `build_output7.txt` and `dev_output.txt` are committed build logs. They are **stale** — they reference routes that no longer exist (`/certificate-management`, `/task-management`, a top-level `/src/app/notifications`), i.e. the state before the route-group restructure. They record failures that no longer reproduce; the build now passes.
- `tsconfig.tsbuildinfo` is tracked.
- Migration `003` is missing from the sequence with no note explaining it.

### 7. Unverifiable from the code alone

The README is explicit that these still need checking against the configured Supabase project: browser sign-in, email delivery, file uploads, and database writes. RLS policies and `SECURITY DEFINER` behaviour can only be confirmed by running `database/tests/*.sql` against the real migration state.

---

## 13. Waste, duplication and unreachable code

Everything below was verified by import-tracing, not inferred. Two different problems are mixed together in this codebase, and they need opposite fixes:

- **Unreachable** — finished work no user can get to. **Fix the navigation; do not delete.**
- **Dead / superseded** — genuinely replaced or never used. **Safe to delete.**

### A. Unreachable: 12 admin pages with no link anywhere

These pages build, compile and ship, but have **no sidebar entry** (`src/components/shell/nav.ts`) and **zero `href` references anywhere in `src/`**. They can only be reached by typing the URL.

| Route | Lines | What is stranded |
|---|---|---|
| `/admin/member-logs` | 311 | Member activity trail |
| `/admin/reports` | 289 | Date-filtered charts and KPIs |
| `/admin/certificates` | 258 | Certificate issuing |
| `/admin/notifications` | 234 | Admin broadcast composer |
| `/admin/documents` | 202 | **Document review queue** |
| `/admin/settings` | 185 | Admin settings |
| `/admin/community` | 169 | Community moderation |
| `/admin/support` | 90 | Support desk (placeholder content) |
| `/admin/content` | 69 | Content Hub (6 tabs) |
| `/admin/events` | 8 | → `EventsSection` (406 lines) |
| `/admin/resources` | 8 | → `ResourcesSection` (320 lines) |
| `/admin/tasks` | 8 | → `TasksSection` (445 lines) |
| **Total** | **1,831** | |

Those last three thin wrappers strand a further **1,450 lines** of working admin sections (`EventsSection`, `TasksSection`, `ResourcesSection`, `FeesSection`, `DailyTaskEditor`), reachable only through orphaned routes.

`/admin/documents` is the most serious: document review is a core step of the member workflow, it has a dedicated RPC (`review_document`), it is documented in `docs/route-map.md` — and there is no way to click to it.

The admin sidebar lists 10 links. The admin area has 24 pages.

### B. Duplication: two navigation paths to the same six sections

`/admin/content` ("Content Hub") renders exactly the same components as the standalone routes:

| Component | Content Hub tab | Standalone route | In sidebar? |
|---|---|---|---|
| `EventsSection` | Events & Fees | `/admin/events` | Neither |
| `TasksSection` | Tasks & Challenges | `/admin/tasks` | Neither |
| `EnrollmentManagement` | Courses | `/admin/courses` | **Route only** |
| `ResourcesSection` | Resources | `/admin/resources` | Neither |
| `FeesSection` | Fees & Pricing | — | Neither |
| `PaymentsSection` | Payments | `/admin/payments` | **Route only** |

Two complete UI shells for one set of features. Pick one.

### C. Dead code: 3,701 lines with zero imports

Verified by grepping every `import` of each symbol across `src/`.

**Unused mock fixtures — 1,909 lines**

| File | Lines |
|---|---|
| `src/data/mockData.ts` | 1,340 |
| `src/data/members.ts` | 412 |
| `src/data/programs.ts` | 101 |
| `src/data/courses.ts` | 55 |
| `src/data/mockUsers.ts` | 1 |

The only thing still reaching into this folder is `CalendarCard.tsx`, which imports the `EventItem` **type** — and `CalendarCard` is itself dead. Delete `CalendarCard` and the entire `src/data/` folder follows.

**Superseded implementations — 1,097 lines**

| File | Lines | Superseded by |
|---|---|---|
| `components/pages/EventsView.tsx` | 398 | `/events` renders `<CoursesView sessions />` instead |
| `components/admin/CoursesSection.tsx` | 334 | `EnrollmentManagement` |
| `components/layout/Sidebar.tsx` | 218 | `components/shell/Sidebar.tsx` |
| `components/layout/TopNav.tsx` | 110 | `components/shell/Header.tsx` |
| `components/admin/ManagementOverview.tsx` | 37 | — |

Only `LogoutModal` is still imported from `components/layout/`; the folder otherwise exists to hold two dead files.

**Unused UI primitives — 464 lines**

`NotificationCard` (107), `CalendarCard` (97), `StatCard` (93), `ProgressBar` (56), `Avatar` (55), `EmptyState` (38), `ScrollArea` (11), `Switch` (7). Eight of the 26 primitives in `components/ui/` are never imported — nearly a third of the design system is unused.

**Other — 231 lines**

| File | Lines | Note |
|---|---|---|
| `database/types.ts` | 190 | **Imported nowhere** — not by `src/`, `tests/` or `database/tests/` |
| `src/lib/greeting.ts` | 25 | Unused |
| `src/lib/data/overview.ts` | 16 | Unused |

`database/types.ts` is worse than unused — it is **actively misleading**. It declares `password_hash: string` on `User`, but the app uses Supabase Auth and never sees a password hash. It also models only the legacy `courses`/`tasks` schema, with no `offerings`, `offering_enrollments`, applications, documents or challenges. Anyone treating it as the schema reference will be wrong. It is also one of the files modified in the working tree, so effort is still going into it.

### D. Redundant parallel implementations

| Concern | Implementations |
|---|---|
| Avatars | `ui/Avatar.tsx` (dead), `admin-ui/MemberAvatar.tsx` (38), `member/MemberAvatar.tsx` (43) — three, one dead, two near-identical |
| Sidebars | `layout/Sidebar.tsx` (dead, 218), `shell/Sidebar.tsx` (164) |
| Tables | `ui/Table.tsx` (10 imports) and `ui/DataTable.tsx` (7 imports) |
| Tabs | `ui/Tabs.tsx` (1 import) and `ui/TabBar.tsx` (4 imports) |
| Progress | `ui/ProgressBar.tsx` (dead) and `ui/ProgressRing.tsx` |
| Type definitions | `database/types.ts` (190, unused), `src/lib/types.ts` (14), `src/lib/data/types.ts` (178) — `User` and `Membership` are each declared twice |

### E. Duplicated database surface

Two schema generations are live simultaneously, and the **older one is still queried more**:

| Legacy | Call sites | Replacement | Call sites |
|---|---|---|---|
| `audit_logs` | 27 | `audit_events` | 0 from `src/` |
| `courses` | 7 | `offerings` | 1 |
| `course_enrollments` | — | `offering_enrollments` | 3 |
| `tasks` + `task_submissions` | 10 | `offering_daily_tasks` + `offering_task_completions` | 4 |

Plus fully retired surface still carried: `organizations`, `organization_memberships`, `client_organizations`, `trainer_profiles` and 7 organization RPCs — **zero** frontend references since migration `021`.

### F. Committed build logs — 8 files, ~216 KB

| File | Size |
|---|---|
| `build_output5.txt` | 147 KB |
| `build_output3.txt` | 41 KB |
| `build_output4.txt` | 15 KB |
| `build_output6.txt` | 4.3 KB |
| `build_output7.txt` | 4.0 KB |
| `dev_output.txt` | 2.0 KB |
| `build_output.txt` | 1.4 KB |
| `build_output2.txt` | 0.4 KB |

All eight are **tracked in git** and all are **stale** — they reference `/certificate-management`, `/task-management` and a top-level `/src/app/notifications` that no longer exist, i.e. the layout before the route-group restructure. Several are UTF-16, so they are unreadable as diffs. They record build failures that no longer reproduce; `npm run build` passes today. `.gitignore` already covers `*.tsbuildinfo` and `.env*` but not these.

### Totals

| Category | Amount | Action |
|---|---|---|
| Unreachable admin pages | 1,831 lines | **Add nav links** |
| …stranding admin sections | 1,450 lines | **Add nav links** |
| Dead code, zero imports | 3,701 lines | Delete |
| Committed stale build logs | 8 files, 216 KB | Delete + gitignore |
| Duplicate UI shell (`/admin/content` vs routes) | 6 components, 2 paths | Choose one |

**~3,700 lines are safe to delete outright** — about **16% of the 22,431 lines in `src/`** — and that figure does not count the retired organization schema.

Suggested order: (1) link `/admin/documents` and the other 11 orphans into `nav.ts`, since that is finished work currently invisible; (2) untrack the 8 build logs; (3) delete `src/data/` + `CalendarCard` together; (4) delete or regenerate `database/types.ts`; (5) decide between Content Hub and standalone routes; (6) consolidate avatars, tables and tabs.

---

## 14. Cleanup applied — 2026-11-18

Everything in section 13 was implemented. The dashboard was explicitly left alone: `UnifiedDashboard.tsx`, `(member)/dashboard/page.tsx`, `admin/page.tsx` and `Overview.module.css` were **not edited**.

### Verification after the change

| Check | Before | After |
|---|---|---|
| `npx tsc --noEmit` | Pass | **Pass** |
| `npm run lint` | Pass | **Pass** |
| `node --test tests/*.cjs` | 92/92 | **92/92** |
| `npm run build` | Pass | **Pass** |
| Files in `src/` | 191 | **170** |
| Lines in `src/` | 22,431 | **18,806** |

**3,625 lines removed — 16.2% of `src/` — with no regression.**

### Navigation gap closed

The admin sidebar went from 10 links to 22, across three groups. Every previously stranded page is now reachable.

**`Management`** (always visible) — two added:

| Added link | Route |
|---|---|
| Applications | `/admin/applications` |
| Documents | `/admin/documents` |

`Activity Log` and `Account Settings` moved out to `Records & Settings` to keep this group focused on the daily workflow. `Courses & Access` changed icon from `Calendar` to `BookOpen`, freeing `Calendar` for Events.

**`Content & Operations`** (new, collapsible):

| Link | Route |
|---|---|
| Events | `/admin/events` |
| Tasks & Challenges | `/admin/tasks` |
| Resources | `/admin/resources` |
| Fees & Pricing | `/admin/fees` *(new route)* |
| Certificates | `/admin/certificates` |
| Community | `/admin/community` |
| Notifications | `/admin/notifications` |

**`Records & Settings`** (new, collapsible):

| Link | Route |
|---|---|
| Reports | `/admin/reports` |
| Activity Log | `/admin/audit-logs` |
| Member Logs | `/admin/member-logs` |
| Admin Settings | `/admin/settings` |
| Account Settings | `/admin/account` |

Both new groups render collapsed and auto-expand when a child route is active — existing behaviour in `NavSection`, no component changes needed.

**Remaining routes with no sidebar link, all verified reachable in-app:**

| Route | Reached from |
|---|---|
| `/admin/account/profile` | role-aware `profilePath` in profile, profile/edit and settings pages |
| `/admin/account/profile/edit` | the profile page |
| `/admin/account/notifications` | `accountNotificationsPath()` in `src/lib/navigation.ts` |
| `/admin/members/new` | `/admin/members` and `/super-admin/admins` (super admin only) |
| `/admin/dashboard` | redirect to `/admin`; covered by the Overview link's `match` |
| `/admin/unauthorized` | the access-denied redirect target |

### Content Hub resolved in favour of standalone routes

`/admin/content` deleted. `/admin/fees` created to host `FeesSection`, which had been reachable only through the hub. Each of the six sections now has one bookmarkable URL and one sidebar entry, with no overlap against the existing `Courses & Access` and `Payment Approvals` links.

### `/admin/support` deleted

The page asserted an invented support email, a US toll-free number, a Slack channel and specific backup/maintenance schedules, and nothing in the codebase linked to it. Removed rather than linked into the new sidebar. Worth rebuilding from real contact details when they exist.

### Files deleted — 3,625 lines

**Mock fixtures (1,909)** — the whole `src/data/` folder: `mockData.ts`, `members.ts`, `programs.ts`, `courses.ts`, `mockUsers.ts`. Unlocked by deleting `CalendarCard.tsx`, its last consumer.

**Superseded implementations (1,097)** — `components/pages/EventsView.tsx`, `components/admin/CoursesSection.tsx`, `components/layout/Sidebar.tsx`, `components/layout/TopNav.tsx`, `components/admin/ManagementOverview.tsx`. `components/layout/` now holds only `LogoutModal.tsx`, which `shell/AppShell.tsx` still imports.

**Unused UI primitives (464)** — `CalendarCard`, `NotificationCard`, `StatCard`, `ProgressBar`, `Avatar`, `EmptyState`, `ScrollArea`, `Switch`. `components/ui/` went from 26 files to 18.

**Other (231)** — `database/types.ts`, `src/lib/greeting.ts`, `src/lib/data/overview.ts`.

`database/types.ts` was removed rather than corrected: nothing imported it, and it was actively wrong — it declared `password_hash` on `User` (the app uses Supabase Auth and never sees one) and modelled only the legacy `courses`/`tasks` schema. Sections 4 and 5 of this document are now the schema reference. If a typed schema is wanted, generate it from the live database (`supabase gen types typescript`) rather than hand-maintaining it.

Every deletion was confirmed by grepping all imports of the symbol across `src/` and `tests/` first. `src/lib/data/overview.ts` was checked specifically against `UnifiedDashboard.tsx`, which does not import it — the dashboard's data comes from `getMyProfile`, `DailyCourseProgress`, `ChallengeCommunity`, `ChallengeRewards`, `TodaysUpdates` and `CoursesView`, all retained.

### Build logs untracked

`build_output.txt` … `build_output7.txt` and `dev_output.txt` (8 files, ~216 KB) removed from git tracking and from disk. `.gitignore` gained:

```
# captured build and dev output
build_output*.txt
dev_output.txt
```

A stale `.next/types/validator.ts` referenced the two deleted routes and produced four phantom `tsc` errors; clearing `.next` regenerated it and type checking is clean.

### Not done — deliberately out of scope

These were identified in sections 12–13 but not acted on, because each needs a decision or an environment that code alone cannot settle:

| Item | Why it was left |
|---|---|
| Legacy vs new schema (`audit_logs` 27 call sites vs `audit_events` 0; `courses` vs `offerings`) | A data migration with real rows at stake, not a refactor. Needs a plan and a backfill. |
| Retired organization tables and 7 RPCs | Migration `021` keeps records deliberately; dropping them is a database decision. |
| `pg_cron` for `expire_member_updates` and `send_session_reminders` | Must be enabled and verified in the Supabase project; cannot be checked from the repo. |
| `.env.example` holding a live project URL and key | Your call whether to replace with placeholders. |
| Consolidating `Table`/`DataTable`, `Tabs`/`TabBar`, the two `MemberAvatar`s | All are in active use; merging them is a refactor with UI risk and no correctness gain. |
| Missing migration `003` | Unknown whether it was intentional. |
| Committing the work | Still one `Initial commit` with everything uncommitted. |
