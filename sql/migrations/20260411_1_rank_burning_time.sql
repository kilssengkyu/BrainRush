-- Rank burning time:
-- Rank matches do not consume pencils during the player's local 11:00-14:00 and 18:00-21:00 windows.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS timezone text;

CREATE OR REPLACE FUNCTION public.set_my_timezone(p_timezone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    IF p_timezone IS NULL
        OR p_timezone = ''
        OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone)
    THEN
        RAISE EXCEPTION 'Invalid timezone';
    END IF;

    UPDATE public.profiles
    SET timezone = p_timezone
    WHERE id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_rank_burning_time_status(p_player_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_timezone text := 'Asia/Seoul';
    v_local_time time;
    v_window_label text := null;
BEGIN
    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
        SELECT COALESCE(NULLIF(p.timezone, ''), 'Asia/Seoul')
        INTO v_timezone
        FROM public.profiles p
        WHERE p.id = p_player_id::uuid;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_timezone) THEN
        v_timezone := 'Asia/Seoul';
    END IF;

    v_local_time := (now() AT TIME ZONE v_timezone)::time;

    IF v_local_time >= time '11:00' AND v_local_time < time '14:00' THEN
        v_window_label := '11-14';
    ELSIF v_local_time >= time '18:00' AND v_local_time < time '21:00' THEN
        v_window_label := '18-21';
    END IF;

    RETURN jsonb_build_object(
        'is_active', v_window_label IS NOT NULL,
        'window_label', v_window_label,
        'timezone', v_timezone
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_rank_burning_time(p_player_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN COALESCE((public.get_rank_burning_time_status(p_player_id)->>'is_active')::boolean, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_match_pencil(user_id uuid, p_mode text DEFAULT 'normal')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    current_pencils integer;
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot consume pencil of another user';
    END IF;

    IF p_mode = 'rank' AND public.is_rank_burning_time(user_id::text) THEN
        RETURN true;
    END IF;

    SELECT p.pencils
    INTO current_pencils
    FROM public.profiles p
    WHERE p.id = user_id;

    IF current_pencils > 0 THEN
        UPDATE public.profiles
        SET pencils = pencils - 1,
            last_recharge_at = CASE WHEN pencils = 5 THEN now() ELSE last_recharge_at END
        WHERE id = user_id;

        RETURN true;
    END IF;

    RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_timezone(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_rank_burning_time_status(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_rank_burning_time(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_match_pencil(uuid, text) TO anon, authenticated, service_role;
