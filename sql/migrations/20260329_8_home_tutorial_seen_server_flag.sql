-- Persist home tutorial completion at account level so reinstall does not re-show it.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS home_tutorial_seen_at timestamptz;

CREATE OR REPLACE FUNCTION public.mark_home_tutorial_seen()
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

    UPDATE public.profiles
    SET home_tutorial_seen_at = COALESCE(home_tutorial_seen_at, now())
    WHERE id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_home_tutorial_seen() TO authenticated;
