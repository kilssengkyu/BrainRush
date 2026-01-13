CREATE OR REPLACE FUNCTION update_score(p_room_id uuid, p_player_id text, p_score int)
RETURNS void AS $$
DECLARE
    v_p1 text;
    v_p2 text;
BEGIN
    SELECT player1_id, player2_id INTO v_p1, v_p2
    FROM game_sessions WHERE id = p_room_id;

    IF v_p1 IS NULL THEN
        RAISE EXCEPTION 'Room not found or invalid permissions';
    END IF;

    IF p_player_id = v_p1 THEN
        UPDATE game_sessions SET player1_score = p_score WHERE id = p_room_id;
    ELSIF p_player_id = v_p2 THEN
        UPDATE game_sessions SET player2_score = p_score WHERE id = p_room_id;
    ELSE
        RAISE EXCEPTION 'Player ID % not found in room %', p_player_id, p_room_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
