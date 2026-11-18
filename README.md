# FSP Dashboard

Member, admin and super-admin portal built with Next.js, React and Supabase.

## Run locally

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and enter the Supabase project URL and public key.
3. Run `npm run dev` and open http://localhost:3000.

All accounts use `/login`. Members open the member dashboard, admins open `/admin`, and super admins open `/super-admin` according to their trusted database role. New members can register at `/signup`.

## Production

```bash
npm run build -- --webpack
npm start
```

Configure the same environment variables on your hosting provider. Configure Supabase Authentication redirect URLs for the deployed domain, including `/auth/callback`.

## Supabase setup

Database changes are maintained in `database/migrations/` and applied separately through Supabase; pushing this repository does not apply SQL automatically. For an existing installation, apply missing numbered migrations in order. Review the relevant guide in `docs/` before setting up a new database.

- `020_admin_membership_management.sql`: registered users, membership assignment, one-year terms and change history.
- `021_retire_organizations.sql`: disables the retired organization feature while preserving existing records.
- `026_resource_read_permissions.sql`: restores resource/course SELECT grants while retaining row policies and blocking disabled profiles. Run in Supabase SQL Editor after the base schema and security migrations if the Resources page reports a permission error. Existing resources are preserved.
- [Account and organization retirement](docs/account-settings-and-organization-retirement.md)
- [Membership administration](docs/admin-membership-management.md)
- [Registration and sign-in](docs/signup-process.md)
- [Program publishing](docs/program-publishing-setup.md)
- [Route map](docs/route-map.md)

The optional service-role key is used only by server-side account administration. Never prefix it with `NEXT_PUBLIC_` or commit it to Git. Local environment files, build outputs and dependencies are ignored.

## Checks

```bash
npm test
npx tsc --noEmit
npm run lint
```

Some tests use isolated authentication stubs. Database permission tests live in `database/tests/` and require the corresponding migration state. Browser sign-in, email delivery, uploads and database writes also need verification against the configured Supabase project.

## Browser tests and release

Build the app, install browsers with `npx playwright install chromium webkit`, then run `npm run test:e2e` for the production-server public browser checks. For real accounts and live database isolation checks, configure the ignored `.env.e2e.local` using `.env.e2e.example`, then run `npm run test:e2e:live`. Missing account/fixture configuration fails the live suite; it is not considered a passing release.

See the [production release runbook](docs/production-release.md) for database preflight, staging accounts, CI, backups, deployment, and rollback. `npm run check:release` includes both public and live checks. `.github/workflows/ci.yml` runs normal checks on pushes and pull requests; live checks have a separate manual workflow.
