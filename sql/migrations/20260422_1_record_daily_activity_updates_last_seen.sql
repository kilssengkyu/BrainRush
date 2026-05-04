-- Keep profiles.last_seen in sync with app launches / foreground resumes.
-- Home calls record_daily_activity() on initial entry, and the frontend now
-- reuses that RPC when the app becomes active again.

CREATE OR REPLACE FUNCTION public.record_daily_activity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    INSERT INTO public.user_daily_activity (user_id, activity_date, first_seen_at, last_seen_at, session_count, updated_at)
    VALUES (v_user_id, CURRENT_DATE, now(), now(), 1, now())
    ON CONFLICT (user_id, activity_date)
    DO UPDATE SET
      last_seen_at = now(),
      session_count = user_daily_activity.session_count + 1,
      updated_at = now();

    UPDATE public.profiles
    SET last_seen = now()
    WHERE id = v_user_id;
END;
$$;
