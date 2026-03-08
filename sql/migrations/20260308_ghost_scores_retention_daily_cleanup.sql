-- Ghost score retention cleanup:
-- - Delete ghost_scores older than 7 days.
-- - Run once daily (UTC 00:00) via pg_cron when available.

CREATE INDEX IF NOT EXISTS idx_ghost_scores_created_at
ON public.ghost_scores (created_at);

CREATE OR REPLACE FUNCTION public.cleanup_stale_ghost_scores(p_inactive_days integer DEFAULT 7)
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
            -- Ignore when job does not exist yet
            NULL;
    END;

    PERFORM cron.schedule(
        'cleanup_stale_ghost_scores_daily',
        '0 0 * * *',
        $job$SELECT public.cleanup_stale_ghost_scores(7);$job$
    );
EXCEPTION
    WHEN undefined_table OR invalid_schema_name THEN
        RAISE NOTICE 'pg_cron not available, skip scheduling cleanup_stale_ghost_scores_daily';
END;
$$;
