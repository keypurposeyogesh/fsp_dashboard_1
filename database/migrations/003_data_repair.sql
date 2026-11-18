-- ===========================================================================
-- 003_data_repair.sql
--
-- Repairs auth -> profile drift, the gap 002_user_sync.sql refuses to close on
-- its own. _sync_user() bails out with 'email_conflict' when public.users
-- already holds the signed-in user's email under a DIFFERENT id, because
-- re-keying a primary key touches every foreign key that points at it. The
-- member then sees "Your account has a profile conflict" and an empty
-- dashboard, since getMyProfile() has nothing to return.
--
-- RUN IT IN THE SUPABASE SQL EDITOR (as postgres), not from the app:
-- guard_users_write() returns early for non-API callers, so the id update is
-- permitted there and nowhere else.
--
-- Run 000_diagnostics.sql first and read the output.
--
-- Safe to run more than once: every step is a no-op when it has nothing to do.
-- It never changes a role that is already set, never deletes a row, and never
-- merges duplicates - anything needing judgement is reported, not guessed at.
-- The final SELECT prints what it did.
-- ===========================================================================

CREATE TEMP TABLE IF NOT EXISTS repair_log (
  step   TEXT,
  detail TEXT,
  at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Foreign keys pointing at public.users(id) -> ON UPDATE CASCADE
--    Without this, step 2 cannot move an id: dependent rows would be orphaned.
--    Discovered from the catalog so a table added later is still covered.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r     RECORD;
  v_def TEXT;
BEGIN
  FOR r IN
    SELECT c.conname,
           c.conrelid::regclass::TEXT AS child,
           pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      JOIN pg_class     rt ON rt.oid = c.confrelid
      JOIN pg_namespace rn ON rn.oid = rt.relnamespace
     WHERE c.contype    = 'f'
       AND rn.nspname   = 'public'
       AND rt.relname   = 'users'
       AND c.confupdtype <> 'c'          -- not already ON UPDATE CASCADE
  LOOP
    -- A deferrable constraint puts its characteristics last, so the clause
    -- cannot simply be appended. Rare here; report rather than risk it.
    IF r.def ILIKE '%DEFERRABLE%' THEN
      INSERT INTO repair_log(step, detail)
      VALUES ('fk_skipped', r.child || '.' || r.conname || ' is DEFERRABLE - set ON UPDATE CASCADE by hand');
      CONTINUE;
    END IF;

    v_def := regexp_replace(r.def, '\s+ON UPDATE (NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT)', '', 'gi');
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.child, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s ON UPDATE CASCADE', r.child, r.conname, v_def);

    INSERT INTO repair_log(step, detail)
    VALUES ('fk_cascade', r.child || '.' || r.conname);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Id drift: re-key the public.users row onto the auth id
--    Only when the auth id has no row of its own, so nothing is overwritten.
--    The cascades from step 1 carry members, memberships, enrolments,
--    payments, audit rows and the rest along.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT a.id AS auth_id, u.id AS old_id, lower(trim(a.email)) AS email
      FROM auth.users   a
      JOIN public.users u ON lower(u.email) = lower(trim(a.email))
     WHERE a.email IS NOT NULL
       AND trim(a.email) <> ''
       AND u.id <> a.id
       AND NOT EXISTS (SELECT 1 FROM public.users x WHERE x.id = a.id)
  LOOP
    UPDATE public.users SET id = r.auth_id, updated_at = now() WHERE id = r.old_id;
    INSERT INTO repair_log(step, detail)
    VALUES ('rekeyed', r.email || ': ' || r.old_id || ' -> ' || r.auth_id);
  END LOOP;
END $$;

-- The case this script will NOT decide: the auth id already has its own row
-- AND a second row owns the email. Merging them is a judgement call about
-- which history to keep, so it is reported for a human.
INSERT INTO repair_log(step, detail)
SELECT 'conflict_manual',
       lower(trim(a.email)) || ': auth id ' || a.id || ' has its own row, but ' || u.id || ' also owns this email'
  FROM auth.users   a
  JOIN public.users u ON lower(u.email) = lower(trim(a.email))
 WHERE a.email IS NOT NULL
   AND trim(a.email) <> ''
   AND u.id <> a.id
   AND EXISTS (SELECT 1 FROM public.users x WHERE x.id = a.id);

-- ---------------------------------------------------------------------------
-- 3. A role of NULL locks the account out: current_app_role() returns NULL and
--    every is_admin()/RLS check fails. 'member' is the column default and the
--    least privilege available, so it is the safe repair. Roles already set
--    are left exactly as they are.
-- ---------------------------------------------------------------------------
WITH fixed AS (
  UPDATE public.users SET role = 'member', updated_at = now()
   WHERE role IS NULL
  RETURNING id
)
INSERT INTO repair_log(step, detail)
SELECT 'role_backfilled', count(*) || ' user(s) had no role; set to member' FROM fixed
HAVING count(*) > 0;

INSERT INTO repair_log(step, detail)
SELECT 'invalid_role', id || ' has role ' || role
  FROM public.users
 WHERE role IS NOT NULL
   AND role NOT IN ('member', 'trainer', 'admin', 'super_admin');

-- ---------------------------------------------------------------------------
-- 4. Backfill every auth user. _sync_user() is insert-only for missing rows
--    and never changes a role, so this is safe for existing accounts. One bad
--    row is logged and does not abort the rest.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r auth.users%ROWTYPE;
  v UUID;
  n INT := 0;
BEGIN
  FOR r IN SELECT * FROM auth.users LOOP
    BEGIN
      v := public._sync_user(r);
      IF v IS NOT NULL THEN n := n + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO repair_log(step, detail)
      VALUES ('sync_failed', COALESCE(r.email, r.id::TEXT) || ': ' || SQLERRM);
    END;
  END LOOP;
  INSERT INTO repair_log(step, detail) VALUES ('synced', n || ' auth user(s) now have a profile');
END $$;

-- ---------------------------------------------------------------------------
-- 5. Validate users_role_check, left NOT VALID by 001_security_hotfix.sql.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check' AND NOT convalidated)
     AND NOT EXISTS (SELECT 1 FROM public.users
                      WHERE role IS NOT NULL
                        AND role NOT IN ('member', 'trainer', 'admin', 'super_admin')) THEN
    ALTER TABLE public.users VALIDATE CONSTRAINT users_role_check;
    INSERT INTO repair_log(step, detail) VALUES ('constraint', 'users_role_check validated');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Duplicate members: REPORTED, NOT MERGED.
--    Merging means re-pointing every child FK and then choosing which rows to
--    drop where a unique index collides - that destroys data if it guesses
--    wrong, so it stays a human decision. The unique constraint is only added
--    once the table is genuinely clean.
-- ---------------------------------------------------------------------------
INSERT INTO repair_log(step, detail)
SELECT 'duplicate_members', user_id || ' has ' || count(*) || ' member rows - merge by hand'
  FROM public.members
 GROUP BY user_id
HAVING count(*) > 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_user_id_unique')
     AND NOT EXISTS (SELECT 1 FROM public.members GROUP BY user_id HAVING count(*) > 1) THEN
    ALTER TABLE public.members ADD CONSTRAINT members_user_id_unique UNIQUE (user_id);
    INSERT INTO repair_log(step, detail) VALUES ('constraint', 'members_user_id_unique added');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Close the sync issues that are now genuinely fixed.
-- ---------------------------------------------------------------------------
WITH closed AS (
  UPDATE public.auth_sync_issues s
     SET resolved_at = now()
   WHERE s.resolved_at IS NULL
     AND EXISTS (SELECT 1 FROM public.users   u WHERE u.id      = s.auth_user_id)
     AND EXISTS (SELECT 1 FROM public.members m WHERE m.user_id = s.auth_user_id)
  RETURNING id
)
INSERT INTO repair_log(step, detail)
SELECT 'issues_closed', count(*) || ' sync issue(s) resolved' FROM closed
HAVING count(*) > 0;

COMMIT;

-- ---------------------------------------------------------------------------
-- What it did. Anything listed as conflict_manual, duplicate_members,
-- invalid_role, fk_skipped or sync_failed still needs a person.
-- ---------------------------------------------------------------------------
INSERT INTO repair_log(step, detail)
SELECT 'remaining_unsynced', count(*) || ' auth user(s) still have no member row'
  FROM auth.users a
 WHERE a.email IS NOT NULL AND trim(a.email) <> ''
   AND NOT EXISTS (SELECT 1 FROM public.members m WHERE m.user_id = a.id)
HAVING count(*) > 0;

SELECT step, detail FROM repair_log ORDER BY at, step;
