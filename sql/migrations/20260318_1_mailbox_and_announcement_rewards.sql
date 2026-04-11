BEGIN;

-- 1) Announcement reward payload (mailbox claimable items).
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS reward_pencils integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_practice_notes integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'announcements_reward_pencils_non_negative'
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_reward_pencils_non_negative
      CHECK (reward_pencils >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'announcements_reward_practice_notes_non_negative'
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_reward_practice_notes_non_negative
      CHECK (reward_practice_notes >= 0);
  END IF;
END $$;

-- 2) Per-user mailbox read/claim state.
CREATE TABLE IF NOT EXISTS public.announcement_user_states (
  announcement_id bigint NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz,
  claimed_at timestamptz,
  claimed_pencils integer NOT NULL DEFAULT 0,
  claimed_practice_notes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcement_user_states_pkey PRIMARY KEY (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_user_states_user_id
  ON public.announcement_user_states (user_id, read_at, claimed_at, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_announcement_user_states_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_announcement_user_states_updated_at ON public.announcement_user_states;

CREATE TRIGGER trg_set_announcement_user_states_updated_at
BEFORE UPDATE ON public.announcement_user_states
FOR EACH ROW
EXECUTE FUNCTION public.set_announcement_user_states_updated_at();

ALTER TABLE public.announcement_user_states ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.announcement_user_states TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'announcement_user_states'
      AND policyname = 'Users can read own announcement states'
  ) THEN
    CREATE POLICY "Users can read own announcement states"
      ON public.announcement_user_states
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'announcement_user_states'
      AND policyname = 'Users can insert own announcement states'
  ) THEN
    CREATE POLICY "Users can insert own announcement states"
      ON public.announcement_user_states
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'announcement_user_states'
      AND policyname = 'Users can update own announcement states'
  ) THEN
    CREATE POLICY "Users can update own announcement states"
      ON public.announcement_user_states
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- 3) Claim announcement reward once, atomically.
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

  v_target_pencils := LEAST(5, v_old_pencils + GREATEST(0, COALESCE(v_announcement.reward_pencils, 0)));
  v_target_notes := LEAST(5, v_old_notes + GREATEST(0, COALESCE(v_announcement.reward_practice_notes, 0)));

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

-- 4) Lightweight unread indicator for home red-dot.
CREATE OR REPLACE FUNCTION public.get_mailbox_unread_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
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
  WHERE a.is_active = true
    AND a.starts_at <= now()
    AND (a.ends_at IS NULL OR a.ends_at >= now())
    AND s.read_at IS NULL;

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mailbox_unread_count() TO authenticated;

COMMIT;
