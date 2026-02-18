CREATE TABLE IF NOT EXISTS public.guest_device_signups (
    device_id text PRIMARY KEY,
    window_start timestamptz NOT NULL DEFAULT now(),
    signup_count integer NOT NULL DEFAULT 0,
    last_guest_signup_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.register_guest_signup(
    p_device_id text,
    p_limit integer DEFAULT 2,
    p_window interval DEFAULT interval '24 hours'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_row public.guest_device_signups%ROWTYPE;
BEGIN
    IF p_device_id IS NULL OR btrim(p_device_id) = '' THEN
        RAISE EXCEPTION 'device id required';
    END IF;

    SELECT * INTO v_row
    FROM public.guest_device_signups
    WHERE device_id = btrim(p_device_id)
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.guest_device_signups (device_id, window_start, signup_count, last_guest_signup_at)
        VALUES (btrim(p_device_id), now(), 1, now());
        RETURN;
    END IF;

    IF now() - v_row.window_start >= p_window THEN
        UPDATE public.guest_device_signups
        SET window_start = now(),
            signup_count = 1,
            last_guest_signup_at = now()
        WHERE device_id = btrim(p_device_id);
        RETURN;
    END IF;

    IF v_row.signup_count >= p_limit THEN
        RAISE EXCEPTION 'guest signup limit exceeded';
    END IF;

    UPDATE public.guest_device_signups
    SET signup_count = signup_count + 1,
        last_guest_signup_at = now()
    WHERE device_id = btrim(p_device_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_stale_guest_accounts(p_inactive_days integer DEFAULT 7)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_deleted_count integer := 0;
BEGIN
    IF p_inactive_days < 1 THEN
        RAISE EXCEPTION 'p_inactive_days must be at least 1';
    END IF;

    WITH stale_guests AS (
        SELECT u.id
        FROM auth.users u
        JOIN public.profiles p ON p.id = u.id
        WHERE u.is_anonymous = true
          AND COALESCE(p.last_seen, p.created_at, u.last_sign_in_at, u.created_at) < (now() - make_interval(days => p_inactive_days))
          AND NOT EXISTS (
              SELECT 1
              FROM auth.identities i
              WHERE i.user_id = u.id
                AND i.provider IN ('google', 'apple')
          )
    )
    DELETE FROM auth.users u
    USING stale_guests sg
    WHERE u.id = sg.id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$;

DO $$
BEGIN
    BEGIN
        PERFORM cron.unschedule('cleanup_stale_guest_accounts_daily');
    EXCEPTION
        WHEN OTHERS THEN
            -- Ignore when job does not exist yet
            NULL;
    END;

    PERFORM cron.schedule(
        'cleanup_stale_guest_accounts_daily',
        '17 3 * * *',
        $job$SELECT public.cleanup_stale_guest_accounts(7);$job$
    );
EXCEPTION
    WHEN undefined_table OR invalid_schema_name THEN
        RAISE NOTICE 'pg_cron not available, skip scheduling cleanup_stale_guest_accounts_daily';
END;
$$;
