-- Migration: expire_stale_sessions.sql
-- Shorten reconnection window and auto-clean stale sessions.

-- 1) Shorten active-session window to 5 minutes (non-waiting)
CREATE OR REPLACE FUNCTION check_active_session(p_player_id text)
RETURNS TABLE (
    room_id uuid,
    opponent_id text,
    status text,
    created_at timestamptz
) AS $$
BEGIN
    -- If UUID, enforce ownership for authenticated users
    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
        IF auth.uid() IS NOT NULL AND p_player_id != auth.uid()::text THEN
            RAISE EXCEPTION 'Not authorized';
        END IF;
    END IF;

    -- Return only recent, non-finished sessions with valid opponent
    RETURN QUERY
    SELECT
        gs.id as room_id,
        CASE
            WHEN gs.player1_id = p_player_id THEN gs.player2_id
            ELSE gs.player1_id
        END as opponent_id,
        gs.status,
        gs.created_at
    FROM game_sessions gs
    WHERE (gs.player1_id = p_player_id OR gs.player2_id = p_player_id)
      AND gs.status != 'finished'
      AND gs.player1_id IS NOT NULL
      AND gs.player2_id IS NOT NULL
      AND gs.mode IS DISTINCT FROM 'practice'
      AND (
          (gs.status = 'waiting' AND gs.created_at > (now() - interval '60 seconds'))
          OR
          (gs.status != 'waiting' AND gs.created_at > (now() - interval '5 minutes'))
      )
    ORDER BY gs.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2) Cleanup stale sessions (wait > 60s, active > 5m)
CREATE OR REPLACE FUNCTION cleanup_stale_game_sessions()
RETURNS void AS $$
BEGIN
    UPDATE game_sessions
    SET status = 'finished',
        phase_end_at = now(),
        end_at = now()
    WHERE status IN ('countdown', 'playing', 'round_end')
      AND created_at < now() - interval '5 minutes';

    UPDATE game_sessions
    SET status = 'finished',
        phase_end_at = now(),
        end_at = now()
    WHERE status = 'waiting'
      AND created_at < now() - interval '60 seconds';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3) Schedule cleanup job if pg_cron is available
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_stale_game_sessions') THEN
            PERFORM cron.schedule(
                'cleanup_stale_game_sessions',
                '*/5 * * * *',
                'select public.cleanup_stale_game_sessions();'
            );
        END IF;
    END IF;
END;
$$;

-- 4) Run once immediately
SELECT public.cleanup_stale_game_sessions();
