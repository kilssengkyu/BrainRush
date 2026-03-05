-- Ensure round scores cannot be re-contaminated during warmup/round_end.
-- Score updates are accepted only in active gameplay window (start_at ~ end_at).

CREATE OR REPLACE FUNCTION public.update_score(p_room_id uuid, p_player_id text, p_score integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
AS $$
DECLARE
    v_p1 text;
    v_p2 text;
    v_status text;
    v_start_at timestamptz;
    v_end_at timestamptz;
    v_p1_points int;
    v_p2_points int;
    v_bot_target int;
BEGIN
    SELECT player1_id, player2_id, status, start_at, end_at, COALESCE(p1_current_score, 0), COALESCE(p2_current_score, 0)
    INTO v_p1, v_p2, v_status, v_start_at, v_end_at, v_p1_points, v_p2_points
    FROM game_sessions WHERE id = p_room_id;

    IF v_p1 IS NULL THEN
        RAISE EXCEPTION 'Room not found';
    END IF;

    -- Accept score updates only while the round is actively running.
    -- This blocks stale updates during round_end/warmup that can overwrite reset(0) scores.
    IF v_status <> 'playing' THEN
        RETURN;
    END IF;

    IF v_start_at IS NULL OR v_end_at IS NULL THEN
        RETURN;
    END IF;

    -- Allow a tiny grace window after end_at for final score flush.
    IF now() < v_start_at OR now() > (v_end_at + interval '1 second') THEN
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
$$;
