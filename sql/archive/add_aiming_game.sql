-- Add AIM game to the game rotation
-- Updating game_sessions constraint, start_game, start_next_round, and submit_move functions

-- 1. Update Game Type Constraint
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
    'AIM'  -- Added AIM
));

-- 2. Update Start Game
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    v_mode text;
    v_current_type text;
    v_all_types text[] := ARRAY[
        'RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 
        'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR', 
        'UPDOWN', 'SEQUENCE_NORMAL', 'NUMBER_DESC', 
        'SLIDER', 'ARROW', 'BLANK', 'OPERATOR', 'LADDER', 'TAP_COLOR', 'AIM'
    ];
    v_selected_types text[];
    v_first_type text;
BEGIN
    SELECT mode, game_type INTO v_mode, v_current_type FROM game_sessions WHERE id = p_room_id;
    v_seed := md5(random()::text);

    IF v_mode = 'practice' THEN
        -- PRACTICE: Start immediately, Round 1 (will finish after this round)
        UPDATE game_sessions
        SET status = 'playing',
        -- Use the Aiming Game if currently set (which is passed as current_type) or fallback
            game_types = ARRAY[v_current_type], 
            current_round_index = 0,
            current_round = 1, 
            seed = v_seed,
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '34 seconds',
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

        UPDATE game_sessions
        SET status = 'playing',
            game_types = v_selected_types,
            current_round_index = 0,
            current_round = 1,
            game_type = v_first_type,
            seed = v_seed,
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '34 seconds',
            round_scores = '[]'::jsonb
        WHERE id = p_room_id AND status = 'waiting';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Update Start Next Round
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
  -- Added 'AIM' here
  v_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW', 'BLANK', 'OPERATOR', 'LADDER', 'TAP_COLOR', 'AIM'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
BEGIN
  -- Get current state
  SELECT game_type, status, current_round, player1_score, player2_score, mode
  INTO v_current_type, v_status, v_current_round, v_p1_score, v_p2_score, v_mode
  FROM game_sessions WHERE id = p_room_id;

  -- CRITICAL: Check Practice Mode Termination
  IF v_mode = 'practice' THEN
      UPDATE game_sessions SET status = 'finished', end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  -- Normal Victory Check (Best of 5 -> First to 3? Or just 3 rounds total?)
  -- Logic: If it's a fixed 3-round game, check if rounds exhaust.
  -- Existing logic seems to imply "First to 3" OR "3 Rounds Total"?
  -- Based on code: v_p1_score >= 3. Let's keep it.
  IF v_p1_score >= 3 or v_p2_score >= 3 THEN
      UPDATE game_sessions SET status = 'finished', end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  -- Pick Next Game Type (Random for normal)
  v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
  
  -- Setup Game Data
  IF v_next_type = 'RPS' THEN
      v_target := v_opts[floor(random()*3 + 1)];
      v_game_data := '{}';
  ELSE
      v_target := null;
      v_game_data := jsonb_build_object('seed', floor(random()*10000));
  END IF;

  -- Increment Round
  v_next_round := v_current_round + 1;

  -- Update Session
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

-- 4. Update Submit Move (For safety, although AIM might use direct score updates)
CREATE OR REPLACE FUNCTION submit_move(p_room_id uuid, p_player_id text, p_move text)
RETURNS void AS $$
DECLARE
  v_game_type text;
  v_round int;
  v_target text;
  v_mode text;
  v_opts text[] := ARRAY['rock','paper','scissors'];
  v_p1 text;
  v_p2 text;
  v_p1_move_standard text;
  v_p2_move_standard text;
  v_p1_time int;
  v_p2_time int;
BEGIN
  SELECT game_type, current_round, target_move, mode
  INTO v_game_type, v_round, v_target, v_mode
  FROM game_sessions WHERE id = p_room_id;

  INSERT INTO game_moves (room_id, player_id, round, move)
  VALUES (p_room_id, p_player_id, v_round, p_move);
  
  -- PRACTICE LOGIC
  IF v_mode = 'practice' THEN
      -- Immediate Finish on Success
      IF v_game_type = 'RPS' THEN
          DECLARE
              v_win_move text;
          BEGIN
              IF v_target = 'rock' THEN v_win_move := 'paper';
              ELSIF v_target = 'paper' THEN v_win_move := 'scissors';
              ELSE v_win_move := 'rock';
              END IF;

              IF p_move = v_win_move THEN
                 UPDATE game_sessions 
                 SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
                 WHERE id = p_room_id;
              ELSE
                 UPDATE game_sessions 
                 SET status = 'finished', end_at = now() 
                 WHERE id = p_room_id;
              END IF;
          END;
          RETURN;
      ELSE
          -- Time Attack Games: "DONE:xxx"
          IF p_move LIKE 'DONE:%' THEN
              UPDATE game_sessions 
              SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
              WHERE id = p_room_id;
              RETURN;
          END IF;
      END IF;
      RETURN;
  END IF;

  -- STANDARD LOGIC (For Normal/Rank)
  SELECT player1_id, player2_id INTO v_p1, v_p2 FROM game_sessions WHERE id = p_room_id;

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
                UPDATE game_sessions SET player1_score = player1_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
             ELSE
                UPDATE game_sessions SET player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
             END IF;
          END IF;
      END;
  -- Added AIM to the list (though AIM works primarily via update_score, adding here for completeness if we switch to move-based later)
  ELSIF v_game_type LIKE 'NUMBER%' OR v_game_type IN ('MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW', 'BLANK', 'OPERATOR', 'LADDER', 'TAP_COLOR', 'AIM') THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
