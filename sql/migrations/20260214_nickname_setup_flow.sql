-- Force first-time nickname setup flow on Home screen.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS needs_nickname_setup boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nickname_set_at timestamp with time zone;

-- Backfill existing auto-generated nicknames so they must pick a real nickname.
UPDATE public.profiles
SET needs_nickname_setup = true
WHERE nickname IS NULL
   OR nickname ~* '^player_[0-9]{4}$';

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
AS $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, nickname, needs_nickname_setup)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    'Player_' || floor(random() * 9000 + 1000)::text,
    true
  );
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.set_initial_nickname(p_nickname text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_nickname text;
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

  UPDATE public.profiles
  SET nickname = v_nickname,
      needs_nickname_setup = false,
      nickname_set_at = now()
  WHERE id = v_user_id
    AND needs_nickname_setup = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nickname setup already completed';
  END IF;
END;
$$;
