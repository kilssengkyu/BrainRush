-- Add STAIRWAY to rotation, stats, and duration
-- Based on latest: extend_round_transition.sql (6s warmup, highscores, game_stats)

ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;

ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_game_type_check
CHECK (game_type IN (
    'RPS',
    'NUMBER',
    'MATH',
    'TEN',
    'COLOR',
    'MEMORY',
    'SEQUENCE',
    'SEQUENCE_NORMAL',
    'LARGEST',
    'PAIR',
    'UPDOWN',
    'SLIDER',
    'ARROW',
    'NUMBER_DESC',
    'BLANK',
    'OPERATOR',
    'LADDER',
    'TAP_COLOR',
    'AIM',
    'MOST_COLOR',
    'SORTING',
    'SPY',
    'PATH',
    'BLIND_PATH',
    'BALLS',
    'CATCH_COLOR',
    'TIMING_BAR',
    'STAIRWAY'
));

-- Update game duration: STAIRWAY = 30초
CREATE OR REPLACE FUNCTION get_game_duration(p_game_type text)
RETURNS int AS $$
BEGIN
    RETURN CASE p_game_type
        -- 30초 게임
        WHEN 'RPS' THEN 30
        WHEN 'ARROW' THEN 30
        WHEN 'TAP_COLOR' THEN 30
        WHEN 'SLIDER' THEN 30
        WHEN 'UPDOWN' THEN 30
        WHEN 'CATCH_COLOR' THEN 30
        WHEN 'MATH' THEN 30
        WHEN 'TEN' THEN 30
        WHEN 'BLANK' THEN 30
        WHEN 'OPERATOR' THEN 30
        WHEN 'LARGEST' THEN 30
        WHEN 'NUMBER' THEN 30
        WHEN 'NUMBER_DESC' THEN 30
        WHEN 'SORTING' THEN 30
        WHEN 'LADDER' THEN 30
        WHEN 'MOST_COLOR' THEN 30
        WHEN 'COLOR' THEN 30
        WHEN 'SEQUENCE' THEN 30
        WHEN 'SEQUENCE_NORMAL' THEN 30
        WHEN 'PAIR' THEN 30
        
        -- 40초 게임
        WHEN 'AIM' THEN 40
        WHEN 'BALLS' THEN 40
        WHEN 'MEMORY' THEN 40
        WHEN 'SPY' THEN 40
        WHEN 'TIMING_BAR' THEN 40
        WHEN 'STAIRWAY' THEN 40
        
        -- 45초 게임
        WHEN 'PATH' THEN 45
        WHEN 'BLIND_PATH' THEN 45
        
        ELSE 30
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update stat increments mapping
CREATE OR REPLACE FUNCTION stat_increments(p_game_type text)
RETURNS TABLE (
    speed int,
    memory int,
    judgment int,
    calculation int,
    accuracy int,
    observation int
) AS $$
DECLARE
    v_speed int := 0;
    v_memory int := 0;
    v_judgment int := 0;
    v_calculation int := 0;
    v_accuracy int := 0;
    v_observation int := 0;
BEGIN
    CASE p_game_type
        WHEN 'AIM' THEN v_speed := 2; v_accuracy := 1;
        WHEN 'RPS' THEN v_speed := 2; v_judgment := 1;
        WHEN 'UPDOWN' THEN v_judgment := 2; v_speed := 1;
        WHEN 'ARROW' THEN v_speed := 2; v_judgment := 1;
        WHEN 'SLIDER' THEN v_accuracy := 2; v_speed := 1;
        WHEN 'MEMORY' THEN v_memory := 2; v_accuracy := 1;
        WHEN 'SEQUENCE' THEN v_memory := 2; v_accuracy := 1;
        WHEN 'SEQUENCE_NORMAL' THEN v_memory := 2; v_accuracy := 1;
        WHEN 'SPY' THEN v_memory := 2; v_observation := 1;
        WHEN 'PAIR' THEN v_memory := 2; v_observation := 1;
        WHEN 'COLOR' THEN v_observation := 2; v_accuracy := 1;
        WHEN 'MOST_COLOR' THEN v_observation := 2; v_judgment := 1;
        WHEN 'TAP_COLOR' THEN v_observation := 2; v_speed := 1;
        WHEN 'MATH' THEN v_calculation := 2; v_accuracy := 1;
        WHEN 'TEN' THEN v_calculation := 2; v_judgment := 1;
        WHEN 'BLANK' THEN v_calculation := 2; v_accuracy := 1;
        WHEN 'OPERATOR' THEN v_calculation := 2; v_judgment := 1;
        WHEN 'LARGEST' THEN v_calculation := 2; v_judgment := 1;
        WHEN 'NUMBER' THEN v_accuracy := 2; v_judgment := 1;
        WHEN 'NUMBER_DESC' THEN v_accuracy := 2; v_judgment := 1;
        WHEN 'NUMBER_ASC' THEN v_accuracy := 2; v_judgment := 1;
        WHEN 'SORTING' THEN v_accuracy := 2; v_judgment := 1;
        WHEN 'LADDER' THEN v_judgment := 2; v_accuracy := 1;
        WHEN 'PATH' THEN v_speed := 2; v_judgment := 1;
        WHEN 'BALLS' THEN v_observation := 2; v_accuracy := 1;
        WHEN 'BLIND_PATH' THEN v_observation := 2; v_accuracy := 1;
        WHEN 'CATCH_COLOR' THEN v_speed := 2; v_accuracy := 1;
        WHEN 'TIMING_BAR' THEN v_speed := 2; v_accuracy := 1;
        WHEN 'STAIRWAY' THEN v_speed := 2; v_judgment := 1;
        ELSE
            -- no-op
    END CASE;

    RETURN QUERY SELECT v_speed, v_memory, v_judgment, v_calculation, v_accuracy, v_observation;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update start_game to include STAIRWAY with dynamic duration
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    v_mode text;
    v_current_type text;
    v_duration int;
    v_all_types text[] := ARRAY[
        'RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR',
        'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR',
        'UPDOWN', 'SEQUENCE_NORMAL', 'NUMBER_DESC',
        'SLIDER', 'ARROW', 'BLANK', 'OPERATOR', 'LADDER', 'TAP_COLOR',
        'AIM', 'MOST_COLOR', 'SORTING', 'SPY', 'PATH', 'BLIND_PATH', 'BALLS', 'CATCH_COLOR', 'TIMING_BAR', 'STAIRWAY'
    ];
    v_selected_types text[];
    v_first_type text;
BEGIN
    SELECT mode, game_type INTO v_mode, v_current_type FROM game_sessions WHERE id = p_room_id;
    v_seed := md5(random()::text);

    IF v_mode = 'practice' THEN
        -- Get duration for practice game type
        v_duration := get_game_duration(v_current_type);
        
        -- PRACTICE: Start immediately
        UPDATE game_sessions
        SET status = 'playing',
            game_types = ARRAY[v_current_type],
            current_round_index = 0,
            current_round = 1,
            seed = v_seed,
            phase_start_at = now(),
            phase_end_at = now() + interval '4 seconds',
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '4 seconds' + (v_duration || ' seconds')::interval,
            round_scores = '[]'::jsonb
        WHERE id = p_room_id;
    ELSE
        -- NORMAL/RANK: Random 3 games
        SELECT ARRAY(
            SELECT x
            FROM unnest(v_all_types) AS x
            ORDER BY random()
            LIMIT 3
        ) INTO v_selected_types;

        v_first_type := v_selected_types[1];
        v_duration := get_game_duration(v_first_type);

        UPDATE game_sessions
        SET status = 'playing',
            game_types = v_selected_types,
            current_round_index = 0,
            current_round = 1,
            game_type = v_first_type,
            seed = v_seed,
            phase_start_at = now(),
            phase_end_at = now() + interval '4 seconds',
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '4 seconds' + (v_duration || ' seconds')::interval,
            round_scores = '[]'::jsonb
        WHERE id = p_room_id AND status = 'waiting';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- Update start_next_round: 6s warmup + highscores + game_stats + STAIRWAY
CREATE OR REPLACE FUNCTION start_next_round(p_room_id uuid)
RETURNS void AS $$
DECLARE
  v_next_type text;
  v_current_type text;
  v_status text;
  v_current_round int;
  v_next_round int;
  v_next_round_index int;
  v_duration int;
  
  -- Scores (Wins)
  v_p1_wins int;
  v_p2_wins int;
  
  -- Current Points
  v_p1_points int;
  v_p2_points int;
  
  v_game_data jsonb;
  v_target text;
  v_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW', 'NUMBER_DESC', 'BLANK', 'OPERATOR', 'LADDER', 'TAP_COLOR', 'AIM', 'MOST_COLOR', 'SORTING', 'SPY', 'PATH', 'BLIND_PATH', 'BALLS', 'CATCH_COLOR', 'TIMING_BAR', 'STAIRWAY'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
  
  v_round_snapshot jsonb;
  v_mode text;
  v_p1_id text;
  v_p2_id text;
BEGIN
  -- Get current state
  SELECT game_type, status, COALESCE(current_round, 0), player1_score, player2_score, COALESCE(p1_current_score, 0), COALESCE(p2_current_score, 0), mode, player1_id, player2_id
  INTO v_current_type, v_status, v_current_round, v_p1_wins, v_p2_wins, v_p1_points, v_p2_points, v_mode, v_p1_id, v_p2_id
  FROM game_sessions WHERE id = p_room_id
  FOR UPDATE;

  -- Graceful Exit if Room Not Found
  IF v_status IS NULL THEN
      RETURN;
  END IF;

  IF v_status = 'finished' THEN
      RETURN;
  END IF;

  -- Race Condition Fix: If already in countdown, do not advance round again.
  IF v_status = 'countdown' THEN
      RETURN;
  END IF;

  -- 1. Snapshot Previous Round (if not first round)
  IF v_current_round > 0 THEN
      -- Determine Round Winner based on POINTS
      IF v_p1_points > v_p2_points THEN
          v_p1_wins := v_p1_wins + 1;
      ELSIF v_p2_points > v_p1_points THEN
          v_p2_wins := v_p2_wins + 1;
      END IF;

      -- Create Snapshot Object
      v_round_snapshot := jsonb_build_object(
          'round', v_current_round,
          'game_type', v_current_type,
          'p1_score', v_p1_points,
          'p2_score', v_p2_points,
          'winner', CASE WHEN v_p1_points > v_p2_points THEN 'p1' WHEN v_p2_points > v_p1_points THEN 'p2' ELSE 'draw' END
      );

      -- Update Session: Add Snapshot, Update Wins, RESET Current Points
      UPDATE game_sessions
      SET round_scores = COALESCE(round_scores, '[]'::jsonb) || jsonb_build_array(v_round_snapshot),
          player1_score = v_p1_wins,
          player2_score = v_p2_wins,
          p1_current_score = 0,
          p2_current_score = 0
      WHERE id = p_room_id;

      -- Update highscores (per minigame)
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

      -- Update per-minigame stats (normal/rank)
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

  -- Practice: End after 1 round
  IF v_mode = 'practice' THEN
      UPDATE game_sessions SET status = 'finished', phase_end_at = now(), end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  -- 2. Check Victory Condition (3 rounds fixed)
  IF v_current_round >= 3 THEN
      PERFORM finish_game(p_room_id);
      RETURN;
  END IF;

  -- 3. Pick Next Game Type (Random)
  v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
  
  -- Get duration for next game type
  v_duration := get_game_duration(v_next_type);
  
  -- 4. Setup Game Data
  IF v_next_type = 'RPS' THEN
      v_target := v_opts[floor(random()*3 + 1)];
      v_game_data := '{}';
  ELSE
      v_target := null;
      v_game_data := jsonb_build_object('seed', floor(random()*10000));
  END IF;

  -- 5. Calculate Next Round
  v_next_round := v_current_round + 1;
  v_next_round_index := GREATEST(v_next_round - 1, 0);

  -- 6. Update Session -> PLAYING with 6s warmup (3s round_finished + 3s game_desc) + game duration
  UPDATE game_sessions
  SET status = 'playing',
      current_round = v_next_round,
      current_round_index = v_next_round_index,
      game_type = v_next_type,
      game_data = v_game_data,
      target_move = v_target,
      phase_start_at = now(),
      phase_end_at = now() + interval '6 seconds',
      start_at = now() + interval '6 seconds',
      end_at = now() + interval '6 seconds' + (v_duration || ' seconds')::interval,
      player1_ready = false,
      player2_ready = false
  WHERE id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
