-- 1. Add ready status columns to game_sessions
ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS player1_ready boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS player2_ready boolean DEFAULT false;

-- 2. Create RPC to set player ready
CREATE OR REPLACE FUNCTION set_player_ready(p_room_id uuid, p_player_id text)
RETURNS void AS $$
DECLARE
    v_p1 text;
    v_p2 text;
BEGIN
    SELECT player1_id, player2_id INTO v_p1, v_p2
    FROM game_sessions
    WHERE id = p_room_id;

    IF v_p1 = p_player_id THEN
        UPDATE game_sessions SET player1_ready = true WHERE id = p_room_id;
    ELSIF v_p2 = p_player_id THEN
        UPDATE game_sessions SET player2_ready = true WHERE id = p_room_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 3. Clean up stale sessions (Optional but recommended)
-- Delete any sessions older than 10 minutes that are not finished
DELETE FROM game_sessions
WHERE status != 'finished'
AND created_at < NOW() - INTERVAL '10 minutes';
