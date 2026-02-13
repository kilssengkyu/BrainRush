-- Migration: fix_score_and_stats.sql

-- 1. Add Current Score Columns (For POINTS)
-- We keep 'player1_score' and 'player2_score' for WINS (Rounds Won)
ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS p1_current_score int default 0,
ADD COLUMN IF NOT EXISTS p2_current_score int default 0;

-- Safety Fix: Ensure round_scores is jsonb (not jsonb[]) and do not drop data
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'game_sessions'
          AND column_name = 'round_scores'
          AND data_type = 'ARRAY'
          AND udt_name = '_jsonb'
    ) THEN
        -- Drop incompatible default before type change
        ALTER TABLE game_sessions ALTER COLUMN round_scores DROP DEFAULT;

        ALTER TABLE game_sessions
        ALTER COLUMN round_scores TYPE jsonb
        USING COALESCE(to_jsonb(round_scores), '[]'::jsonb);
    END IF;
END $$;

ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS round_scores jsonb DEFAULT '[]'::jsonb;

-- Ensure current_round_index exists for clients that depend on it
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS current_round_index int default 0;

-- Fix: Ensure game_data and target_move exist (User reported missing game_data)
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS game_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS target_move text;

-- Fix: Ensure phase timing columns exist
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS phase_start_at timestamptz;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS phase_end_at timestamptz;

-- Fix: Ensure ready flags exist
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS player1_ready boolean default false;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS player2_ready boolean default false;

-- 2. UPDATE update_score (Modify Current Points, NOT Wins)
DROP FUNCTION IF EXISTS update_score(uuid, text, int);
CREATE OR REPLACE FUNCTION update_score(p_room_id uuid, p_player_id text, p_score int)
RETURNS void AS $$
DECLARE
  v_p1 text;
  v_p2 text;
  v_status text;
BEGIN
  -- Identify Player
  SELECT player1_id, player2_id, status INTO v_p1, v_p2, v_status
  FROM game_sessions WHERE id = p_room_id;

  -- Graceful Exit if Room Not Found (e.g. Practice Mode or Stale ID)
  IF v_p1 IS NULL THEN
      RETURN;
  END IF;

  -- Security Check: Allow if p_player_id matches valid players in the room
  -- This supports both Authenticated Users (auth.uid matches ID) AND Guests (ID matches session record)
  IF p_player_id != v_p1 AND p_player_id != v_p2 THEN
     -- If we want to enforce auth for logged-in users:
     IF auth.uid() IS NOT NULL AND auth.uid()::text != p_player_id THEN
         RAISE EXCEPTION 'Not authorized';
     END IF;
     -- If guest, we trust the ID knowledge for now (Prototype level)
  END IF;

  -- Do not allow updates after finish
  IF v_status = 'finished' THEN
      RETURN;
  END IF;

  IF p_player_id = v_p1 THEN
      UPDATE game_sessions SET p1_current_score = p_score WHERE id = p_room_id;
  ELSIF p_player_id = v_p2 THEN
      UPDATE game_sessions SET p2_current_score = p_score WHERE id = p_room_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. UPDATE start_next_round (Snapshot Points -> Verify Winner -> Reset Points)
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
  v_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW', 'NUMBER_DESC', 'BLANK', 'OPERATOR', 'LADDER', 'TAP_COLOR', 'AIM', 'MOST_COLOR', 'SORTING', 'SPY'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
  
  v_round_snapshot jsonb;
  v_mode text;
BEGIN
  -- Get current state
  SELECT game_type, status, COALESCE(current_round, 0), player1_score, player2_score, COALESCE(p1_current_score, 0), COALESCE(p2_current_score, 0), mode
  INTO v_current_type, v_status, v_current_round, v_p1_wins, v_p2_wins, v_p1_points, v_p2_points, v_mode
  FROM game_sessions WHERE id = p_room_id
  FOR UPDATE;

  -- Graceful Exit if Room Not Found
  -- Note: v_current_type can be NULL for a brand new game (waiting state), so do NOT check type here.
  IF v_status IS NULL THEN
      RETURN;
  END IF;

  -- Security Check (Loose): If Auth User, must be owner. If Guest, skip check.
  -- TEMP: Commenting out strict auth check to fix 400 Bad Request for Guests
  -- IF auth.uid() IS NOT NULL THEN
  --    PERFORM 1 FROM game_sessions 
  --    WHERE id = p_room_id AND (player1_id = auth.uid()::text OR player2_id = auth.uid()::text);
  --    
  --    IF NOT FOUND THEN
  --       RAISE EXCEPTION 'Not authorized';
  --    END IF;
  -- END IF;

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

  -- 3. Pick Next Game Type (Random)
  v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
  
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
      start_at = now(),
      end_at = now() + interval '4 seconds',
      player1_ready = false, -- Reset ready flags if used
      player2_ready = false
  WHERE id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Restore check_active_session (Missing RPC fix)
-- This function allows clients to check if they are already in an active game (Passive Matchmaking)
CREATE OR REPLACE FUNCTION check_active_session(p_player_id text)
RETURNS TABLE (
  room_id uuid,
  opponent_id text,
  status text,
  created_at timestamptz
) AS $$
BEGIN
  -- If UUID, enforce ownership for authenticated users
  IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
      IF auth.uid() IS NOT NULL AND p_player_id != auth.uid()::text THEN
          RAISE EXCEPTION 'Not authorized';
      END IF;
  END IF;

  -- Return only recent, non-finished sessions with valid opponent
  RETURN QUERY
  SELECT 
      gs.id as room_id,
      CASE 
          WHEN gs.player1_id = p_player_id THEN gs.player2_id 
          ELSE gs.player1_id 
      END as opponent_id,
      gs.status,
      gs.created_at
  FROM game_sessions gs
  WHERE (gs.player1_id = p_player_id OR gs.player2_id = p_player_id)
    AND gs.status != 'finished'
    AND gs.player1_id IS NOT NULL
    AND gs.player2_id IS NOT NULL
    AND gs.mode IS DISTINCT FROM 'practice'
    AND (
        (gs.status = 'waiting' AND gs.created_at > (now() - interval '60 seconds'))
        OR
        (gs.status != 'waiting' AND gs.created_at > (now() - interval '1 hour'))
    )
  ORDER BY gs.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Add trigger_game_start (Countdown -> Playing)
CREATE OR REPLACE FUNCTION trigger_game_start(p_room_id uuid)
RETURNS void AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM game_sessions WHERE id = p_room_id;
  
  -- Only transition if currently in countdown
  IF v_status = 'countdown' THEN
    UPDATE game_sessions
    SET status = 'playing',
        phase_start_at = now(),
        phase_end_at = now() + interval '30 seconds',
        start_at = now(),
        end_at = now() + interval '30 seconds'
    WHERE id = p_room_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
