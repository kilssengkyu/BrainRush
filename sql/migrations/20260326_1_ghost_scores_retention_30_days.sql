-- Extend ghost score retention from 7 days to 30 days.
-- Daily cleanup schedule remains UTC 00:00.

CREATE OR REPLACE FUNCTION public.cleanup_stale_ghost_scores(p_inactive_days integer DEFAULT 30)
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

    DELETE FROM public.ghost_scores gs
    WHERE gs.created_at < (now() - make_interval(days => p_inactive_days));

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$;

DO $$
BEGIN
    BEGIN
        PERFORM cron.unschedule('cleanup_stale_ghost_scores_daily');
    EXCEPTION
        WHEN OTHERS THEN
            NULL;
    END;

    PERFORM cron.schedule(
        'cleanup_stale_ghost_scores_daily',
        '0 0 * * *',
        $job$SELECT public.cleanup_stale_ghost_scores(30);$job$
    );
EXCEPTION
    WHEN undefined_table OR invalid_schema_name THEN
        RAISE NOTICE 'pg_cron not available, skip scheduling cleanup_stale_ghost_scores_daily';
END;
$$;
