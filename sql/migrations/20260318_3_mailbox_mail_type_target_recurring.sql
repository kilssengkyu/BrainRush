BEGIN;

-- 1) Extend announcements to support mailbox types/targets/recurrence.
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS mail_type text NOT NULL DEFAULT 'announcement',
  ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS target_user_id uuid NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_type text NULL,
  ADD COLUMN IF NOT EXISTS recurrence_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS daily_send_time time NOT NULL DEFAULT '00:00:00';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'announcements_mail_type_check'
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_mail_type_check
      CHECK (mail_type IN ('announcement', 'mail'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'announcements_target_type_check'
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_target_type_check
      CHECK (target_type IN ('all', 'user'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'announcements_recurrence_type_check'
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_recurrence_type_check
      CHECK (
        recurrence_type IS NULL
        OR recurrence_type IN ('daily')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_announcements_mailbox_filter
  ON public.announcements (is_active, mail_type, target_type, target_user_id, starts_at, ends_at, is_recurring, recurrence_until, daily_send_time);

-- 2) Per-occurrence state (supports daily recurring claim/read).
ALTER TABLE public.announcement_user_states
  ADD COLUMN IF NOT EXISTS occurrence_date date NOT NULL DEFAULT DATE '1970-01-01';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'announcement_user_states_pkey'
  ) THEN
    ALTER TABLE public.announcement_user_states DROP CONSTRAINT announcement_user_states_pkey;
  END IF;
END $$;

ALTER TABLE public.announcement_user_states
  ADD CONSTRAINT announcement_user_states_pkey PRIMARY KEY (announcement_id, user_id, occurrence_date);

CREATE INDEX IF NOT EXISTS idx_announcement_user_states_user_occ
  ON public.announcement_user_states (user_id, occurrence_date, read_at, claimed_at, created_at DESC);

-- 3) Claim mailbox reward (one-time or daily occurrence).
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

-- Backward-compatible wrapper.
CREATE OR REPLACE FUNCTION public.claim_announcement_reward(p_announcement_id bigint)
RETURNS TABLE (pencils_added integer, practice_notes_added integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
    SELECT *
    FROM public.claim_announcement_reward(p_announcement_id, NULL::date);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_announcement_reward(bigint, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_announcement_reward(bigint) TO authenticated;

-- 4) Unread count (includes recurring daily occurrence).
CREATE OR REPLACE FUNCTION public.get_mailbox_unread_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now_kst timestamp without time zone := (now() AT TIME ZONE 'Asia/Seoul');
  v_today_kst date := ((now() AT TIME ZONE 'Asia/Seoul')::date);
  v_current_time_kst time := ((now() AT TIME ZONE 'Asia/Seoul')::time);
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM public.announcements a
  LEFT JOIN public.announcement_user_states s
    ON s.announcement_id = a.id
   AND s.user_id = v_uid
   AND s.occurrence_date = CASE
     WHEN COALESCE(a.is_recurring, false) = true THEN v_today_kst
     ELSE DATE '1970-01-01'
   END
  WHERE a.is_active = true
    AND (
      a.target_type = 'all'
      OR (a.target_type = 'user' AND a.target_user_id = v_uid)
    )
    AND (
      (
        COALESCE(a.is_recurring, false) = false
        AND a.starts_at <= now()
        AND (a.ends_at IS NULL OR a.ends_at >= now())
      )
      OR
      (
        COALESCE(a.is_recurring, false) = true
        AND COALESCE(a.recurrence_type, '') = 'daily'
        AND v_today_kst >= (a.starts_at AT TIME ZONE 'Asia/Seoul')::date
        AND (a.recurrence_until IS NULL OR v_today_kst <= (a.recurrence_until AT TIME ZONE 'Asia/Seoul')::date)
        AND v_current_time_kst >= COALESCE(a.daily_send_time, time '00:00:00')
      )
    )
    AND s.read_at IS NULL;

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mailbox_unread_count() TO authenticated;

COMMIT;
