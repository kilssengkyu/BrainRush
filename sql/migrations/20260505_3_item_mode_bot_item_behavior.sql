-- Item-mode bot behavior:
-- 1. Allow the active human participant to record a bot item event.
-- 2. Keep server-side bot ghost scoring aligned with client replay modifiers.

CREATE OR REPLACE FUNCTION public.calculate_item_bot_ghost_score(
    p_session_id uuid,
    p_round_number integer,
    p_bot_id text,
    p_start_at timestamptz,
    p_ghost jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_elapsed numeric := EXTRACT(EPOCH FROM (now() - p_start_at));
    v_freeze_seconds numeric := 0;
    v_effective_elapsed numeric := 0;
    v_total integer := 0;
    v_elem jsonb;
    v_t numeric;
    v_delta integer;
    v_multiplier integer;
    v_double record;
    v_double_start_eff numeric;
    v_double_end_eff numeric;
    v_freeze_before_start numeric;
    v_freeze_before_end numeric;
BEGIN
    IF p_ghost IS NULL OR jsonb_typeof(p_ghost) <> 'array' OR jsonb_array_length(p_ghost) = 0 THEN
        RETURN 0;
    END IF;

    SELECT COALESCE(SUM(
        GREATEST(
            EXTRACT(EPOCH FROM (LEAST(COALESCE(e.effect_ends_at, now()), now()) - e.used_at)),
            0
        )
    ), 0)
    INTO v_freeze_seconds
    FROM public.game_session_item_events e
    WHERE e.session_id = p_session_id
      AND e.round_number = p_round_number
      AND e.target_player_id = p_bot_id
      AND e.item_code IN ('SCREEN_BLOCK', 'EMOJI_BOMB')
      AND e.used_at <= now();

    v_effective_elapsed := GREATEST(0, v_elapsed - v_freeze_seconds);

    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_ghost)
    LOOP
        v_t := (v_elem->>0)::numeric;
        EXIT WHEN v_t > v_effective_elapsed;

        v_delta := (v_elem->>1)::integer;
        v_multiplier := 1;

        FOR v_double IN
            SELECT e.used_at, COALESCE(e.effect_ends_at, e.used_at + interval '3 seconds') AS effect_ends_at
            FROM public.game_session_item_events e
            WHERE e.session_id = p_session_id
              AND e.round_number = p_round_number
              AND e.used_by = p_bot_id
              AND e.target_player_id = p_bot_id
              AND e.item_code = 'AUTO_SOLVE'
              AND e.used_at <= now()
        LOOP
            SELECT COALESCE(SUM(
                GREATEST(
                    EXTRACT(EPOCH FROM (LEAST(COALESCE(fe.effect_ends_at, v_double.used_at), v_double.used_at) - fe.used_at)),
                    0
                )
            ), 0)
            INTO v_freeze_before_start
            FROM public.game_session_item_events fe
            WHERE fe.session_id = p_session_id
              AND fe.round_number = p_round_number
              AND fe.target_player_id = p_bot_id
              AND fe.item_code IN ('SCREEN_BLOCK', 'EMOJI_BOMB')
              AND fe.used_at <= v_double.used_at;

            SELECT COALESCE(SUM(
                GREATEST(
                    EXTRACT(EPOCH FROM (LEAST(COALESCE(fe.effect_ends_at, LEAST(v_double.effect_ends_at, now())), LEAST(v_double.effect_ends_at, now())) - fe.used_at)),
                    0
                )
            ), 0)
            INTO v_freeze_before_end
            FROM public.game_session_item_events fe
            WHERE fe.session_id = p_session_id
              AND fe.round_number = p_round_number
              AND fe.target_player_id = p_bot_id
              AND fe.item_code IN ('SCREEN_BLOCK', 'EMOJI_BOMB')
              AND fe.used_at <= LEAST(v_double.effect_ends_at, now());

            v_double_start_eff := GREATEST(0, EXTRACT(EPOCH FROM (v_double.used_at - p_start_at)) - COALESCE(v_freeze_before_start, 0));
            v_double_end_eff := GREATEST(0, EXTRACT(EPOCH FROM (LEAST(v_double.effect_ends_at, now()) - p_start_at)) - COALESCE(v_freeze_before_end, 0));

            IF v_t >= v_double_start_eff AND v_t <= v_double_end_eff THEN
                v_multiplier := 2;
                EXIT;
            END IF;
        END LOOP;

        v_total := v_total + (v_delta * v_multiplier);
    END LOOP;

    RETURN GREATEST(0, v_total);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_bot_item_event(
    p_room_id uuid,
    p_item_code text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_item_code text := upper(COALESCE(p_item_code, ''));
    v_session record;
    v_item record;
    v_bot_id text;
    v_human_id text;
    v_target_player_id text;
    v_round_number integer;
    v_effect_ends_at timestamptz;
    v_event_id uuid;
    v_now timestamptz := now();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT *
    INTO v_session
    FROM public.game_sessions gs
    WHERE gs.id = p_room_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found';
    END IF;

    IF v_session.mode <> 'normal' OR v_session.status <> 'playing' THEN
        RAISE EXCEPTION 'Bot items can only be used during item mode gameplay';
    END IF;

    IF v_session.player1_id LIKE 'bot_%' THEN
        v_bot_id := v_session.player1_id;
        v_human_id := v_session.player2_id;
    ELSIF v_session.player2_id LIKE 'bot_%' THEN
        v_bot_id := v_session.player2_id;
        v_human_id := v_session.player1_id;
    ELSE
        RAISE EXCEPTION 'Session has no bot opponent';
    END IF;

    IF v_human_id <> v_uid::text THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT *
    INTO v_item
    FROM public.item_catalog ic
    WHERE ic.item_code = v_item_code
      AND ic.is_enabled = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item not available';
    END IF;

    v_target_player_id := CASE
        WHEN v_item.target_type = 'self' THEN v_bot_id
        ELSE v_human_id
    END;
    v_round_number := COALESCE(v_session.current_round_index, 0) + 1;
    v_effect_ends_at := CASE
        WHEN COALESCE(v_item.duration_seconds, 0) > 0 THEN v_now + make_interval(secs => v_item.duration_seconds)
        WHEN v_item.item_code = 'AUTO_SOLVE' THEN v_now + interval '3 seconds'
        ELSE NULL
    END;

    INSERT INTO public.game_session_item_events (
        session_id,
        round_number,
        used_by,
        target_player_id,
        item_code,
        used_at,
        effect_ends_at,
        payload
    )
    VALUES (
        p_room_id,
        v_round_number,
        v_bot_id,
        v_target_player_id,
        v_item_code,
        v_now,
        v_effect_ends_at,
        jsonb_build_object(
            'effect_type', v_item.effect_type,
            'target_type', v_item.target_type,
            'cooldown_seconds', v_item.cooldown_seconds,
            'duration_seconds', CASE WHEN v_item.item_code = 'AUTO_SOLVE' THEN GREATEST(v_item.duration_seconds, 3) ELSE v_item.duration_seconds END,
            'metadata', COALESCE(v_item.metadata, '{}'::jsonb),
            'source', 'bot'
        )
    )
    RETURNING id INTO v_event_id;

    RETURN jsonb_build_object(
        'id', v_event_id,
        'session_id', p_room_id,
        'round_number', v_round_number,
        'used_by', v_bot_id,
        'target_player_id', v_target_player_id,
        'item_code', v_item_code,
        'used_at', v_now,
        'effect_ends_at', v_effect_ends_at,
        'payload', jsonb_build_object(
            'effect_type', v_item.effect_type,
            'target_type', v_item.target_type,
            'cooldown_seconds', v_item.cooldown_seconds,
            'duration_seconds', CASE WHEN v_item.item_code = 'AUTO_SOLVE' THEN GREATEST(v_item.duration_seconds, 3) ELSE v_item.duration_seconds END,
            'metadata', COALESCE(v_item.metadata, '{}'::jsonb),
            'source', 'bot'
        )
    );
END;
$$;

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
    v_caller text;
BEGIN
    v_caller := COALESCE(auth.uid()::text, '');

    SELECT player1_id, player2_id, status, current_round, start_at, end_at, COALESCE(p1_current_score, 0), COALESCE(p2_current_score, 0), COALESCE(game_data, '{}'::jsonb)
    INTO v_p1, v_p2, v_status, v_current_round, v_start_at, v_end_at, v_p1_points, v_p2_points, v_game_data
    FROM public.game_sessions WHERE id = p_room_id;

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

    IF p_player_id NOT LIKE 'bot_%' AND v_caller <> p_player_id THEN
        RAISE EXCEPTION 'Not authorized: caller does not match player_id';
    END IF;

    IF p_player_id <> v_p1 AND p_player_id <> v_p2 THEN
        RAISE EXCEPTION 'Not authorized: player is not a participant';
    END IF;

    v_ghost := v_game_data->'ghost_timeline';

    IF p_player_id = v_p1 THEN
        UPDATE public.game_sessions SET p1_current_score = p_score WHERE id = p_room_id;

        IF v_p2 LIKE 'bot_%' THEN
            IF v_ghost IS NOT NULL AND jsonb_array_length(v_ghost) > 0 THEN
                v_bot_target := public.calculate_item_bot_ghost_score(
                    p_room_id,
                    GREATEST(COALESCE(v_current_round, 1), 1),
                    v_p2,
                    v_start_at,
                    v_ghost
                );
            ELSE
                v_bot_target := GREATEST(0, LEAST(p_score - 20, floor(p_score * 0.9)));
            END IF;
            IF v_bot_target < v_p2_points THEN
                v_bot_target := v_p2_points;
            END IF;
            UPDATE public.game_sessions SET p2_current_score = v_bot_target WHERE id = p_room_id;
        END IF;
    ELSIF p_player_id = v_p2 THEN
        UPDATE public.game_sessions SET p2_current_score = p_score WHERE id = p_room_id;

        IF v_p1 LIKE 'bot_%' THEN
            IF v_ghost IS NOT NULL AND jsonb_array_length(v_ghost) > 0 THEN
                v_bot_target := public.calculate_item_bot_ghost_score(
                    p_room_id,
                    GREATEST(COALESCE(v_current_round, 1), 1),
                    v_p1,
                    v_start_at,
                    v_ghost
                );
            ELSE
                v_bot_target := GREATEST(0, LEAST(p_score - 20, floor(p_score * 0.9)));
            END IF;
            IF v_bot_target < v_p1_points THEN
                v_bot_target := v_p1_points;
            END IF;
            UPDATE public.game_sessions SET p1_current_score = v_bot_target WHERE id = p_room_id;
        END IF;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculate_item_bot_ghost_score(uuid, integer, text, timestamptz, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_bot_item_event(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_bot_item_event(uuid, text) TO authenticated, service_role;
