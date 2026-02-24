-- BO3/BO5 rules update
-- normal/friendly: best of 3 (first to 2)
-- rank: best of 5 (first to 3)
-- winner determination is now based on round wins, not total points.

CREATE OR REPLACE FUNCTION public.finish_game(p_room_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
    v_session record;
    v_winner text;
    v_loser text;
    v_is_draw boolean := false;
    v_k_factor int := 32;
    v_p1_mmr int;
    v_p2_mmr int;
    v_p1_exp float;
    v_p2_exp float;
    v_new_p1_mmr int;
    v_new_p2_mmr int;
    v_p1_delta int := 0;
    v_p2_delta int := 0;
    v_p1_is_real boolean := false;
    v_p2_is_real boolean := false;

    v_p1_total int := 0;
    v_p2_total int := 0;
    v_p1_wins int := 0;
    v_p2_wins int := 0;
    v_round jsonb;

    -- Streak variables
    v_winner_streak int;
    v_winner_streak_at timestamptz;
    v_loser_lose_streak int;
    v_loser_lose_bonus_date date;
    v_streak_bonus int := 0;

    v_round_winner text;
    v_round_type text;
    v_inc record;

    v_p1_speed int := 0;
    v_p1_memory int := 0;
    v_p1_judgment int := 0;
    v_p1_calculation int := 0;
    v_p1_accuracy int := 0;
    v_p1_observation int := 0;

    v_p2_speed int := 0;
    v_p2_memory int := 0;
    v_p2_judgment int := 0;
    v_p2_calculation int := 0;
    v_p2_accuracy int := 0;
    v_p2_observation int := 0;
BEGIN
    -- [SECURE] Caller Check
    IF NOT EXISTS (SELECT 1 FROM game_sessions WHERE id = p_room_id
        AND (player1_id = auth.uid()::text OR player2_id = auth.uid()::text)) THEN
       RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT * INTO v_session FROM game_sessions WHERE id = p_room_id;

    -- Status check
    IF v_session.status = 'finished' THEN RETURN; END IF;

    -- Calculate Totals and Per-Round Stat Gains
    SELECT round_scores INTO v_session.round_scores FROM game_sessions WHERE id = p_room_id;

    FOR v_round IN SELECT * FROM jsonb_array_elements(v_session.round_scores)
    LOOP
        v_p1_total := v_p1_total + (v_round->>'p1_score')::int;
        v_p2_total := v_p2_total + (v_round->>'p2_score')::int;

        v_round_winner := v_round->>'winner';
        v_round_type := v_round->>'game_type';

        IF v_round_winner = 'p1' THEN
            v_p1_wins := v_p1_wins + 1;
            SELECT * INTO v_inc FROM stat_increments(v_round_type);
            v_p1_speed := v_p1_speed + v_inc.speed;
            v_p1_memory := v_p1_memory + v_inc.memory;
            v_p1_judgment := v_p1_judgment + v_inc.judgment;
            v_p1_calculation := v_p1_calculation + v_inc.calculation;
            v_p1_accuracy := v_p1_accuracy + v_inc.accuracy;
            v_p1_observation := v_p1_observation + v_inc.observation;
        ELSIF v_round_winner = 'p2' THEN
            v_p2_wins := v_p2_wins + 1;
            SELECT * INTO v_inc FROM stat_increments(v_round_type);
            v_p2_speed := v_p2_speed + v_inc.speed;
            v_p2_memory := v_p2_memory + v_inc.memory;
            v_p2_judgment := v_p2_judgment + v_inc.judgment;
            v_p2_calculation := v_p2_calculation + v_inc.calculation;
            v_p2_accuracy := v_p2_accuracy + v_inc.accuracy;
            v_p2_observation := v_p2_observation + v_inc.observation;
        END IF;
    END LOOP;

    -- Determine Winner
    IF v_p1_wins > v_p2_wins THEN
        v_winner := v_session.player1_id;
        v_loser := v_session.player2_id;
    ELSIF v_p2_wins > v_p1_wins THEN
        v_winner := v_session.player2_id;
        v_loser := v_session.player1_id;
    ELSE
        v_is_draw := true;
    END IF;

    -- Update Session
    UPDATE game_sessions
    SET status = 'finished',
        winner_id = v_winner,
        end_at = now(),
        player1_score = v_p1_wins,
        player2_score = v_p2_wins
    WHERE id = p_room_id;

    -- STATS UPDATE LOGIC
    IF v_winner IS NOT NULL AND NOT v_is_draw THEN
        IF v_session.mode = 'rank' THEN
             -- RANK MODE: allow bot matches by treating bot MMR as fixed 1000
             v_p1_is_real := v_session.player1_id ~ '^[0-9a-fA-F-]{36}$';
             v_p2_is_real := v_session.player2_id ~ '^[0-9a-fA-F-]{36}$';
             v_streak_bonus := 0;

             IF v_p1_is_real OR v_p2_is_real THEN
                 IF v_p1_is_real THEN
                     SELECT mmr INTO v_p1_mmr FROM profiles WHERE id = v_session.player1_id::uuid;
                 ELSE
                     v_p1_mmr := 1000;
                 END IF;

                 IF v_p2_is_real THEN
                     SELECT mmr INTO v_p2_mmr FROM profiles WHERE id = v_session.player2_id::uuid;
                 ELSE
                     v_p2_mmr := 1000;
                 END IF;

                 v_p1_mmr := COALESCE(v_p1_mmr, 1000);
                 v_p2_mmr := COALESCE(v_p2_mmr, 1000);

                 v_p1_exp := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::numeric / 400.0));
                 v_p2_exp := 1.0 / (1.0 + power(10.0, (v_p1_mmr - v_p2_mmr)::numeric / 400.0));

                 -- Winner streak bonus is only for real users
                 IF v_winner = v_session.player1_id::text AND v_p1_is_real THEN
                     SELECT rank_win_streak, rank_streak_updated_at
                     INTO v_winner_streak, v_winner_streak_at
                     FROM profiles WHERE id = v_session.player1_id::uuid;

                     IF v_winner_streak_at IS NOT NULL AND (now() - v_winner_streak_at) <= interval '10 minutes' THEN
                         v_winner_streak := COALESCE(v_winner_streak, 0) + 1;
                     ELSE
                         v_winner_streak := 1;
                     END IF;

                     IF v_winner_streak >= 3 AND (v_winner_streak % 3) = 0 THEN
                         v_streak_bonus := LEAST((v_winner_streak / 3) * 5, 15);
                     END IF;

                     IF v_winner_streak >= 9 THEN
                         v_winner_streak := 0;
                     END IF;
                 ELSIF v_winner = v_session.player2_id::text AND v_p2_is_real THEN
                     SELECT rank_win_streak, rank_streak_updated_at
                     INTO v_winner_streak, v_winner_streak_at
                     FROM profiles WHERE id = v_session.player2_id::uuid;

                     IF v_winner_streak_at IS NOT NULL AND (now() - v_winner_streak_at) <= interval '10 minutes' THEN
                         v_winner_streak := COALESCE(v_winner_streak, 0) + 1;
                     ELSE
                         v_winner_streak := 1;
                     END IF;

                     IF v_winner_streak >= 3 AND (v_winner_streak % 3) = 0 THEN
                         v_streak_bonus := LEAST((v_winner_streak / 3) * 5, 15);
                     END IF;

                     IF v_winner_streak >= 9 THEN
                         v_winner_streak := 0;
                     END IF;
                 END IF;

                 IF v_winner = v_session.player1_id::text THEN
                     v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (1 - v_p1_exp)) + v_streak_bonus;
                     v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (0 - v_p2_exp));
                 ELSE
                     v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (0 - v_p1_exp));
                     v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (1 - v_p2_exp)) + v_streak_bonus;
                 END IF;

                 v_p1_delta := v_new_p1_mmr - v_p1_mmr;
                 v_p2_delta := v_new_p2_mmr - v_p2_mmr;

                 -- Apply MMR/stat updates only to real profiles
                 IF v_p1_is_real THEN
                     IF v_winner = v_session.player1_id::text THEN
                         UPDATE profiles
                         SET mmr = v_new_p1_mmr, wins = wins + 1,
                             rank_win_streak = COALESCE(v_winner_streak, 0),
                             rank_streak_updated_at = now(),
                             rank_lose_streak = 0
                         WHERE id = v_session.player1_id::uuid;
                     ELSE
                         UPDATE profiles
                         SET mmr = v_new_p1_mmr, losses = losses + 1,
                             rank_win_streak = 0,
                             rank_streak_updated_at = NULL,
                             rank_lose_streak = COALESCE(rank_lose_streak, 0) + 1
                         WHERE id = v_session.player1_id::uuid;
                     END IF;
                 END IF;

                 IF v_p2_is_real THEN
                     IF v_winner = v_session.player2_id::text THEN
                         UPDATE profiles
                         SET mmr = v_new_p2_mmr, wins = wins + 1,
                             rank_win_streak = COALESCE(v_winner_streak, 0),
                             rank_streak_updated_at = now(),
                             rank_lose_streak = 0
                         WHERE id = v_session.player2_id::uuid;
                     ELSE
                         UPDATE profiles
                         SET mmr = v_new_p2_mmr, losses = losses + 1,
                             rank_win_streak = 0,
                             rank_streak_updated_at = NULL,
                             rank_lose_streak = COALESCE(rank_lose_streak, 0) + 1
                         WHERE id = v_session.player2_id::uuid;
                     END IF;
                 END IF;

                 UPDATE game_sessions SET
                     player1_mmr_change = v_p1_delta,
                     player2_mmr_change = v_p2_delta,
                     player1_streak_bonus = CASE WHEN v_winner = v_session.player1_id::text AND v_p1_is_real THEN v_streak_bonus ELSE 0 END,
                     player2_streak_bonus = CASE WHEN v_winner = v_session.player2_id::text AND v_p2_is_real THEN v_streak_bonus ELSE 0 END
                 WHERE id = p_room_id;

                 -- Lose streak reward only for real loser
                 IF v_loser = v_session.player1_id::text AND v_p1_is_real THEN
                     SELECT rank_lose_streak, rank_lose_bonus_date
                     INTO v_loser_lose_streak, v_loser_lose_bonus_date
                     FROM profiles WHERE id = v_session.player1_id::uuid;

                     IF v_loser_lose_streak >= 3 AND (v_loser_lose_bonus_date IS NULL OR v_loser_lose_bonus_date < CURRENT_DATE) THEN
                         UPDATE profiles
                         SET pencils = pencils + 1,
                             rank_lose_bonus_date = CURRENT_DATE,
                             rank_lose_streak = 0
                         WHERE id = v_session.player1_id::uuid;
                         UPDATE game_sessions SET player1_lose_pencil = true WHERE id = p_room_id;
                     END IF;
                 ELSIF v_loser = v_session.player2_id::text AND v_p2_is_real THEN
                     SELECT rank_lose_streak, rank_lose_bonus_date
                     INTO v_loser_lose_streak, v_loser_lose_bonus_date
                     FROM profiles WHERE id = v_session.player2_id::uuid;

                     IF v_loser_lose_streak >= 3 AND (v_loser_lose_bonus_date IS NULL OR v_loser_lose_bonus_date < CURRENT_DATE) THEN
                         UPDATE profiles
                         SET pencils = pencils + 1,
                             rank_lose_bonus_date = CURRENT_DATE,
                             rank_lose_streak = 0
                         WHERE id = v_session.player2_id::uuid;
                         UPDATE game_sessions SET player2_lose_pencil = true WHERE id = p_room_id;
                     END IF;
                 END IF;
             END IF;
        ELSIF v_session.mode = 'normal' THEN
             -- NORMAL MODE: Update Casual Wins/Losses (No MMR)
             IF v_winner ~ '^[0-9a-fA-F-]{36}$' THEN
                 UPDATE profiles SET casual_wins = casual_wins + 1 WHERE id = v_winner::uuid;
             END IF;
             IF v_loser ~ '^[0-9a-fA-F-]{36}$' THEN
                 UPDATE profiles SET casual_losses = casual_losses + 1 WHERE id = v_loser::uuid;
             END IF;
        ELSE
            -- FRIENDLY or PRACTICE MODE: Do NOT update any stats
            -- Just finish the session (already done above)
        END IF;
    END IF;

    -- XP/Level Update (Rank + Normal only)
    IF v_session.mode IN ('rank', 'normal') THEN
        IF v_session.player1_id ~ '^[0-9a-fA-F-]{36}$' THEN
            UPDATE profiles
            SET xp = COALESCE(xp, 0) + (10 + CASE WHEN v_winner = v_session.player1_id THEN 5 ELSE 0 END),
                level = floor((-(45)::numeric + sqrt((45 * 45) + (40 * (COALESCE(xp, 0) + (10 + CASE WHEN v_winner = v_session.player1_id THEN 5 ELSE 0 END))))) / 10) + 1
            WHERE id = v_session.player1_id::uuid;
        END IF;

        IF v_session.player2_id ~ '^[0-9a-fA-F-]{36}$' THEN
            UPDATE profiles
            SET xp = COALESCE(xp, 0) + (10 + CASE WHEN v_winner = v_session.player2_id THEN 5 ELSE 0 END),
                level = floor((-(45)::numeric + sqrt((45 * 45) + (40 * (COALESCE(xp, 0) + (10 + CASE WHEN v_winner = v_session.player2_id THEN 5 ELSE 0 END))))) / 10) + 1
            WHERE id = v_session.player2_id::uuid;
        END IF;
    END IF;

    -- Skill stats: per-round winner gains (rank/normal only, exclude guests/bots)
    IF v_session.mode IN ('rank', 'normal') THEN
        IF v_session.player1_id ~ '^[0-9a-fA-F-]{36}$' THEN
            UPDATE profiles
            SET speed = LEAST(999, COALESCE(speed, 0) + v_p1_speed),
                memory = LEAST(999, COALESCE(memory, 0) + v_p1_memory),
                judgment = LEAST(999, COALESCE(judgment, 0) + v_p1_judgment),
                calculation = LEAST(999, COALESCE(calculation, 0) + v_p1_calculation),
                accuracy = LEAST(999, COALESCE(accuracy, 0) + v_p1_accuracy),
                observation = LEAST(999, COALESCE(observation, 0) + v_p1_observation)
            WHERE id = v_session.player1_id::uuid;
        END IF;

        IF v_session.player2_id ~ '^[0-9a-fA-F-]{36}$' THEN
            UPDATE profiles
            SET speed = LEAST(999, COALESCE(speed, 0) + v_p2_speed),
                memory = LEAST(999, COALESCE(memory, 0) + v_p2_memory),
                judgment = LEAST(999, COALESCE(judgment, 0) + v_p2_judgment),
                calculation = LEAST(999, COALESCE(calculation, 0) + v_p2_calculation),
                accuracy = LEAST(999, COALESCE(accuracy, 0) + v_p2_accuracy),
                observation = LEAST(999, COALESCE(observation, 0) + v_p2_observation)
            WHERE id = v_session.player2_id::uuid;
        END IF;
    END IF;
END;
$_$;


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
        -- NORMAL/FRIENDLY: BO3, RANK: BO5
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
$$;


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
  
  -- Scores (Wins)
  v_p1_wins int;
  v_p2_wins int;
  
  -- Current Points
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
BEGIN
  -- Get current state
  SELECT game_type, status, COALESCE(current_round, 0), player1_score, player2_score, COALESCE(p1_current_score, 0), COALESCE(p2_current_score, 0), mode, player1_id, player2_id, game_types, COALESCE(round_scores, '[]'::jsonb)
  INTO v_current_type, v_status, v_current_round, v_p1_wins, v_p2_wins, v_p1_points, v_p2_points, v_mode, v_p1_id, v_p2_id, v_game_types, v_round_scores
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

  IF v_mode = 'rank' THEN
      v_required_wins := 3;
      v_max_rounds := 5;
  ELSE
      v_required_wins := 2;
      v_max_rounds := 3;
  END IF;

  -- 2. Check Victory Condition (BO3/BO5 + early finish)
  IF v_p1_wins >= v_required_wins OR v_p2_wins >= v_required_wins OR v_current_round >= v_max_rounds THEN
      PERFORM finish_game(p_room_id);
      RETURN;
  END IF;

  -- 3. Calculate Next Round
  v_next_round := v_current_round + 1;
  v_next_round_index := GREATEST(v_next_round - 1, 0);

  -- 4. Pick Next Game Type from preselected game_types to prevent duplicates.
  -- game_types is generated once in start_game for normal/rank/friendly.
  IF array_length(v_game_types, 1) >= v_next_round THEN
      v_next_type := v_game_types[v_next_round];
  END IF;

  -- Fallback for legacy/invalid sessions: pick a type not used in this set yet.
  IF v_next_type IS NULL THEN
      SELECT x
      INTO v_fallback_type
      FROM unnest(v_types) AS x
      WHERE x <> v_current_type
        AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(v_round_scores) AS rs
            WHERE rs->>'game_type' = x
        )
      ORDER BY random()
      LIMIT 1;

      IF v_fallback_type IS NOT NULL THEN
          v_next_type := v_fallback_type;
      ELSE
          v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
      END IF;
  END IF;

  -- Get duration for next game type
  v_duration := get_game_duration(v_next_type);
  
  -- 5. Setup Game Data
  IF v_next_type = 'RPS' THEN
      v_target := v_opts[floor(random()*3 + 1)];
      v_game_data := '{}';
  ELSE
      v_target := null;
      v_game_data := jsonb_build_object('seed', floor(random()*10000));
  END IF;

  -- 6. Update Session -> PLAYING with 8s warmup (4s round_finished + 4s game_desc) + game duration
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


