-- Course catalog: no checkout. Members request access; admins approve.
-- Existing active enrollments and historical payment records are preserved.
BEGIN;
ALTER TABLE public.offering_enrollments DROP CONSTRAINT IF EXISTS offering_enrollments_status_check;
ALTER TABLE public.offering_enrollments ADD CONSTRAINT offering_enrollments_status_check CHECK(status IN ('pending_payment','payment_review','active','access_requested','access_denied'));

CREATE OR REPLACE FUNCTION public.request_course_access(p_offering_id uuid)
RETURNS public.offering_enrollments LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_member uuid; v_offer public.offerings; v_row public.offering_enrollments;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'Please sign in with an active account.' USING ERRCODE='42501';
  END IF;
  SELECT id INTO v_member FROM public.members WHERE user_id=auth.uid() ORDER BY created_at,id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Complete your member profile before requesting access.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_offer FROM public.offerings WHERE id=p_offering_id AND kind='course' AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This course is not available.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_row FROM public.offering_enrollments WHERE member_id=v_member AND offering_id=p_offering_id FOR UPDATE;
  IF FOUND AND v_row.status IN ('active','access_requested') THEN RETURN v_row; END IF;
  IF NOT v_offer.registration_open THEN RAISE EXCEPTION 'Access requests have not opened for this course.' USING ERRCODE='22023'; END IF;
  IF v_row.id IS NULL THEN
    INSERT INTO public.offering_enrollments(member_id,offering_id,amount,currency,status)
    VALUES(v_member,p_offering_id,0,v_offer.currency,'access_requested') RETURNING * INTO v_row;
  ELSE
    UPDATE public.offering_enrollments SET status='access_requested',review_note=NULL,reviewed_at=NULL,reviewed_by=NULL,updated_at=now()
    WHERE id=v_row.id RETURNING * INTO v_row;
  END IF;
  PERFORM public._audit('course access requested','offering_enrollments',v_row.id,jsonb_build_object('offering_id',p_offering_id));
  PERFORM public._notify_admins('Course access awaiting approval',v_offer.title || ': a member requested access.','system','/admin/courses');
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.request_course_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_course_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_course_access(p_enrollment_id uuid,p_approve boolean,p_note text DEFAULT '')
RETURNS public.offering_enrollments LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.offering_enrollments; v_user uuid;
BEGIN
  IF NOT coalesce(public.is_admin(),false) OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'Administrator access required.' USING ERRCODE='42501';
  END IF;
  IF p_approve IS NULL OR char_length(coalesce(p_note,''))>1000 OR (NOT p_approve AND nullif(btrim(p_note),'') IS NULL) THEN
    RAISE EXCEPTION 'Provide a reason when declining access (up to 1,000 characters).' USING ERRCODE='22023';
  END IF;
  SELECT e.* INTO v_row FROM public.offering_enrollments e JOIN public.offerings o ON o.id=e.offering_id AND o.kind='course'
    WHERE e.id=p_enrollment_id AND e.status='access_requested' FOR UPDATE OF e;
  IF NOT FOUND THEN RAISE EXCEPTION 'This request is no longer awaiting approval. Refresh the list.' USING ERRCODE='22023'; END IF;
  UPDATE public.offering_enrollments SET status=CASE WHEN p_approve THEN 'active' ELSE 'access_denied' END,
    review_note=nullif(btrim(p_note),''),reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now()
    WHERE id=v_row.id RETURNING * INTO v_row;
  SELECT user_id INTO v_user FROM public.members WHERE id=v_row.member_id;
  PERFORM public._audit(CASE WHEN p_approve THEN 'course access approved' ELSE 'course access declined' END,
    'offering_enrollments',v_row.id,jsonb_build_object('note',p_note));
  PERFORM public._notify(v_user,'info',CASE WHEN p_approve THEN 'Course access approved' ELSE 'Course access declined' END,
    CASE WHEN p_approve THEN 'Your course access is active. You can start learning.' ELSE p_note END,'system','/courses');
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.review_course_access(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_course_access(uuid,boolean,text) TO authenticated;

-- Existing pending course records become approval requests. No prices, receipts,
-- references, active enrollments, memberships, or completion records are erased.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT e.id,e.status FROM public.offering_enrollments e JOIN public.offerings o ON o.id=e.offering_id
    WHERE o.kind='course' AND e.status IN ('pending_payment','payment_review') FOR UPDATE OF e LOOP
    UPDATE public.offering_enrollments SET status='access_requested',updated_at=now() WHERE id=r.id;
    PERFORM public._audit('course moved to access approval','offering_enrollments',r.id,jsonb_build_object('previous_status',r.status));
  END LOOP;
END $$;


-- Legacy clients cannot auto-activate free courses. Program registration is unchanged.
CREATE OR REPLACE FUNCTION public.enroll_offering(p_offering_id uuid)
RETURNS public.offering_enrollments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_member uuid;
  v_offer public.offerings%ROWTYPE;
  v_result public.offering_enrollments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'Please sign in with an active account.';
  END IF;
  SELECT id INTO v_member FROM public.members WHERE user_id = auth.uid();
  IF v_member IS NULL THEN RAISE EXCEPTION 'Complete your member profile before enrolling.'; END IF;
  SELECT * INTO v_offer FROM public.offerings WHERE id = p_offering_id AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This course or program is no longer available.'; END IF;
  IF v_offer.kind='course' THEN RETURN public.request_course_access(p_offering_id); END IF;
  SELECT * INTO v_result FROM public.offering_enrollments WHERE offering_id=p_offering_id AND member_id=v_member;
  IF FOUND THEN RETURN v_result; END IF;
  IF NOT v_offer.registration_open OR v_offer.start_date < (now() AT TIME ZONE 'Asia/Kolkata')::date
     OR (v_offer.start_date = (now() AT TIME ZONE 'Asia/Kolkata')::date AND v_offer.program_end_time IS NOT NULL
       AND v_offer.program_end_time <= (now() AT TIME ZONE 'Asia/Kolkata')::time) THEN
    RAISE EXCEPTION 'Registration is closed for this program.';
  END IF;
  INSERT INTO public.offering_enrollments(offering_id, member_id, amount, currency, status)
    VALUES (v_offer.id, v_member, v_offer.price, v_offer.currency,
            CASE WHEN v_offer.price = 0 THEN 'active' ELSE 'pending_payment' END)
    ON CONFLICT (member_id, offering_id) DO NOTHING RETURNING * INTO v_result;
  IF v_result.id IS NULL THEN
    SELECT * INTO v_result FROM public.offering_enrollments WHERE offering_id = p_offering_id AND member_id = v_member;
  ELSE
    PERFORM public._audit('offering enrolled', 'offering_enrollments', v_result.id,
      jsonb_build_object('offering_id', v_offer.id, 'amount', v_offer.price));
    PERFORM public._notify(auth.uid(), 'info', 'Enrollment saved',
      v_offer.title || CASE WHEN v_offer.price = 0 THEN ': registration confirmed.' ELSE ': payment is pending.' END,
      'system', '/courses');
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.enroll_offering(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.enroll_offering(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
