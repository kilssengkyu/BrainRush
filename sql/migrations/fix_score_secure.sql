-- Secure update_score: Block updates if game is finished
CREATE OR REPLACE FUNCTION update_score(p_room_id uuid, p_player_id text, p_score int)
RETURNS void AS $$
DECLARE
    v_p1 text;
    v_p2 text;
    v_status text;
BEGIN
    SELECT player1_id, player2_id, status 
    INTO v_p1, v_p2, v_status
    FROM game_sessions WHERE id = p_room_id;

    IF v_p1 IS NULL THEN
        RAISE EXCEPTION 'Room not found';
    END IF;

    -- CRITICAL CHECK: Do not allow score updates if game is finished
    -- This prevents race conditions where a late packet overwrites the Total Score
    IF v_status = 'finished' THEN
        RETURN;
    END IF;

    IF p_player_id = v_p1 THEN
        UPDATE game_sessions SET player1_score = p_score WHERE id = p_room_id;
    ELSIF p_player_id = v_p2 THEN
        UPDATE game_sessions SET player2_score = p_score WHERE id = p_room_id;
    ELSE
        -- Allow silent fail or raise exception. Exception is better for debugging.
        RAISE EXCEPTION 'Player ID % not found in room %', p_player_id, p_room_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
