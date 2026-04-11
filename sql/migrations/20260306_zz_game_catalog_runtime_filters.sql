-- Enforce game catalog in practice creation and normal/rank game selection.

CREATE TABLE IF NOT EXISTS public.game_catalog (
  game_type text PRIMARY KEY,
  is_enabled boolean NOT NULL DEFAULT false,
  use_in_rank boolean NOT NULL DEFAULT true,
  use_in_normal boolean NOT NULL DEFAULT true,
  use_in_practice boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.create_practice_session(p_player_id text, p_game_type text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  consumed boolean;
BEGIN
  IF p_player_id <> auth.uid()::text THEN
      RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (
      SELECT 1
      FROM public.game_catalog gc
      WHERE gc.game_type = p_game_type
        AND gc.is_enabled = true
        AND gc.use_in_practice = true
  ) THEN
      RAISE EXCEPTION 'Game type is disabled for practice: %', p_game_type;
  END IF;

  consumed := consume_practice_note(auth.uid());
  IF NOT consumed THEN
      RAISE EXCEPTION 'Not enough practice notes';
  END IF;

  INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode, game_type)
  VALUES (p_player_id, 'practice_solo', 'waiting', 0, 'practice', p_game_type)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_game(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_seed text;
    v_mode text;
    v_current_type text;
    v_duration int;
    v_round_count int := 3;
    v_selected_types text[];
    v_first_type text;
    v_p1 text;
    v_p2 text;
    v_ghost_tl jsonb;
    v_game_data jsonb := '{}'::jsonb;
    v_caller text;
BEGIN
    -- Auth check: caller must be a participant
    v_caller := COALESCE(auth.uid()::text, '');
    SELECT mode, game_type, player1_id, player2_id INTO v_mode, v_current_type, v_p1, v_p2 FROM game_sessions WHERE id = p_room_id;

    IF v_p1 IS NULL THEN
        RAISE EXCEPTION 'Room not found';
    END IF;

    IF v_caller <> v_p1 AND v_caller <> v_p2 THEN
        RAISE EXCEPTION 'Not authorized: caller is not a participant';
    END IF;

    v_seed := md5(random()::text);

    IF v_mode = 'practice' THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.game_catalog gc
            WHERE gc.game_type = v_current_type
              AND gc.is_enabled = true
              AND gc.use_in_practice = true
        ) THEN
            RAISE EXCEPTION 'Game type is disabled for practice: %', v_current_type;
        END IF;

        v_duration := get_game_duration(v_current_type);
        v_first_type := v_current_type;

        -- Ghost assignment for practice bot
        IF v_p2 LIKE 'bot_%' OR v_p1 LIKE 'bot_%' THEN
            SELECT score_timeline INTO v_ghost_tl
            FROM ghost_scores
            WHERE game_type = v_first_type
            ORDER BY random()
            LIMIT 1;
            IF v_ghost_tl IS NOT NULL THEN
                v_game_data := jsonb_build_object('ghost_timeline', v_ghost_tl);
            END IF;
        END IF;

        UPDATE game_sessions
        SET status = 'playing',
            game_types = ARRAY[v_current_type],
            current_round_index = 0,
            current_round = 1,
            seed = v_seed,
            game_data = v_game_data,
            phase_start_at = now(),
            phase_end_at = now() + interval '4 seconds',
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '4 seconds' + (v_duration || ' seconds')::interval,
            round_scores = '[]'::jsonb
        WHERE id = p_room_id;
    ELSE
        IF v_mode = 'rank' THEN
            v_round_count := 5;
        ELSE
            v_round_count := 3;
        END IF;

        SELECT ARRAY(
            SELECT gc.game_type
            FROM public.game_catalog gc
            WHERE gc.is_enabled = true
              AND (
                  (v_mode = 'rank' AND gc.use_in_rank = true)
                  OR (v_mode <> 'rank' AND gc.use_in_normal = true)
              )
            ORDER BY random()
            LIMIT v_round_count
        ) INTO v_selected_types;

        IF COALESCE(array_length(v_selected_types, 1), 0) < v_round_count THEN
            RAISE EXCEPTION 'Not enough enabled games for mode: %', v_mode;
        END IF;

        v_first_type := v_selected_types[1];
        v_duration := get_game_duration(v_first_type);

        -- Ghost assignment for bot matches
        IF v_p2 LIKE 'bot_%' OR v_p1 LIKE 'bot_%' THEN
            SELECT score_timeline INTO v_ghost_tl
            FROM ghost_scores
            WHERE game_type = v_first_type
            ORDER BY random()
            LIMIT 1;
            IF v_ghost_tl IS NOT NULL THEN
                v_game_data := jsonb_build_object('ghost_timeline', v_ghost_tl);
            END IF;
        END IF;

        UPDATE game_sessions
        SET status = 'playing',
            game_types = v_selected_types,
            current_round_index = 0,
            current_round = 1,
            game_type = v_first_type,
            seed = v_seed,
            game_data = v_game_data,
            phase_start_at = now(),
            phase_end_at = now() + interval '4 seconds',
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '4 seconds' + (v_duration || ' seconds')::interval,
            round_scores = '[]'::jsonb
        WHERE id = p_room_id AND status = 'waiting';
    END IF;
END;
$$;
