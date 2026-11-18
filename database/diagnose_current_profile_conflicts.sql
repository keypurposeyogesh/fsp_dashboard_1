-- Read-only. Run in Supabase SQL Editor and share the result rows.
-- No account, role, membership, task, or point data is changed.
SELECT
  a.id AS current_login_id,
  p.id AS saved_profile_id,
  p.role AS saved_role,
  p.is_active AS saved_profile_active,
  EXISTS(SELECT 1 FROM auth.users old_login WHERE old_login.id=p.id)
    AS saved_profile_has_login,
  EXISTS(SELECT 1 FROM public.users current_profile WHERE current_profile.id=a.id)
    AS current_login_has_profile,
  (SELECT count(*) FROM public.members m WHERE m.user_id=p.id)
    AS saved_member_records
FROM auth.users a
JOIN public.users p
  ON lower(trim(p.email))=lower(trim(a.email)) AND p.id<>a.id
ORDER BY a.created_at DESC;
