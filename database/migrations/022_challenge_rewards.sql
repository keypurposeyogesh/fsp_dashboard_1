-- Requires 016. Thirty-task rewards, approval-based 40-day IST calendar,
-- and an append-only ledger for discounts applied manually by admins.
BEGIN;

CREATE TABLE IF NOT EXISTS public.challenge_reward_windows (
  enrollment_id uuid PRIMARY KEY REFERENCES public.offering_enrollments(id),
  started_at timestamptz NOT NULL,
  deadline_at timestamptz NOT NULL CHECK(deadline_at > started_at)
);
CREATE TABLE IF NOT EXISTS public.challenge_point_redemptions (
  id uuid PRIMARY KEY,
  enrollment_id uuid NOT NULL REFERENCES public.challenge_reward_windows(enrollment_id),
  points integer NOT NULL CHECK(points BETWEEN 1 AND 3000),
  note text NOT NULL CHECK(char_length(btrim(note)) BETWEEN 3 AND 1000),
  redeemed_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS challenge_discount_reference_unique
ON public.challenge_point_redemptions(enrollment_id,lower(btrim(note)));
ALTER TABLE public.challenge_reward_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_point_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.challenge_reward_windows, public.challenge_point_redemptions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_challenge_reward_window()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_start timestamptz;
BEGIN
  IF NEW.status = 'active' AND EXISTS(SELECT 1 FROM public.offerings WHERE id=NEW.offering_id AND code='FSP-30DC') THEN
    v_start := clock_timestamp();
    INSERT INTO public.challenge_reward_windows(enrollment_id,started_at,deadline_at)
    VALUES(NEW.id,v_start,(((v_start AT TIME ZONE 'Asia/Kolkata')::date + 40)::timestamp AT TIME ZONE 'Asia/Kolkata'))
    ON CONFLICT(enrollment_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.start_challenge_reward_window() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS start_challenge_reward_window ON public.offering_enrollments;
CREATE TRIGGER start_challenge_reward_window AFTER INSERT OR UPDATE OF status ON public.offering_enrollments
FOR EACH ROW EXECUTE FUNCTION public.start_challenge_reward_window();

-- Existing enrollments keep their actual approval time (free registrations use
-- their creation time). Re-running this migration never resets a deadline.
INSERT INTO public.challenge_reward_windows(enrollment_id,started_at,deadline_at)
SELECT e.id,coalesce(e.reviewed_at,e.created_at),
  (((coalesce(e.reviewed_at,e.created_at) AT TIME ZONE 'Asia/Kolkata')::date+40)::timestamp AT TIME ZONE 'Asia/Kolkata')
FROM public.offering_enrollments e JOIN public.offerings o ON o.id=e.offering_id
WHERE e.status='active' AND o.code='FSP-30DC'
ON CONFLICT(enrollment_id) DO NOTHING;

-- A pure, server-side calculation shared by display and redemption.
CREATE OR REPLACE FUNCTION public._challenge_reward_values(
  p_count integer,p_finished timestamptz,p_deadline timestamptz,p_now timestamptz,p_redeemed integer
) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT jsonb_build_object(
    'completed_tasks',least(30,greatest(0,p_count)),
    'earned_points',least(30,greatest(0,p_count))*100,
    'eligible_points',CASE WHEN p_count=30 AND p_finished IS NOT NULL THEN CASE WHEN p_finished<p_deadline THEN 3000 ELSE 1500 END ELSE 0 END,
    'redeemed_points',p_redeemed,
    'available_points',greatest(0,(CASE WHEN p_count=30 AND p_finished IS NOT NULL THEN CASE WHEN p_finished<p_deadline THEN 3000 ELSE 1500 END ELSE 0 END)-p_redeemed),
    'on_time',p_count=30 AND p_finished IS NOT NULL AND p_finished<p_deadline,
    'window_open',p_now<p_deadline,
    'completed_at',CASE WHEN p_count=30 THEN p_finished ELSE NULL END
  );
$$;
REVOKE ALL ON FUNCTION public._challenge_reward_values(integer,timestamptz,timestamptz,timestamptz,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_challenge_rewards(p_enrollment_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_now timestamptz:=clock_timestamp(); v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'Please sign in with an active account.' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('enrollment_id',e.id,'started_at',w.started_at,'deadline_at',w.deadline_at,
    'server_now',v_now,'completion_dates',c.dates,'redemptions',r.history) || public._challenge_reward_values(c.total,c.finished,w.deadline_at,v_now,r.total)), '[]'::jsonb)
  INTO v_result
  FROM public.challenge_reward_windows w
  JOIN public.offering_enrollments e ON e.id=w.enrollment_id
  JOIN public.members m ON m.id=e.member_id
  CROSS JOIN LATERAL (
    SELECT count(*)::integer AS total,max(x.completed_at) AS finished,
      coalesce(jsonb_agg(x.completed_at ORDER BY x.completed_at),'[]'::jsonb) AS dates
    FROM public.offering_task_completions x
    JOIN public.offering_daily_tasks t ON t.id=x.task_id AND t.offering_id=e.offering_id AND t.day_number BETWEEN 1 AND 30
    WHERE x.enrollment_id=e.id
  ) c
  CROSS JOIN LATERAL (SELECT coalesce(sum(points),0)::integer AS total,
    coalesce(jsonb_agg(jsonb_build_object('id',id,'points',points,'note',note,'created_at',created_at) ORDER BY created_at DESC),'[]'::jsonb) AS history
    FROM public.challenge_point_redemptions WHERE enrollment_id=e.id) r
  WHERE e.status='active' AND (m.user_id=auth.uid() OR public.is_admin())
    AND (p_enrollment_id IS NULL OR p_enrollment_id=e.id);
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.get_challenge_rewards(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_challenge_rewards(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_challenge_points(p_enrollment_id uuid,p_points integer,p_note text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_summary jsonb; v_old public.challenge_point_redemptions;
BEGIN
  IF NOT coalesce(public.is_admin(),false) OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'Administrator access required.' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL OR p_points IS NULL OR p_points<1 OR p_points>3000
    OR p_note IS NULL OR char_length(btrim(p_note)) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Enter valid points and a discount reference.' USING ERRCODE='22023'; END IF;
  -- Serialize deductions for one balance. Duplicate request IDs are idempotent.
  PERFORM 1 FROM public.challenge_reward_windows WHERE enrollment_id=p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Challenge reward not found.' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_old FROM public.challenge_point_redemptions WHERE id=p_request_id;
  IF FOUND THEN
    IF v_old.enrollment_id<>p_enrollment_id OR v_old.points<>p_points OR v_old.note<>btrim(p_note) THEN
      RAISE EXCEPTION 'This request reference was already used for another redemption.' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object('success',true,'id',v_old.id,'duplicate',true);
  END IF;
  SELECT * INTO v_old FROM public.challenge_point_redemptions
    WHERE enrollment_id=p_enrollment_id AND lower(btrim(note))=lower(btrim(p_note));
  IF FOUND THEN
    IF v_old.points<>p_points THEN RAISE EXCEPTION 'This discount reference was already recorded with different points.' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('success',true,'id',v_old.id,'duplicate',true);
  END IF;
  v_summary := public.get_challenge_rewards(p_enrollment_id)->0;
  IF v_summary IS NULL OR p_points>(v_summary->>'available_points')::integer THEN
    RAISE EXCEPTION 'Not enough redeemable points. Finish all 30 tasks first or refresh the balance.' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.challenge_point_redemptions(id,enrollment_id,points,note,redeemed_by)
  VALUES(p_request_id,p_enrollment_id,p_points,btrim(p_note),auth.uid());
  PERFORM public._audit('challenge discount recorded','offering_enrollments',p_enrollment_id,
    jsonb_build_object('redemption_id',p_request_id,'points',p_points,'reference',btrim(p_note)));
  RETURN jsonb_build_object('success',true,'id',p_request_id,'duplicate',false);
END $$;
REVOKE ALL ON FUNCTION public.redeem_challenge_points(uuid,integer,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.redeem_challenge_points(uuid,integer,text,uuid) TO authenticated;

-- Existing completion RPC already locks the enrollment and rejects skips/duplicates.
-- Freeze completed challenge task definitions so reward counts cannot change later.
CREATE OR REPLACE FUNCTION public.guard_reward_task_definition()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF (TG_OP='DELETE' OR NEW.offering_id IS DISTINCT FROM OLD.offering_id OR NEW.day_number IS DISTINCT FROM OLD.day_number OR NEW.id IS DISTINCT FROM OLD.id)
    AND EXISTS(SELECT 1 FROM public.offering_task_completions WHERE task_id=OLD.id)
    AND EXISTS(SELECT 1 FROM public.offerings WHERE id=OLD.offering_id AND code='FSP-30DC') THEN
    RAISE EXCEPTION 'Completed challenge tasks cannot be removed or renumbered.' USING ERRCODE='22023';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_reward_task_definition() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_reward_task_definition ON public.offering_daily_tasks;
CREATE TRIGGER guard_reward_task_definition BEFORE UPDATE OR DELETE ON public.offering_daily_tasks
FOR EACH ROW EXECUTE FUNCTION public.guard_reward_task_definition();
NOTIFY pgrst,'reload schema';
COMMIT;
