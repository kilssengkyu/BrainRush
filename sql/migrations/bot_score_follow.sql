-- Bot score follows player score in normal matches
CREATE OR REPLACE FUNCTION update_score(p_room_id uuid, p_player_id text, p_score int)
RETURNS void AS $$
DECLARE
    v_p1 text;
    v_p2 text;
    v_status text;
    v_p1_points int;
    v_p2_points int;
    v_bot_target int;
BEGIN
    SELECT player1_id, player2_id, status, COALESCE(p1_current_score, 0), COALESCE(p2_current_score, 0)
    INTO v_p1, v_p2, v_status, v_p1_points, v_p2_points
    FROM game_sessions WHERE id = p_room_id;

    IF v_p1 IS NULL THEN
        RAISE EXCEPTION 'Room not found';
    END IF;

    IF v_status = 'finished' THEN
        RETURN;
    END IF;

    -- Security Check: Allow if p_player_id matches valid players in the room
    IF p_player_id != v_p1 AND p_player_id != v_p2 THEN
        IF auth.uid() IS NOT NULL AND auth.uid()::text != p_player_id THEN
            RAISE EXCEPTION 'Not authorized';
        END IF;
    END IF;

    IF p_player_id = v_p1 THEN
        UPDATE game_sessions SET p1_current_score = p_score WHERE id = p_room_id;

        IF v_p2 LIKE 'bot_%' THEN
            v_bot_target := GREATEST(0, LEAST(p_score - 20, floor(p_score * 0.9)));
            IF v_bot_target < v_p2_points THEN
                v_bot_target := v_p2_points;
            END IF;
            UPDATE game_sessions SET p2_current_score = v_bot_target WHERE id = p_room_id;
        END IF;
    ELSIF p_player_id = v_p2 THEN
        UPDATE game_sessions SET p2_current_score = p_score WHERE id = p_room_id;

        IF v_p1 LIKE 'bot_%' THEN
            v_bot_target := GREATEST(0, LEAST(p_score - 20, floor(p_score * 0.9)));
            IF v_bot_target < v_p1_points THEN
                v_bot_target := v_p1_points;
            END IF;
            UPDATE game_sessions SET p1_current_score = v_bot_target WHERE id = p_room_id;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
