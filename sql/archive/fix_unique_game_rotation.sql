-- Ensure next rounds use preselected unique game_types (avoid duplicate games in 3-round set)

CREATE OR REPLACE FUNCTION start_next_round(p_room_id uuid)
RETURNS void AS $$
DECLARE
  v_next_type text;
  v_current_type text;
  v_status text;
  v_current_round int;
  v_next_round int;
  v_next_round_index int;
  
  -- Scores (Wins)
  v_p1_wins int;
  v_p2_wins int;
  
  -- Current Points
  v_p1_points int;
  v_p2_points int;
  
  v_game_data jsonb;
  v_target text;
  v_game_types text[];
  v_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW', 'NUMBER_DESC', 'BLANK', 'OPERATOR', 'LADDER', 'TAP_COLOR', 'AIM', 'MOST_COLOR', 'SORTING', 'SPY'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
  
  v_round_snapshot jsonb;
  v_mode text;
BEGIN
  -- Get current state
  SELECT game_type, status, COALESCE(current_round, 0), player1_score, player2_score, COALESCE(p1_current_score, 0), COALESCE(p2_current_score, 0), mode, game_types
  INTO v_current_type, v_status, v_current_round, v_p1_wins, v_p2_wins, v_p1_points, v_p2_points, v_mode, v_game_types
  FROM game_sessions WHERE id = p_room_id
  FOR UPDATE;

  -- Graceful Exit if Room Not Found
  -- Note: v_current_type can be NULL for a brand new game (waiting state), so do NOT check type here.
  IF v_status IS NULL THEN
      RETURN;
  END IF;

  IF v_status = 'finished' THEN
      RETURN;
  END IF;

  -- Race Condition Fix: If already in countdown (someone else triggered it), do not advance round again.
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
      ELSE
          -- Draw? No wins incremented
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

  -- 3. Pick Next Game Type (Use preselected list to avoid duplicates)
  v_next_round := v_current_round + 1;
  IF v_game_types IS NOT NULL AND array_length(v_game_types, 1) >= v_next_round THEN
      v_next_type := v_game_types[v_next_round];
  ELSE
      v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
  END IF;
  
  -- 4. Setup Game Data
  IF v_next_type = 'RPS' THEN
      v_target := v_opts[floor(random()*3 + 1)];
      v_game_data := '{}';
  ELSE
      v_target := null;
      v_game_data := jsonb_build_object('seed', floor(random()*10000));
  END IF;

  -- 5. Calculate Next Round
  v_next_round_index := GREATEST(v_next_round - 1, 0);

  -- 6. Update Session -> COUNTDOWN State
  UPDATE game_sessions
  SET status = 'countdown',
      current_round = v_next_round,
      current_round_index = v_next_round_index,
      game_type = v_next_type,
      game_data = v_game_data,
      target_move = v_target,
      phase_start_at = now(),
      phase_end_at = now() + interval '4 seconds', -- 4s Prep time
      start_at = now() + interval '4 seconds',
      end_at = now() + interval '4 seconds',
      player1_ready = false, -- Reset ready flags if used
      player2_ready = false
  WHERE id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
