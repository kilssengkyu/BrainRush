-- Make opponent-targeted item effects impact bot opponents by delaying ghost score progress.

CREATE OR REPLACE FUNCTION public.update_score(p_room_id uuid, p_player_id text, p_score integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
AS $$
DECLARE
    v_p1 text;
    v_p2 text;
    v_status text;
    v_current_round int;
    v_start_at timestamptz;
    v_end_at timestamptz;
    v_p1_points int;
    v_p2_points int;
    v_bot_target int;
    v_game_data jsonb;
    v_ghost jsonb;
    v_elapsed numeric;
    v_effective_elapsed numeric;
    v_bot_delay_seconds numeric := 0;
    v_caller text;
BEGIN
    v_caller := COALESCE(auth.uid()::text, '');

    SELECT player1_id, player2_id, status, current_round, start_at, end_at, COALESCE(p1_current_score, 0), COALESCE(p2_current_score, 0), COALESCE(game_data, '{}'::jsonb)
    INTO v_p1, v_p2, v_status, v_current_round, v_start_at, v_end_at, v_p1_points, v_p2_points, v_game_data
    FROM game_sessions WHERE id = p_room_id;

    IF v_p1 IS NULL THEN
        RAISE EXCEPTION 'Room not found';
    END IF;

    IF v_status <> 'playing' THEN
        RETURN;
    END IF;

    IF v_start_at IS NULL OR v_end_at IS NULL THEN
        RETURN;
    END IF;

    IF now() < v_start_at OR now() > (v_end_at + interval '1 second') THEN
        RETURN;
    END IF;

    IF p_player_id NOT LIKE 'bot_%' THEN
        IF v_caller <> p_player_id THEN
            RAISE EXCEPTION 'Not authorized: caller does not match player_id';
        END IF;
    END IF;

    IF p_player_id <> v_p1 AND p_player_id <> v_p2 THEN
        RAISE EXCEPTION 'Not authorized: player is not a participant';
    END IF;

    v_ghost := v_game_data->'ghost_timeline';

    IF p_player_id = v_p1 THEN
        UPDATE game_sessions SET p1_current_score = p_score WHERE id = p_room_id;

        IF v_p2 LIKE 'bot_%' THEN
            IF v_ghost IS NOT NULL AND jsonb_array_length(v_ghost) > 0 THEN
                v_elapsed := EXTRACT(EPOCH FROM (now() - v_start_at));

                SELECT COALESCE(SUM(
                    GREATEST(
                        EXTRACT(EPOCH FROM (COALESCE(e.effect_ends_at, e.used_at) - e.used_at)),
                        COALESCE((e.payload->>'duration_seconds')::numeric, 0)
                    )
                ), 0)
                INTO v_bot_delay_seconds
                FROM public.game_session_item_events e
                WHERE e.session_id = p_room_id
                  AND e.round_number = GREATEST(COALESCE(v_current_round, 1), 1)
                  AND e.target_player_id = v_p2
                  AND e.item_code IN ('SCREEN_BLOCK', 'EMOJI_BOMB');

                v_effective_elapsed := GREATEST(0, v_elapsed - v_bot_delay_seconds);

                SELECT GREATEST(0, COALESCE(SUM((elem->>1)::int), 0))
                INTO v_bot_target
                FROM jsonb_array_elements(v_ghost) AS elem
                WHERE (elem->>0)::numeric <= v_effective_elapsed;
            ELSE
                v_bot_target := GREATEST(0, LEAST(p_score - 20, floor(p_score * 0.9)));
            END IF;
            IF v_bot_target < v_p2_points THEN
                v_bot_target := v_p2_points;
            END IF;
            UPDATE game_sessions SET p2_current_score = v_bot_target WHERE id = p_room_id;
        END IF;
    ELSIF p_player_id = v_p2 THEN
        UPDATE game_sessions SET p2_current_score = p_score WHERE id = p_room_id;

        IF v_p1 LIKE 'bot_%' THEN
            IF v_ghost IS NOT NULL AND jsonb_array_length(v_ghost) > 0 THEN
                v_elapsed := EXTRACT(EPOCH FROM (now() - v_start_at));

                SELECT COALESCE(SUM(
                    GREATEST(
                        EXTRACT(EPOCH FROM (COALESCE(e.effect_ends_at, e.used_at) - e.used_at)),
                        COALESCE((e.payload->>'duration_seconds')::numeric, 0)
                    )
                ), 0)
                INTO v_bot_delay_seconds
                FROM public.game_session_item_events e
                WHERE e.session_id = p_room_id
                  AND e.round_number = GREATEST(COALESCE(v_current_round, 1), 1)
                  AND e.target_player_id = v_p1
                  AND e.item_code IN ('SCREEN_BLOCK', 'EMOJI_BOMB');

                v_effective_elapsed := GREATEST(0, v_elapsed - v_bot_delay_seconds);

                SELECT GREATEST(0, COALESCE(SUM((elem->>1)::int), 0))
                INTO v_bot_target
                FROM jsonb_array_elements(v_ghost) AS elem
                WHERE (elem->>0)::numeric <= v_effective_elapsed;
            ELSE
                v_bot_target := GREATEST(0, LEAST(p_score - 20, floor(p_score * 0.9)));
            END IF;
            IF v_bot_target < v_p1_points THEN
                v_bot_target := v_p1_points;
            END IF;
            UPDATE game_sessions SET p1_current_score = v_bot_target WHERE id = p_room_id;
        END IF;
    END IF;
END;
$$;
