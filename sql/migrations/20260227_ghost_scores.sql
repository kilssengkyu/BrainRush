-- Ghost Score System: Record real player score events for bot replay
-- Format: [[elapsed_secs, delta], [elapsed_secs, delta], ...]
-- Example: [[0.78, 65], [1.24, -40], [2.23, 75]]

-- =============================
-- 1. Ghost Scores Table
-- =============================
CREATE TABLE IF NOT EXISTS ghost_scores (
  id bigserial PRIMARY KEY,
  game_type text NOT NULL,
  score_timeline jsonb NOT NULL,  -- [[elapsed_secs, delta], ...]
  final_score int NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ghost_game_type ON ghost_scores(game_type);

-- =============================
-- 2. Save Ghost Score RPC
-- =============================
CREATE OR REPLACE FUNCTION save_ghost_score(
  p_game_type text,
  p_timeline jsonb,
  p_final_score int
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only save meaningful scores (final > 0)
  IF p_final_score <= 0 THEN
    RETURN;
  END IF;
  INSERT INTO ghost_scores (game_type, score_timeline, final_score)
  VALUES (p_game_type, p_timeline, p_final_score);
END;
$$;

GRANT EXECUTE ON FUNCTION save_ghost_score TO postgres, anon, authenticated, service_role;

-- =============================
-- 3. Modified update_score (Ghost Timeline Support)
-- =============================
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
    v_game_data jsonb;
    v_ghost jsonb;
    v_elapsed numeric;
BEGIN
    SELECT player1_id, player2_id, status, start_at, end_at, COALESCE(p1_current_score, 0), COALESCE(p2_current_score, 0), COALESCE(game_data, '{}'::jsonb)
    INTO v_p1, v_p2, v_status, v_start_at, v_end_at, v_p1_points, v_p2_points, v_game_data
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

    IF p_player_id != v_p1 AND p_player_id != v_p2 THEN
        IF auth.uid() IS NOT NULL AND auth.uid()::text != p_player_id THEN
            RAISE EXCEPTION 'Not authorized';
        END IF;
    END IF;

    -- Ghost timeline from game_data: [[elapsed_secs, delta], ...]
    v_ghost := v_game_data->'ghost_timeline';

    IF p_player_id = v_p1 THEN
        UPDATE game_sessions SET p1_current_score = p_score WHERE id = p_room_id;

        IF v_p2 LIKE 'bot_%' THEN
            IF v_ghost IS NOT NULL AND jsonb_array_length(v_ghost) > 0 THEN
                -- Replay ghost events: sum deltas where elapsed <= current elapsed time
                v_elapsed := EXTRACT(EPOCH FROM (now() - v_start_at));
                SELECT GREATEST(0, COALESCE(SUM((elem->>1)::int), 0))
                INTO v_bot_target
                FROM jsonb_array_elements(v_ghost) AS elem
                WHERE (elem->>0)::numeric <= v_elapsed;
            ELSE
                -- Fallback: 90% formula
                v_bot_target := GREATEST(0, LEAST(p_score - 20, floor(p_score * 0.9)));
            END IF;
            -- Never decrease bot score
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
                SELECT GREATEST(0, COALESCE(SUM((elem->>1)::int), 0))
                INTO v_bot_target
                FROM jsonb_array_elements(v_ghost) AS elem
                WHERE (elem->>0)::numeric <= v_elapsed;
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

-- =============================
-- 4. Modified start_game (Ghost Assignment for Bot Matches)
-- =============================
CREATE OR REPLACE FUNCTION public.start_game(p_room_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
AS $$
DECLARE
    v_seed text;
    v_mode text;
    v_current_type text;
    v_duration int;
    v_round_count int := 3;
    v_all_types text[] := ARRAY[
        'RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR',
        'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR',
        'UPDOWN', 'SEQUENCE_NORMAL', 'NUMBER_DESC',
        'SLIDER', 'ARROW', 'BLANK', 'OPERATOR', 'LADDER', 'TAP_COLOR',
        'AIM', 'MOST_COLOR', 'SORTING', 'SPY', 'PATH', 'BLIND_PATH', 'BALLS', 'CATCH_COLOR', 'COLOR_TIMING', 'STAIRWAY', 'MAKE_ZERO'
    ];
    v_selected_types text[];
    v_first_type text;
    v_p1 text;
    v_p2 text;
    v_ghost_tl jsonb;
    v_game_data jsonb := '{}'::jsonb;
BEGIN
    SELECT mode, game_type, player1_id, player2_id INTO v_mode, v_current_type, v_p1, v_p2 FROM game_sessions WHERE id = p_room_id;
    v_seed := md5(random()::text);

    IF v_mode = 'practice' THEN
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
            SELECT x
            FROM unnest(v_all_types) AS x
            ORDER BY random()
            LIMIT v_round_count
        ) INTO v_selected_types;

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

-- =============================
-- 5. Modified start_next_round (Ghost Assignment for Bot Matches)
-- =============================
CREATE OR REPLACE FUNCTION public.start_next_round(p_room_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_next_type text;
  v_current_type text;
  v_status text;
  v_current_round int;
  v_next_round int;
  v_next_round_index int;
  v_duration int;
  
  v_p1_wins int;
  v_p2_wins int;
  v_p1_points int;
  v_p2_points int;
  
  v_game_data jsonb;
  v_target text;
  v_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW', 'NUMBER_DESC', 'BLANK', 'OPERATOR', 'LADDER', 'TAP_COLOR', 'AIM', 'MOST_COLOR', 'SORTING', 'SPY', 'PATH', 'BLIND_PATH', 'BALLS', 'CATCH_COLOR', 'COLOR_TIMING', 'STAIRWAY', 'MAKE_ZERO'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
  
  v_round_snapshot jsonb;
  v_mode text;
  v_p1_id text;
  v_p2_id text;
  v_game_types text[];
  v_round_scores jsonb;
  v_fallback_type text;
  v_required_wins int := 2;
  v_max_rounds int := 3;
  v_ghost_tl jsonb;
BEGIN
  SELECT game_type, status, COALESCE(current_round, 0), player1_score, player2_score, COALESCE(p1_current_score, 0), COALESCE(p2_current_score, 0), mode, player1_id, player2_id, game_types, COALESCE(round_scores, '[]'::jsonb)
  INTO v_current_type, v_status, v_current_round, v_p1_wins, v_p2_wins, v_p1_points, v_p2_points, v_mode, v_p1_id, v_p2_id, v_game_types, v_round_scores
  FROM game_sessions WHERE id = p_room_id
  FOR UPDATE;

  IF v_status IS NULL THEN RETURN; END IF;
  IF v_status = 'finished' THEN RETURN; END IF;
  IF v_status = 'countdown' THEN RETURN; END IF;

  -- 1. Snapshot Previous Round
  IF v_current_round > 0 THEN
      IF v_p1_points > v_p2_points THEN
          v_p1_wins := v_p1_wins + 1;
      ELSIF v_p2_points > v_p1_points THEN
          v_p2_wins := v_p2_wins + 1;
      END IF;

      v_round_snapshot := jsonb_build_object(
          'round', v_current_round,
          'game_type', v_current_type,
          'p1_score', v_p1_points,
          'p2_score', v_p2_points,
          'winner', CASE WHEN v_p1_points > v_p2_points THEN 'p1' WHEN v_p2_points > v_p1_points THEN 'p2' ELSE 'draw' END
      );

      UPDATE game_sessions
      SET round_scores = COALESCE(round_scores, '[]'::jsonb) || jsonb_build_array(v_round_snapshot),
          player1_score = v_p1_wins,
          player2_score = v_p2_wins,
          p1_current_score = 0,
          p2_current_score = 0
      WHERE id = p_room_id;

      -- Update highscores
      IF v_current_type IS NOT NULL THEN
          IF v_p1_id ~ '^[0-9a-fA-F-]{36}$' THEN
              INSERT INTO player_highscores (user_id, game_type, best_score, updated_at)
              VALUES (v_p1_id::uuid, v_current_type, v_p1_points, now())
              ON CONFLICT (user_id, game_type)
              DO UPDATE SET best_score = GREATEST(player_highscores.best_score, EXCLUDED.best_score),
                            updated_at = now();
          END IF;
          IF v_p2_id ~ '^[0-9a-fA-F-]{36}$' THEN
              INSERT INTO player_highscores (user_id, game_type, best_score, updated_at)
              VALUES (v_p2_id::uuid, v_current_type, v_p2_points, now())
              ON CONFLICT (user_id, game_type)
              DO UPDATE SET best_score = GREATEST(player_highscores.best_score, EXCLUDED.best_score),
                            updated_at = now();
          END IF;
      END IF;

      -- Update per-minigame stats
      IF v_current_type IS NOT NULL AND v_mode IN ('rank', 'normal') THEN
          IF v_p1_id ~ '^[0-9a-fA-F-]{36}$' THEN
              INSERT INTO player_game_stats (
                  user_id, game_type,
                  normal_wins, normal_losses, normal_draws,
                  rank_wins, rank_losses, rank_draws,
                  updated_at
              )
              VALUES (
                  v_p1_id::uuid, v_current_type,
                  CASE WHEN v_mode = 'normal' AND v_p1_points > v_p2_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'normal' AND v_p1_points < v_p2_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'normal' AND v_p1_points = v_p2_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'rank' AND v_p1_points > v_p2_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'rank' AND v_p1_points < v_p2_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'rank' AND v_p1_points = v_p2_points THEN 1 ELSE 0 END,
                  now()
              )
              ON CONFLICT (user_id, game_type)
              DO UPDATE SET
                  normal_wins = player_game_stats.normal_wins + EXCLUDED.normal_wins,
                  normal_losses = player_game_stats.normal_losses + EXCLUDED.normal_losses,
                  normal_draws = player_game_stats.normal_draws + EXCLUDED.normal_draws,
                  rank_wins = player_game_stats.rank_wins + EXCLUDED.rank_wins,
                  rank_losses = player_game_stats.rank_losses + EXCLUDED.rank_losses,
                  rank_draws = player_game_stats.rank_draws + EXCLUDED.rank_draws,
                  updated_at = now();
          END IF;
          IF v_p2_id ~ '^[0-9a-fA-F-]{36}$' THEN
              INSERT INTO player_game_stats (
                  user_id, game_type,
                  normal_wins, normal_losses, normal_draws,
                  rank_wins, rank_losses, rank_draws,
                  updated_at
              )
              VALUES (
                  v_p2_id::uuid, v_current_type,
                  CASE WHEN v_mode = 'normal' AND v_p2_points > v_p1_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'normal' AND v_p2_points < v_p1_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'normal' AND v_p2_points = v_p1_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'rank' AND v_p2_points > v_p1_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'rank' AND v_p2_points < v_p1_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'rank' AND v_p2_points = v_p1_points THEN 1 ELSE 0 END,
                  now()
              )
              ON CONFLICT (user_id, game_type)
              DO UPDATE SET
                  normal_wins = player_game_stats.normal_wins + EXCLUDED.normal_wins,
                  normal_losses = player_game_stats.normal_losses + EXCLUDED.normal_losses,
                  normal_draws = player_game_stats.normal_draws + EXCLUDED.normal_draws,
                  rank_wins = player_game_stats.rank_wins + EXCLUDED.rank_wins,
                  rank_losses = player_game_stats.rank_losses + EXCLUDED.rank_losses,
                  rank_draws = player_game_stats.rank_draws + EXCLUDED.rank_draws,
                  updated_at = now();
          END IF;
      END IF;
  END IF;

  IF v_mode = 'practice' THEN
      UPDATE game_sessions SET status = 'finished', phase_end_at = now(), end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  IF v_mode = 'rank' THEN
      v_required_wins := 3;
      v_max_rounds := 5;
  ELSE
      v_required_wins := 2;
      v_max_rounds := 3;
  END IF;

  IF v_p1_wins >= v_required_wins OR v_p2_wins >= v_required_wins OR v_current_round >= v_max_rounds THEN
      PERFORM finish_game(p_room_id);
      RETURN;
  END IF;

  v_next_round := v_current_round + 1;
  v_next_round_index := GREATEST(v_next_round - 1, 0);

  IF array_length(v_game_types, 1) >= v_next_round THEN
      v_next_type := v_game_types[v_next_round];
  END IF;

  IF v_next_type IS NULL THEN
      SELECT x INTO v_fallback_type
      FROM unnest(v_types) AS x
      WHERE x <> v_current_type
        AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_round_scores) AS rs WHERE rs->>'game_type' = x
        )
      ORDER BY random() LIMIT 1;
      IF v_fallback_type IS NOT NULL THEN
          v_next_type := v_fallback_type;
      ELSE
          v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
      END IF;
  END IF;

  v_duration := get_game_duration(v_next_type);
  
  -- Setup Game Data
  IF v_next_type = 'RPS' THEN
      v_target := v_opts[floor(random()*3 + 1)];
      v_game_data := '{}'::jsonb;
  ELSE
      v_target := null;
      v_game_data := jsonb_build_object('seed', floor(random()*10000));
  END IF;

  -- Ghost assignment for bot matches
  IF v_p1_id LIKE 'bot_%' OR v_p2_id LIKE 'bot_%' THEN
      SELECT score_timeline INTO v_ghost_tl
      FROM ghost_scores
      WHERE game_type = v_next_type
      ORDER BY random()
      LIMIT 1;
      IF v_ghost_tl IS NOT NULL THEN
          v_game_data := v_game_data || jsonb_build_object('ghost_timeline', v_ghost_tl);
      END IF;
  END IF;

  UPDATE game_sessions
  SET status = 'playing',
      current_round = v_next_round,
      current_round_index = v_next_round_index,
      game_type = v_next_type,
      game_data = v_game_data,
      target_move = v_target,
      phase_start_at = now(),
      phase_end_at = now() + interval '8 seconds',
      start_at = now() + interval '8 seconds',
      end_at = now() + interval '8 seconds' + (v_duration || ' seconds')::interval,
      player1_ready = false,
      player2_ready = false
  WHERE id = p_room_id;
END;
$_$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION update_score TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION start_game TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION start_next_round TO postgres, anon, authenticated, service_role;
GRANT SELECT, INSERT ON ghost_scores TO postgres, anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ghost_scores_id_seq TO postgres, anon, authenticated, service_role;
