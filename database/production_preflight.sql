-- Run in Supabase SQL Editor BEFORE deciding whether the release can ship.
-- Read-only checks; this does not apply migrations or modify member records.
BEGIN TRANSACTION READ ONLY;

SELECT 'users_role_check_validated' AS check_name,
  EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.users'::regclass
    AND conname='users_role_check' AND convalidated) AS passed
UNION ALL
SELECT 'unique_member_user_id',
  EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.members'::regclass
    AND conname='members_user_id_unique')
UNION ALL
SELECT 'no_orphaned_auth_profiles',
  NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.email IS NOT NULL
    AND (NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=a.id)
      OR NOT EXISTS(SELECT 1 FROM public.members m WHERE m.user_id=a.id)))
UNION ALL
SELECT 'no_duplicate_member_profiles',
  NOT EXISTS(SELECT 1 FROM public.members GROUP BY user_id HAVING count(*)>1);

SELECT signature, to_regprocedure(signature) IS NOT NULL AS installed
FROM (VALUES
  ('public.get_challenge_rewards(uuid)'),
  ('public.redeem_challenge_points(uuid,integer,text,uuid)'),
  ('public.get_task_reflections(uuid)'),
  ('public.complete_daily_task(uuid,uuid,text,boolean)'),
  ('public.complete_daily_task(uuid,uuid,text,text,boolean)'),
  ('public.request_course_access(uuid)'),
  ('public.review_course_access(uuid,boolean,text)')
) AS expected(signature);

SELECT table_name,column_name,is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='challenge_task_reflections' AND column_name='learning';

SELECT c.relname,c.relrowsecurity AS rls_enabled,
  has_table_privilege('authenticated',c.oid,'SELECT') AS member_select_grant
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN (
  'users','members','resources','courses','offering_enrollments',
  'offering_task_completions','challenge_reward_windows','challenge_task_reflections'
);
-- Some private challenge tables intentionally expose data only through RPCs:
-- their direct SELECT grant may be false. Resources and courses need true.
SELECT tablename,policyname,permissive,roles,cmd,qual
FROM pg_policies WHERE schemaname='public' AND tablename IN ('resources','courses')
ORDER BY tablename,policyname;

SELECT pg_get_functiondef(to_regprocedure('public.complete_daily_task(uuid,uuid,text,boolean)'))
  AS single_explanation_wrapper;
SELECT pg_get_functiondef(to_regprocedure('public.complete_daily_task(uuid,uuid,text,text,boolean)'))
  AS completion_function;
-- Confirm the five-argument function allows a NULL learning note. Reapplying
-- migration 023 after 024 can restore the old validation even if both signatures exist.

COMMIT;
