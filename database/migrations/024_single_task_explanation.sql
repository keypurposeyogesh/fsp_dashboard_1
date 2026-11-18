-- Requires 023. One task explanation; preserve earlier learning notes without
-- fabricating or duplicating content. Older five-argument clients still work.
BEGIN;
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
COMMIT;
