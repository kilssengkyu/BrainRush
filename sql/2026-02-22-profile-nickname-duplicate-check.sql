CREATE OR REPLACE FUNCTION public.update_my_profile(p_nickname text, p_country text DEFAULT NULL::text) RETURNS void
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
      country = p_country,
      needs_nickname_setup = false,
      nickname_set_at = CASE WHEN needs_nickname_setup THEN now() ELSE nickname_set_at END
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
END;
$$;
