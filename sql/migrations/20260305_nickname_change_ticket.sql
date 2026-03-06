ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nickname_change_tickets integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.nickname_change_tickets IS 'Nickname change tickets that bypass the 30-day cooldown';

CREATE OR REPLACE FUNCTION public.grant_nickname_change_tickets(user_id uuid, amount integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF user_id != auth.uid() THEN
    RAISE EXCEPTION 'Cannot grant nickname change tickets for another user';
  END IF;

  IF amount IS NULL OR amount <= 0 OR amount > 1000 THEN
    RAISE EXCEPTION 'Invalid nickname change ticket amount';
  END IF;

  UPDATE public.profiles
  SET nickname_change_tickets = COALESCE(nickname_change_tickets, 0) + amount
  WHERE id = user_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_profile(p_nickname text, p_country text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_nickname text;
  v_current_nickname text;
  v_last_nickname_set_at timestamptz;
  v_needs_nickname_setup boolean;
  v_nickname_change_tickets integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_nickname := btrim(coalesce(p_nickname, ''));

  IF char_length(v_nickname) < 2 OR char_length(v_nickname) > 20 THEN
    RAISE EXCEPTION 'Nickname must be between 2 and 20 characters';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id <> v_user_id
      AND p.nickname IS NOT NULL
      AND lower(p.nickname) = lower(v_nickname)
  ) THEN
    RAISE EXCEPTION 'Nickname already in use';
  END IF;

  SELECT
    p.nickname,
    p.nickname_set_at,
    p.needs_nickname_setup,
    COALESCE(p.nickname_change_tickets, 0)
  INTO
    v_current_nickname,
    v_last_nickname_set_at,
    v_needs_nickname_setup,
    v_nickname_change_tickets
  FROM public.profiles p
  WHERE p.id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF lower(COALESCE(v_current_nickname, '')) <> lower(v_nickname) THEN
    IF NOT v_needs_nickname_setup
      AND v_last_nickname_set_at IS NOT NULL
      AND v_last_nickname_set_at > (now() - interval '30 days')
    THEN
      IF v_nickname_change_tickets <= 0 THEN
        RAISE EXCEPTION 'Nickname can be changed once every 30 days or with a ticket';
      END IF;

      UPDATE public.profiles
      SET nickname = v_nickname,
          country = p_country,
          needs_nickname_setup = false,
          nickname_set_at = now(),
          nickname_change_tickets = GREATEST(COALESCE(nickname_change_tickets, 0) - 1, 0)
      WHERE id = v_user_id;
      RETURN;
    END IF;

    UPDATE public.profiles
    SET nickname = v_nickname,
        country = p_country,
        needs_nickname_setup = false,
        nickname_set_at = now()
    WHERE id = v_user_id;
    RETURN;
  END IF;

  UPDATE public.profiles
  SET country = p_country
  WHERE id = v_user_id;
END;
$$;
