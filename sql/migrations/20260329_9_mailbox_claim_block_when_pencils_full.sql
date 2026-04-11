-- Block mailbox claim when the mail includes pencils and user already has full pencils (>= 5).

CREATE OR REPLACE FUNCTION public.claim_announcement_reward(p_announcement_id bigint, p_occurrence_date date DEFAULT NULL)
RETURNS TABLE (pencils_added integer, practice_notes_added integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_announcement record;
  v_state record;
  v_old_pencils integer;
  v_old_notes integer;
  v_target_pencils integer;
  v_target_notes integer;
  v_now_kst timestamp without time zone := (now() AT TIME ZONE 'Asia/Seoul');
  v_today_kst date := ((now() AT TIME ZONE 'Asia/Seoul')::date);
  v_current_time_kst time := ((now() AT TIME ZONE 'Asia/Seoul')::time);
  v_occurrence_date date := DATE '1970-01-01';
  v_start_date_kst date;
  v_until_date_kst date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO v_announcement
  FROM public.announcements a
  WHERE a.id = p_announcement_id
    AND a.is_active = true
    AND (
      a.target_type = 'all'
      OR (a.target_type = 'user' AND a.target_user_id = v_uid)
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Announcement not available';
  END IF;

  IF COALESCE(v_announcement.reward_pencils, 0) <= 0
     AND COALESCE(v_announcement.reward_practice_notes, 0) <= 0 THEN
    RAISE EXCEPTION 'No claimable reward';
  END IF;

  IF COALESCE(v_announcement.is_recurring, false) = true THEN
    IF COALESCE(v_announcement.recurrence_type, '') <> 'daily' THEN
      RAISE EXCEPTION 'Unsupported recurrence type';
    END IF;

    v_start_date_kst := (v_announcement.starts_at AT TIME ZONE 'Asia/Seoul')::date;
    v_until_date_kst := CASE WHEN v_announcement.recurrence_until IS NULL THEN NULL ELSE (v_announcement.recurrence_until AT TIME ZONE 'Asia/Seoul')::date END;

    IF v_today_kst < v_start_date_kst THEN
      RAISE EXCEPTION 'Announcement not available yet';
    END IF;

    IF v_until_date_kst IS NOT NULL AND v_today_kst > v_until_date_kst THEN
      RAISE EXCEPTION 'Announcement expired';
    END IF;

    IF v_current_time_kst < COALESCE(v_announcement.daily_send_time, time '00:00:00') THEN
      RAISE EXCEPTION 'Announcement not available yet';
    END IF;

    IF p_occurrence_date IS NOT NULL AND p_occurrence_date <> v_today_kst THEN
      RAISE EXCEPTION 'Invalid occurrence date';
    END IF;

    v_occurrence_date := v_today_kst;
  ELSE
    IF v_announcement.starts_at > now() THEN
      RAISE EXCEPTION 'Announcement not available yet';
    END IF;

    IF v_announcement.ends_at IS NOT NULL AND v_announcement.ends_at < now() THEN
      RAISE EXCEPTION 'Announcement expired';
    END IF;

    v_occurrence_date := DATE '1970-01-01';
  END IF;

  INSERT INTO public.announcement_user_states (announcement_id, user_id, occurrence_date, read_at)
  VALUES (p_announcement_id, v_uid, v_occurrence_date, now())
  ON CONFLICT (announcement_id, user_id, occurrence_date) DO NOTHING;

  SELECT *
  INTO v_state
  FROM public.announcement_user_states
  WHERE announcement_id = p_announcement_id
    AND user_id = v_uid
    AND occurrence_date = v_occurrence_date
  FOR UPDATE;

  IF v_state.claimed_at IS NOT NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  SELECT
    COALESCE(p.pencils, 0),
    COALESCE(p.practice_notes, 0)
  INTO v_old_pencils, v_old_notes
  FROM public.profiles p
  WHERE p.id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF COALESCE(v_announcement.reward_pencils, 0) > 0 AND v_old_pencils >= 5 THEN
    RAISE EXCEPTION 'Pencils are full';
  END IF;

  v_target_pencils := v_old_pencils + GREATEST(0, COALESCE(v_announcement.reward_pencils, 0));
  v_target_notes := v_old_notes + GREATEST(0, COALESCE(v_announcement.reward_practice_notes, 0));

  UPDATE public.profiles
  SET
    pencils = v_target_pencils,
    practice_notes = v_target_notes
  WHERE id = v_uid;

  pencils_added := GREATEST(0, v_target_pencils - v_old_pencils);
  practice_notes_added := GREATEST(0, v_target_notes - v_old_notes);

  UPDATE public.announcement_user_states
  SET
    claimed_at = now(),
    read_at = COALESCE(read_at, now()),
    claimed_pencils = pencils_added,
    claimed_practice_notes = practice_notes_added
  WHERE announcement_id = p_announcement_id
    AND user_id = v_uid
    AND occurrence_date = v_occurrence_date;

  RETURN NEXT;
END;
$$;
