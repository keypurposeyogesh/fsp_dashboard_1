# 30-day challenge reward process

## Activate the database rules

Run the complete contents of `database/migrations/022_challenge_rewards.sql` in the Supabase SQL Editor as postgres, after migration 016 and the existing enrollment setup. This is transactional and can be run again without resetting existing windows or deleting completions.

The application can show task progress before this migration, but reward balances and discount recording remain unavailable. No local configuration value enables or fabricates redeemable points.

## Confirmed rules

- Only the offering with code `FSP-30DC` earns challenge discount points.
- The approval date is day 1 in Asia/Kolkata. Day 40 ends at 23:59:59.999999 IST; midnight beginning day 41 is outside the window.
- New windows begin when an enrollment first becomes active. Existing enrollments use `reviewed_at`, or `created_at` for registrations without an approval timestamp. This preserves historical deadlines; it does not grant a fresh window when this migration is applied.
- Each distinct saved task earns 100 task points. Task order and ownership are enforced by the existing completion RPC. There is no new one-task-per-calendar-day restriction; completing multiple sequential tasks on a day remains allowed.
- All 30 tasks must be complete before points can be redeemed. Partial progress has earned points but no usable discount balance.
- Finishing all 30 before the deadline unlocks 3,000 redeemable points permanently. Finishing later unlocks 1,500 instead. The 3,000 task points remain visible as the learning total; they are different from the late discount entitlement.
- Missing days does not erase tasks or restart the window. After day 40, the calendar hides but completion history, points, and the ability to finish remaining tasks stay available.
- There is no automatic money conversion. Admins apply discounts manually and record the points used against a unique invoice/discount reference under Management → Task Progress → expand a member.
- Both admin roles can record usage. Members can only read their own balances. The database rejects insufficient balances and repeated deductions for the same request or reference.

## Verification

1. Approve a payment under Admin → Payments. Confirm an active `FSP-30DC` enrollment appears at the top of the member overview with a 40-day calendar.
2. Complete the next task. Confirm task count and earned points increase once by 100; retrying the same task must not award again.
3. Confirm another member cannot read or update this enrollment's points.
4. Expand the enrollment in Admin → Task Progress. Confirm the count, reward deadline, redeemable balance, and dated task history.
5. Once all 30 are complete, manually apply a discount and record its used points and unique reference. Confirm both the member and admin balances decrease, and the usage history contains the reference once.

Pure calendar and UI tests:

```powershell
node --test tests/challenge-calendar.cjs tests/challenge-front.cjs tests/admin-task-progress.cjs
```

Isolated PostgreSQL integration tests (no Supabase account or remote data):

```powershell
npm.cmd install --prefix .test-tools --no-save --no-package-lock --no-audit --no-fund @electric-sql/pglite
node --test tests/challenge-rewards-sql.cjs
```

The SQL integration test reports skipped if the optional local test engine has not been installed. It executes migrations 016 and 022 against an isolated database, tests server reward calculation at the exact deadline, enforces permissions and duplicate completion handling, and verifies redemption idempotency and overdraft rejection.
