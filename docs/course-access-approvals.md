# Course access approvals

Run `database/migrations/025_course_access_requests.sql` in Supabase SQL Editor after the existing enrollment migrations. No price or receipt data is deleted.

## Member flow

Courses show Request access, Awaiting approval, Access declined, or Active. Course cards, course details, and course-access history do not show amounts, Free labels, payment instructions, or payment uploads. Declined requests can be submitted again. Upcoming courses cannot be requested until registration opens.

All new course access requests require an admin decision, including zero-priced courses. The legacy enrollment RPC also routes course requests through the approval process, so an older client cannot activate a free course automatically.

## Admin flow

Open Management → Courses & Access. The approval queue appears first. Choose Approve access or Decline access; declining requires a note. Activation starts the existing challenge reward window when applicable. Access approval does not issue a paid membership or change membership records.

Existing active course enrollments stay active. Existing pending-payment and payment-review course enrollments become access requests; their historical amounts, receipts, and references remain in the database. Program registration and payment workflows remain unchanged.

## Checks

```powershell
node --test tests/course-access-ui.cjs tests/course-access-sql.cjs
```

SQL tests use the optional isolated PGlite engine described in `docs/challenge-rewards.md`. They cover paid and free courses, duplicate requests, admin-only review, denial and resubmission, legacy-client bypass prevention, preserved historical data, and unchanged free-program registration.
