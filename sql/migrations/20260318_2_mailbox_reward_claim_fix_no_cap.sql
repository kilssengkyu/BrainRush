BEGIN;

CREATE OR REPLACE FUNCTION public.claim_announcement_reward(p_announcement_id bigint)
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO v_announcement
  FROM public.announcements
  WHERE id = p_announcement_id
    AND is_active = true
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at >= now());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Announcement not available';
  END IF;

  IF COALESCE(v_announcement.reward_pencils, 0) <= 0
     AND COALESCE(v_announcement.reward_practice_notes, 0) <= 0 THEN
    RAISE EXCEPTION 'No claimable reward';
  END IF;

  INSERT INTO public.announcement_user_states (announcement_id, user_id, read_at)
  VALUES (p_announcement_id, v_uid, now())
  ON CONFLICT (announcement_id, user_id) DO NOTHING;

  SELECT *
  INTO v_state
  FROM public.announcement_user_states
  WHERE announcement_id = p_announcement_id
    AND user_id = v_uid
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
    AND user_id = v_uid;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_announcement_reward(bigint) TO authenticated;

COMMIT;
