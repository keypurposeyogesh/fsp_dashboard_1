# Challenge reflections and community

## Database activation

For new setup, run `database/migrations/023_challenge_reflections.sql`, then `database/migrations/024_single_task_explanation.sql`, after migrations 016 and 022. If 023 is already applied, run only 024. Apply 024 last so the backend accepts one task explanation. Both are transactional; existing history is preserved.

## Completion flow

For new FSP-30DC tasks, the member answers one prompt: “Explain how you completed this task.” The explanation requires 20–2,000 characters. One submission saves the completion, explanation, and resulting reward eligibility together. Multiple sequential tasks per day remain allowed. There is no second question; older learning notes remain stored and appear only when present.

The shared checkbox defaults to selected with a visibility explanation. The submission button explicitly says “Mark done & share”. Unchecking it saves privately, visible only to the member and admins. No email, payment information, discount history, or points balance appears in the community feed.

The database locks the enrollment, validates task ownership/order and active status, and prevents duplicate task completions or reflections. The legacy two-argument completion RPC cannot bypass required reflections for new challenge completions. Existing completion history and points remain intact; earlier tasks are not automatically shared or retrospectively given fabricated reflections.

Failed submissions retain the form draft. Completed task reflections can be viewed from “View all tasks”.

## Community visibility

- Members: `/challenge-community`, linked from the sidebar and a dedicated dashboard slot.
- Admins and super admins: `/admin/challenge-community`, linked from Management.
- All signed-in active members can read shared entries, newest first, with cursor pagination.
- The author or an admin can hide a reflection from the community without removing task completion, points, or the privately saved reflection.
- Admin → Task Progress → expand member → Task reflections shows both private and shared reflections, loaded only when that section is opened.

## Verification

```powershell
node --test tests/task-completion-form.cjs tests/challenge-front.cjs
node --test tests/challenge-reflections-sql.cjs
```

SQL tests use the project PGlite test dependency described in `docs/challenge-rewards.md`. They do not connect to live Supabase. They verify reflection validation, atomic completion, old-RPC bypass prevention, task order, duplicate handling, private/public visibility, author/admin moderation, pagination, active-account access, and safe migration reruns.
