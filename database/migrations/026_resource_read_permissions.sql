-- Restore API SELECT privileges for the resource library and its course join.
-- Existing row policies remain authoritative; no content or write grants change.
BEGIN;
DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['resources','courses'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=v_table AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'Missing table or RLS protection: public.%. Apply the base schema first.',v_table;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_table
        AND permissive='PERMISSIVE' AND cmd IN ('SELECT','ALL')
    ) THEN
      RAISE EXCEPTION 'Missing read policy for public.%. Apply the base RLS policies first.',v_table;
    END IF;
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.resources,public.courses TO authenticated;

-- A disabled or missing trusted profile must not gain library access merely
-- because its JWT still has the authenticated role.
DROP POLICY IF EXISTS resource_active_account ON public.resources;
CREATE POLICY resource_active_account ON public.resources AS RESTRICTIVE
  FOR SELECT TO authenticated USING (public.current_app_role() IS NOT NULL);
DROP POLICY IF EXISTS course_active_account ON public.courses;
CREATE POLICY course_active_account ON public.courses AS RESTRICTIVE
  FOR SELECT TO authenticated USING (public.current_app_role() IS NOT NULL);

NOTIFY pgrst,'reload schema';
COMMIT;
