-- Practice Mode Logic (Solo)

-- 1. Create Practice Session RPC
CREATE OR REPLACE FUNCTION create_practice_session(p_player_id text, p_game_type text)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Insert session with mode='practice' and player2='practice_solo'
  -- Single round logic will be handled in start_next_round (First to 1?)
  INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode, game_type)
  VALUES (p_player_id, 'practice_solo', 'waiting', 0, 'practice', p_game_type)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Update start_next_round
-- For Practice: Just start the chosen game type.
CREATE OR REPLACE FUNCTION start_next_round(p_room_id uuid)
RETURNS void AS $$
DECLARE
  v_next_type text;
  v_current_type text;
  v_status text;
  v_current_round int;
  v_next_round int;
  v_p1_score int;
  v_p2_score int;
  v_game_data jsonb;
  v_target text;
  v_mode text;
  v_types text[] := ARRAY['RPS', 'NUMBER_ASC', 'NUMBER_DESC', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
BEGIN
  -- Get current state
  SELECT game_type, status, current_round, player1_score, player2_score, mode
  INTO v_current_type, v_status, v_current_round, v_p1_score, v_p2_score, v_mode
  FROM game_sessions WHERE id = p_room_id;

  -- PRACTICE MODE: Single Round Limit
  IF v_mode = 'practice' AND v_current_round >= 1 THEN
      -- Already played 1 round? End it.
      UPDATE game_sessions SET status = 'finished', end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  -- 0. Check Victory Condition (Standard)
  IF v_p1_score >= 3 or v_p2_score >= 3 THEN
      UPDATE game_sessions SET status = 'finished', end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  -- 1. Pick Game Type
  IF v_mode = 'practice' THEN
      v_next_type := v_current_type; -- Keep same game type (as set in create)
  ELSE
      v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
  END IF;
  
  -- 2. Setup Game Data
  IF v_next_type = 'RPS' THEN
      v_target := v_opts[floor(random()*3 + 1)];
      v_game_data := '{}';
  ELSE
      v_target := null;
      v_game_data := jsonb_build_object('seed', floor(random()*10000));
  END IF;

  -- 3. Calculate Next Round
  IF v_status = 'waiting' THEN
      v_next_round := 1;
  ELSE
      v_next_round := v_current_round + 1;
  END IF;

  -- 4. Update Session -> COUNTDOWN State (3 Seconds)
  UPDATE game_sessions
  SET status = 'countdown',
      current_round = v_next_round,
      game_type = v_next_type,
      game_data = v_game_data,
      target_move = v_target,
      phase_start_at = now(),
      phase_end_at = now() + interval '3 seconds'
  WHERE id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Update submit_move (Solo Logic)
CREATE OR REPLACE FUNCTION submit_move(p_room_id uuid, p_player_id text, p_move text)
RETURNS void AS $$
DECLARE
  v_game_type text;
  v_round int;
  v_target text;
  v_mode text;
  
  -- Solo vars
  v_p1_move text;
  
  v_opts text[] := ARRAY['rock','paper','scissors'];
BEGIN
  -- Get current context
  SELECT game_type, current_round, target_move, mode
  INTO v_game_type, v_round, v_target, v_mode
  FROM game_sessions WHERE id = p_room_id;

  -- 1. Log the move
  INSERT INTO game_moves (room_id, player_id, round, move)
  VALUES (p_room_id, p_player_id, v_round, p_move);
  
  -- PRACTICE SOLO LOGIC
  IF v_mode = 'practice' THEN
      -- If RPS, we still need target matching logic
      IF v_game_type = 'RPS' THEN
          DECLARE
              v_win_move text;
          BEGIN
              IF v_target = 'rock' THEN v_win_move := 'paper';
              ELSIF v_target = 'paper' THEN v_win_move := 'scissors';
              ELSE v_win_move := 'rock';
              END IF;

              IF p_move = v_win_move THEN
                 -- Player Won (Solved)
                 UPDATE game_sessions 
                 SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
                 WHERE id = p_room_id;
              ELSE
                 -- Wrong move? In practice, maybe allow retry or fail?
                 -- Standard RPS logic: wrong move = nothing happens or lost?
                 -- In 'race' games, wrong move isn't usually sent.
                 -- In RPS, 'p_move' is the choice.
                 -- If wrong choice, instant Loss? Or Draw?
                 -- Let's say: Practice RPS is "Win only". If lose, just finish with 0 score.
                 UPDATE game_sessions 
                 SET status = 'finished', end_at = now()
                 WHERE id = p_room_id AND status = 'playing';
              END IF;
          END;
          RETURN;

      ELSE
          -- NUMBER / PUZZLE GAMES (Solo)
          -- Move is "DONE:<time>"
          IF p_move LIKE 'DONE:%' THEN
              -- Extract Score/Time?
              -- For Solo, we just finish the game immediately.
              UPDATE game_sessions 
              SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
              WHERE id = p_room_id;
              
              RETURN;
          END IF;
      END IF;
  END IF;

  -- STANDARD MULTIPLAYER LOGIC (Existing code for non-practice)
  -- (We need to keep this for Normal/Rank modes)
  
  -- 2. Evaluate Logic based on Game Type (Standard Logic)
  DECLARE
      v_p1 text;
      v_p2 text;
      v_p1_move_standard text;
      v_p2_move_standard text;
      v_p1_time int;
      v_p2_time int;
  BEGIN
      SELECT player1_id, player2_id INTO v_p1, v_p2 FROM game_sessions WHERE id = p_room_id;

      -- Use separate vars to avoid confusion with solo logic
      
      -- === RPS Logic ===
      IF v_game_type = 'RPS' THEN
          DECLARE
              v_win_move_std text;
          BEGIN
              IF v_target = 'rock' THEN v_win_move_std := 'paper';
              ELSIF v_target = 'paper' THEN v_win_move_std := 'scissors';
              ELSE v_win_move_std := 'rock';
              END IF;

              IF p_move = v_win_move_std THEN
                 IF p_player_id = v_p1 THEN
                    UPDATE game_sessions 
                    SET player1_score = player1_score + 1, status = 'round_end', phase_end_at = now() 
                    WHERE id = p_room_id AND status = 'playing';
                 ELSE
                    UPDATE game_sessions 
                    SET player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() 
                    WHERE id = p_room_id AND status = 'playing';
                 END IF;
              END IF;
          END;

      -- === NUMBER/PUZZLE Logic (Race) ===
      ELSIF v_game_type LIKE 'NUMBER%' OR v_game_type IN ('MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW') THEN
          
          SELECT move INTO v_p1_move_standard FROM game_moves WHERE room_id = p_room_id AND round = v_round AND player_id = v_p1 AND move LIKE 'DONE:%' LIMIT 1;
          SELECT move INTO v_p2_move_standard FROM game_moves WHERE room_id = p_room_id AND round = v_round AND player_id = v_p2 AND move LIKE 'DONE:%' LIMIT 1;

          IF v_p1_move_standard IS NOT NULL AND v_p2_move_standard IS NOT NULL THEN
              v_p1_time := cast(split_part(v_p1_move_standard, ':', 2) AS int);
              v_p2_time := cast(split_part(v_p2_move_standard, ':', 2) AS int);

              IF v_p1_time < v_p2_time THEN
                 UPDATE game_sessions SET player1_score = player1_score + 3, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
              ELSIF v_p2_time < v_p1_time THEN
                 UPDATE game_sessions SET player2_score = player2_score + 3, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
              ELSE
                 UPDATE game_sessions SET player1_score = player1_score + 1, player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
              END IF;
           ELSE
              UPDATE game_sessions SET phase_end_at = now() + interval '500 milliseconds' WHERE id = p_room_id;
          END IF;
      END IF;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
