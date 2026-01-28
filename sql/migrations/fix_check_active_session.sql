-- Migration: fix_check_active_session.sql
-- Restores robust check_active_session to prevent ghost/solo matches

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
          (gs.status != 'waiting' AND gs.created_at > (now() - interval '1 hour'))
      )
    ORDER BY gs.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
