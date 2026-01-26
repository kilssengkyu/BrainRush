-- FORCE OVERWRITE of all Game Logic to ensure Practice Mode works
-- combine all logic into one consistent set of functions.

-- 1. Create Practice Session
CREATE OR REPLACE FUNCTION create_practice_session(p_player_id text, p_game_type text)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Insert with mode='practice'
  INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode, game_type)
  VALUES (p_player_id, 'practice_solo', 'waiting', 0, 'practice', p_game_type)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Start Game (Updated with Current Round = 1)
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
        'SLIDER', 'ARROW'
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
            game_types = ARRAY[v_current_type], 
            current_round_index = 0,
            current_round = 1, -- Explicitly set to 1
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


-- 3. Start Next Round (The CRITICAL Fix)
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
  v_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
BEGIN
  -- Get current state
  SELECT game_type, status, current_round, player1_score, player2_score, mode
  INTO v_current_type, v_status, v_current_round, v_p1_score, v_p2_score, v_mode
  FROM game_sessions WHERE id = p_room_id;

  -- CRITICAL: Check Practice Mode Termination
  IF v_mode = 'practice' THEN
      -- In Practice, if we are in Round 1 (or more), we FINISH immediately.
      -- We do NOT start a next round.
      UPDATE game_sessions SET status = 'finished', end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  -- Normal Victory Check
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


-- 3.5. Next Round (Practice Guard for 3-Game Set Logic)
-- NOTE: The client calls next_round (not start_next_round), so we must guard practice here.
CREATE OR REPLACE FUNCTION next_round(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_session record;
    v_new_type text;
    v_new_index int;
    v_seed text;
    v_round_record jsonb;
BEGIN
    SELECT * INTO v_session FROM game_sessions WHERE id = p_room_id FOR UPDATE;

    -- Practice Mode: finish immediately after Round 1 (or on timeout)
    IF v_session.mode = 'practice' THEN
        UPDATE game_sessions
        SET status = 'finished',
            end_at = now()
        WHERE id = p_room_id;
        RETURN;
    END IF;

    -- Safety check
    IF v_session.status = 'finished' THEN RETURN; END IF;

    -- Record scores from the JUST FINISHED round
    v_round_record := jsonb_build_object(
        'round', v_session.current_round_index + 1,
        'p1_score', v_session.player1_score,
        'p2_score', v_session.player2_score,
        'game_type', v_session.game_type
    );

    UPDATE game_sessions 
    SET round_scores = round_scores || v_round_record,
        player1_score = 0,
        player2_score = 0
    WHERE id = p_room_id;

    -- Check if we have more rounds
    IF v_session.current_round_index < 2 THEN
        v_new_index := v_session.current_round_index + 1;
        v_new_type := v_session.game_types[v_new_index + 1];
        v_seed := md5(random()::text);

        UPDATE game_sessions
        SET current_round_index = v_new_index,
            game_type = v_new_type,
            seed = v_seed,
            start_at = now() + interval '6 seconds',
            end_at = now() + interval '36 seconds'
        WHERE id = p_room_id;
    ELSE
        PERFORM finish_game(p_room_id);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Submit Move (Practice Logic)
CREATE OR REPLACE FUNCTION submit_move(p_room_id uuid, p_player_id text, p_move text)
RETURNS void AS $$
DECLARE
  v_game_type text;
  v_round int;
  v_target text;
  v_mode text;
  v_opts text[] := ARRAY['rock','paper','scissors'];
  -- Standard vars
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
                 -- WIN: Finish immediately
                 UPDATE game_sessions 
                 SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
                 WHERE id = p_room_id;
              ELSE
                 -- LOSE: Finish immediately (or retry? decided on finish)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
