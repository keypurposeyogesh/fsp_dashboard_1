-- ===========================================================================
-- 003_data_repair.PREVIEW.sql  -  READ ONLY. Changes nothing.
--
-- Run this in the Supabase SQL editor BEFORE 003_data_repair.sql and read the
-- output. Every row it returns is something the repair would do or refuse to
-- do. If section B is empty, there is no drift to fix and the error you are
-- seeing has a different cause.
-- ===========================================================================

-- A. Accounts that cannot load a profile right now -------------------------
SELECT 'A. broken account' AS section,
       a.id               AS auth_id,
       a.email,
       (u.id IS NOT NULL) AS has_users_row,
       u.role,
       EXISTS (SELECT 1 FROM public.members m WHERE m.user_id = a.id) AS has_member_row
  FROM auth.users a
  LEFT JOIN public.users u ON u.id = a.id
 WHERE a.email IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.members m WHERE m.user_id = a.id)
 ORDER BY a.email;

-- B. Drift the repair WILL fix automatically (step 2) ----------------------
--    The email is owned by a different public.users id, and the auth id has
--    no row of its own, so the old row can simply be re-keyed.
SELECT 'B. will be re-keyed' AS section,
       lower(trim(a.email)) AS email,
       u.id                 AS current_users_id,
       a.id                 AS will_become,
       u.role,
       (SELECT count(*) FROM public.members m WHERE m.user_id = u.id) AS member_rows_carried
  FROM auth.users   a
  JOIN public.users u ON lower(u.email) = lower(trim(a.email))
 WHERE a.email IS NOT NULL AND trim(a.email) <> ''
   AND u.id <> a.id
   AND NOT EXISTS (SELECT 1 FROM public.users x WHERE x.id = a.id);

-- C. Drift the repair will NOT touch - needs a human decision --------------
--    Two rows, both real: the auth id already has its own row and a second
--    row owns the email. Someone must choose which history survives.
SELECT 'C. manual merge needed' AS section,
       lower(trim(a.email)) AS email,
       a.id                 AS auth_id_row,
       u.id                 AS other_row_with_same_email,
       u.role               AS other_row_role
  FROM auth.users   a
  JOIN public.users u ON lower(u.email) = lower(trim(a.email))
 WHERE a.email IS NOT NULL AND trim(a.email) <> ''
   AND u.id <> a.id
   AND EXISTS (SELECT 1 FROM public.users x WHERE x.id = a.id);

-- D. The logged reasons ----------------------------------------------------
SELECT 'D. open sync issues' AS section, auth_user_id, email, issue, detail, created_at
  FROM public.auth_sync_issues
 WHERE resolved_at IS NULL
 ORDER BY created_at DESC;

-- E. Other things the repair reports --------------------------------------
SELECT 'E. users with no role' AS section, count(*) AS n FROM public.users WHERE role IS NULL
UNION ALL
SELECT 'E. users with invalid role', count(*) FROM public.users
 WHERE role IS NOT NULL AND role NOT IN ('member','trainer','admin','super_admin')
UNION ALL
SELECT 'E. user_ids with duplicate member rows',
       count(*) FROM (SELECT user_id FROM public.members GROUP BY user_id HAVING count(*) > 1) d
UNION ALL
SELECT 'E. FKs to users(id) still lacking ON UPDATE CASCADE', count(*)
  FROM pg_constraint c
  JOIN pg_class rt     ON rt.oid = c.confrelid
  JOIN pg_namespace rn ON rn.oid = rt.relnamespace
 WHERE c.contype = 'f' AND rn.nspname = 'public'
   AND rt.relname = 'users' AND c.confupdtype <> 'c';
