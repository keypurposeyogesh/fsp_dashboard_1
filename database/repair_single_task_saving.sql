-- Repair the missing single-explanation save function.
-- Run the WHOLE file as postgres in Supabase SQL Editor.
-- Existing completions, points, and reflections are preserved.
BEGIN;
-- Requires 022. Completion + reflection is one transaction. Existing history
-- stays intact and is never automatically published to the community.

CREATE TABLE IF NOT EXISTS public.challenge_task_reflections (
  id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  enrollment_id uuid NOT NULL,
  task_id uuid NOT NULL,
  reflection text NOT NULL CHECK(char_length(btrim(reflection)) BETWEEN 20 AND 2000),
  learning text NOT NULL CHECK(char_length(btrim(learning)) BETWEEN 20 AND 2000),
  shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(enrollment_id,task_id),
  FOREIGN KEY(enrollment_id,task_id) REFERENCES public.offering_task_completions(enrollment_id,task_id)
);
CREATE INDEX IF NOT EXISTS challenge_reflections_feed ON public.challenge_task_reflections(created_at DESC,id DESC) WHERE shared;
ALTER TABLE public.challenge_task_reflections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.challenge_task_reflections FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.complete_daily_task(p_enrollment_id uuid,p_task_id uuid,p_reflection text,p_learning text,p_share boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.offering_enrollments; next_task uuid; total integer; v_challenge boolean; v_post uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'Please sign in with an active account.' USING ERRCODE='42501';
  END IF;
  SELECT x.* INTO e FROM public.offering_enrollments x JOIN public.members m ON m.id=x.member_id
    WHERE x.id=p_enrollment_id AND m.user_id=auth.uid() FOR UPDATE OF x;
  IF NOT FOUND OR e.status<>'active' THEN RAISE EXCEPTION 'An active course enrollment is required.' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.offering_daily_tasks WHERE id=p_task_id AND offering_id=e.offering_id) THEN
    RAISE EXCEPTION 'Task not found for this course.' USING ERRCODE='22023';
  END IF;
  SELECT code='FSP-30DC' INTO v_challenge FROM public.offerings WHERE id=e.offering_id;
  IF NOT EXISTS(SELECT 1 FROM public.offering_task_completions WHERE enrollment_id=e.id AND task_id=p_task_id) THEN
    IF v_challenge AND (p_reflection IS NULL OR char_length(btrim(p_reflection)) NOT BETWEEN 20 AND 2000
      OR p_learning IS NULL OR char_length(btrim(p_learning)) NOT BETWEEN 20 AND 2000 OR p_share IS NULL) THEN
      RAISE EXCEPTION 'Write 20 to 2,000 characters for what you did and what you learned, and choose community visibility.' USING ERRCODE='22023';
    END IF;
    SELECT t.id INTO next_task FROM public.offering_daily_tasks t WHERE t.offering_id=e.offering_id
      AND NOT EXISTS(SELECT 1 FROM public.offering_task_completions c WHERE c.enrollment_id=e.id AND c.task_id=t.id)
      ORDER BY t.day_number LIMIT 1;
    IF next_task IS DISTINCT FROM p_task_id THEN RAISE EXCEPTION 'Complete the current task before moving to the next task.' USING ERRCODE='22023'; END IF;
    INSERT INTO public.offering_task_completions(enrollment_id,task_id) VALUES(e.id,p_task_id);
    IF v_challenge THEN
      INSERT INTO public.challenge_task_reflections(enrollment_id,task_id,reflection,learning,shared)
      VALUES(e.id,p_task_id,btrim(p_reflection),btrim(p_learning),p_share) RETURNING id INTO v_post;
    END IF;
    PERFORM public._audit('daily task completed','offering_enrollments',e.id,
      jsonb_build_object('task_id',p_task_id,'reflection_id',v_post,'shared',coalesce(p_share,false)));
  END IF;
  SELECT count(*) INTO total FROM public.offering_task_completions WHERE enrollment_id=e.id;
  RETURN jsonb_build_object('completed',total,'task_id',p_task_id);
END $$;
REVOKE ALL ON FUNCTION public.complete_daily_task(uuid,uuid,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_daily_task(uuid,uuid,text,text,boolean) TO authenticated;

-- Keep SDK compatibility for other courses, but prevent the old two-argument
-- call from bypassing mandatory reflections for NEW challenge completions.
CREATE OR REPLACE FUNCTION public.complete_daily_task(p_enrollment_id uuid,p_task_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT public.complete_daily_task(p_enrollment_id,p_task_id,NULL::text,NULL::text,false);
$$;
REVOKE ALL ON FUNCTION public.complete_daily_task(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_daily_task(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_challenge_community(p_limit integer DEFAULT 20,p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'Please sign in with an active account.' USING ERRCODE='42501';
  END IF;
  IF p_limit IS NULL OR p_limit<1 OR p_limit>50 OR (p_before IS NULL)<>(p_before_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid feed page.' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(posts) ORDER BY created_at DESC,post_id DESC),'[]'::jsonb) INTO v_result FROM (
    SELECT r.id AS post_id,coalesce(nullif(btrim(concat_ws(' ',m.first_name,m.last_name)),''),nullif(u.name,''),'FSP Member') AS author_name,
      t.day_number,t.title AS task_title,r.reflection,r.learning,r.created_at,
      (m.user_id=auth.uid() OR public.is_admin()) AS can_hide
    FROM public.challenge_task_reflections r
    JOIN public.offering_enrollments e ON e.id=r.enrollment_id AND e.status='active'
    JOIN public.offerings o ON o.id=e.offering_id AND o.code='FSP-30DC'
    JOIN public.members m ON m.id=e.member_id JOIN public.users u ON u.id=m.user_id AND u.is_active
    JOIN public.offering_daily_tasks t ON t.id=r.task_id AND t.offering_id=e.offering_id
    WHERE r.shared AND (p_before IS NULL OR (r.created_at,r.id)<(p_before,p_before_id))
    ORDER BY r.created_at DESC,r.id DESC LIMIT p_limit
  ) posts;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.get_challenge_community(integer,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_challenge_community(integer,timestamptz,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hide_challenge_reflection(p_post_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_enrollment uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'Please sign in with an active account.' USING ERRCODE='42501';
  END IF;
  SELECT r.enrollment_id INTO v_enrollment FROM public.challenge_task_reflections r
    JOIN public.offering_enrollments e ON e.id=r.enrollment_id JOIN public.members m ON m.id=e.member_id
    WHERE r.id=p_post_id AND (m.user_id=auth.uid() OR public.is_admin()) FOR UPDATE OF r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reflection not found or not yours to hide.' USING ERRCODE='42501'; END IF;
  UPDATE public.challenge_task_reflections SET shared=false WHERE id=p_post_id;
  PERFORM public._audit('challenge reflection hidden','offering_enrollments',v_enrollment,jsonb_build_object('post_id',p_post_id));
  RETURN jsonb_build_object('success',true);
END $$;
REVOKE ALL ON FUNCTION public.hide_challenge_reflection(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hide_challenge_reflection(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_task_reflections(p_enrollment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active) OR NOT EXISTS(
    SELECT 1 FROM public.offering_enrollments e JOIN public.members m ON m.id=e.member_id
    WHERE e.id=p_enrollment_id AND (m.user_id=auth.uid() OR public.is_admin())
  ) THEN RAISE EXCEPTION 'You cannot view these reflections.' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('task_id',r.task_id,'day_number',t.day_number,'task_title',t.title,'reflection',r.reflection,'learning',r.learning,'shared',r.shared,'created_at',r.created_at) ORDER BY r.created_at),'[]'::jsonb)
    INTO v_result FROM public.challenge_task_reflections r JOIN public.offering_daily_tasks t ON t.id=r.task_id WHERE r.enrollment_id=p_enrollment_id;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.get_task_reflections(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_task_reflections(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';

-- Requires 023. One task explanation; preserve earlier learning notes without
-- fabricating or duplicating content. Older five-argument clients still work.

ALTER TABLE public.challenge_task_reflections ALTER COLUMN learning DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.complete_daily_task(p_enrollment_id uuid,p_task_id uuid,p_reflection text,p_learning text,p_share boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.offering_enrollments; next_task uuid; total integer; v_challenge boolean; v_post uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'Please sign in with an active account.' USING ERRCODE='42501';
  END IF;
  SELECT x.* INTO e FROM public.offering_enrollments x JOIN public.members m ON m.id=x.member_id
    WHERE x.id=p_enrollment_id AND m.user_id=auth.uid() FOR UPDATE OF x;
  IF NOT FOUND OR e.status<>'active' THEN RAISE EXCEPTION 'An active course enrollment is required.' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.offering_daily_tasks WHERE id=p_task_id AND offering_id=e.offering_id) THEN
    RAISE EXCEPTION 'Task not found for this course.' USING ERRCODE='22023';
  END IF;
  SELECT code='FSP-30DC' INTO v_challenge FROM public.offerings WHERE id=e.offering_id;
  IF NOT EXISTS(SELECT 1 FROM public.offering_task_completions WHERE enrollment_id=e.id AND task_id=p_task_id) THEN
    IF v_challenge AND (p_reflection IS NULL OR char_length(btrim(p_reflection)) NOT BETWEEN 20 AND 2000
      OR (p_learning IS NOT NULL AND char_length(btrim(p_learning)) NOT BETWEEN 20 AND 2000) OR p_share IS NULL) THEN
      RAISE EXCEPTION 'Explain how you completed this task in 20 to 2,000 characters and choose community visibility.' USING ERRCODE='22023';
    END IF;
    SELECT t.id INTO next_task FROM public.offering_daily_tasks t WHERE t.offering_id=e.offering_id
      AND NOT EXISTS(SELECT 1 FROM public.offering_task_completions c WHERE c.enrollment_id=e.id AND c.task_id=t.id)
      ORDER BY t.day_number LIMIT 1;
    IF next_task IS DISTINCT FROM p_task_id THEN RAISE EXCEPTION 'Complete the current task before moving to the next task.' USING ERRCODE='22023'; END IF;
    INSERT INTO public.offering_task_completions(enrollment_id,task_id) VALUES(e.id,p_task_id);
    IF v_challenge THEN
      INSERT INTO public.challenge_task_reflections(enrollment_id,task_id,reflection,learning,shared)
      VALUES(e.id,p_task_id,btrim(p_reflection),btrim(p_learning),p_share) RETURNING id INTO v_post;
    END IF;
    PERFORM public._audit('daily task completed','offering_enrollments',e.id,
      jsonb_build_object('task_id',p_task_id,'reflection_id',v_post,'shared',coalesce(p_share,false)));
  END IF;
  SELECT count(*) INTO total FROM public.offering_task_completions WHERE enrollment_id=e.id;
  RETURN jsonb_build_object('completed',total,'task_id',p_task_id);
END $$;
REVOKE ALL ON FUNCTION public.complete_daily_task(uuid,uuid,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_daily_task(uuid,uuid,text,text,boolean) TO authenticated;


CREATE OR REPLACE FUNCTION public.complete_daily_task(p_enrollment_id uuid,p_task_id uuid,p_reflection text,p_share boolean)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT public.complete_daily_task(p_enrollment_id,p_task_id,p_reflection,NULL::text,p_share);
$$;
REVOKE ALL ON FUNCTION public.complete_daily_task(uuid,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_daily_task(uuid,uuid,text,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Confirm the signature the app needs now exists.
SELECT to_regprocedure('public.complete_daily_task(uuid,uuid,text,boolean)') AS task_save_function;
