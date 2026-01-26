-- FIX: Consolidated fix for RPCs and Mode column.

-- 1. Ensure mode column exists
ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS mode text DEFAULT 'rank';

ALTER TABLE matchmaking_queue 
ADD COLUMN IF NOT EXISTS mode text DEFAULT 'rank';

-- 2. Recreate check_active_session (Fixes potential 400 error)
DROP FUNCTION IF EXISTS check_active_session(text);

CREATE OR REPLACE FUNCTION check_active_session(p_player_id text)
RETURNS TABLE (
    room_id uuid,
    opponent_id text,
    status text,
    created_at timestamptz
) AS $$
BEGIN
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
      AND (
          (gs.status = 'waiting' AND gs.created_at > (now() - interval '60 seconds'))
          OR
          (gs.status != 'waiting' AND gs.created_at > (now() - interval '1 hour'))
      )
    ORDER BY gs.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Recreate find_match (Updates to use mode column)
DROP FUNCTION IF EXISTS find_match(int, int, text, text);

CREATE OR REPLACE FUNCTION find_match(
    p_min_mmr int,
    p_max_mmr int,
    p_player_id text,
    p_mode text DEFAULT 'rank'
)
RETURNS uuid AS $$
DECLARE
    v_opponent_id text;
    v_room_id uuid;
BEGIN
    -- A. Cleanup Stale Entries
    DELETE FROM matchmaking_queue 
    WHERE updated_at < (now() - interval '60 seconds');

    -- B. Find Opponent
    SELECT player_id INTO v_opponent_id
    FROM matchmaking_queue
    WHERE player_id != p_player_id
      AND mmr BETWEEN p_min_mmr AND p_max_mmr
      AND mode = p_mode
      AND updated_at > (now() - interval '30 seconds')
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    -- C. Match Found?
    IF v_opponent_id IS NOT NULL THEN
        INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode)
        VALUES (p_player_id, v_opponent_id, 'waiting', 0, p_mode)
        RETURNING id INTO v_room_id;

        DELETE FROM matchmaking_queue WHERE player_id IN (p_player_id, v_opponent_id);
        RETURN v_room_id;
    END IF;

    -- D. No match -> Upsert Self
    INSERT INTO matchmaking_queue (player_id, mmr, mode, updated_at)
    VALUES (p_player_id, (p_min_mmr + p_max_mmr) / 2, p_mode, now())
    ON CONFLICT (player_id) 
    DO UPDATE SET 
        mmr = EXCLUDED.mmr,
        mode = EXCLUDED.mode,
        updated_at = now();

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
