-- Fix Rank Mode Crash & MMR Logic

-- 1. Add 'mode' column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'game_sessions' AND column_name = 'mode') THEN
        ALTER TABLE game_sessions ADD COLUMN mode text DEFAULT 'normal';
    END IF;
END $$;

-- 2. Update find_match to set mode = 'rank'
CREATE OR REPLACE FUNCTION find_match(p_min_mmr int, p_max_mmr int)
RETURNS uuid AS $$
DECLARE
  v_my_id uuid := auth.uid();
  v_opponent_id uuid;
  v_room_id uuid;
  v_my_mmr int;
BEGIN
  -- Get my current MMR for the queue record
  SELECT mmr INTO v_my_mmr FROM public.profiles WHERE id = v_my_id;

  -- 1. Try to find an opponent
  SELECT player_id INTO v_opponent_id
  FROM matchmaking_queue
  WHERE mmr >= p_min_mmr 
    AND mmr <= p_max_mmr
    AND player_id != v_my_id
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_opponent_id IS NOT NULL THEN
    -- 2. Match Found!
    DELETE FROM matchmaking_queue WHERE player_id IN (v_my_id, v_opponent_id);
    
    -- Create session (Rank Mode)
    INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode)
    VALUES (v_my_id::text, v_opponent_id::text, 'waiting', 0, 'rank')
    RETURNING id INTO v_room_id;
    
    RETURN v_room_id;
  ELSE
    -- 3. No match found, ensure I am in the queue
    INSERT INTO matchmaking_queue (player_id, mmr)
    VALUES (v_my_id, v_my_mmr)
    ON CONFLICT (player_id) DO UPDATE
    SET mmr = v_my_mmr, created_at = now();
    
    RETURN NULL;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update finish_game to handle NULL MMRs & Use mode correctly
CREATE OR REPLACE FUNCTION finish_game(p_room_id uuid)
RETURNS void AS $$
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
    
    -- Totals
    v_p1_total int := 0;
    v_p2_total int := 0;
    v_round jsonb;
BEGIN
    SELECT * INTO v_session FROM game_sessions WHERE id = p_room_id;
    
    IF v_session.status = 'finished' THEN RETURN; END IF;

    -- Reload session scores just in case
    SELECT round_scores INTO v_session.round_scores FROM game_sessions WHERE id = p_room_id;

    -- Calculate Totals
    FOR v_round IN SELECT * FROM jsonb_array_elements(v_session.round_scores)
    LOOP
        v_p1_total := v_p1_total + (v_round->>'p1_score')::int;
        v_p2_total := v_p2_total + (v_round->>'p2_score')::int;
    END LOOP;

    -- Determine Winner
    IF v_p1_total > v_p2_total THEN
        v_winner := v_session.player1_id;
        v_loser := v_session.player2_id;
    ELSIF v_p2_total > v_p1_total THEN
        v_winner := v_session.player2_id;
        v_loser := v_session.player1_id;
    ELSE
        v_is_draw := true;
    END IF;

    -- Update Final Status
    UPDATE game_sessions 
    SET status = 'finished', 
        winner_id = v_winner, 
        end_at = now(),
        player1_score = v_p1_total,
        player2_score = v_p2_total
    WHERE id = p_room_id;

    -- MMR Logic (Only for Rank Mode & Valid Users)
    -- Check if mode exists and is 'rank'
    IF v_session.mode = 'rank' AND v_winner IS NOT NULL AND NOT v_is_draw THEN
        IF v_winner NOT LIKE 'guest_%' AND v_loser NOT LIKE 'guest_%' THEN
             
             -- Safe Fetch with Coalesce
             SELECT COALESCE(mmr, 1000) INTO v_p1_mmr FROM profiles WHERE id = v_session.player1_id::uuid;
             SELECT COALESCE(mmr, 1000) INTO v_p2_mmr FROM profiles WHERE id = v_session.player2_id::uuid;
             
             -- Null check safety (redundant with coalesce but good practice)
             IF v_p1_mmr IS NULL THEN v_p1_mmr := 1000; END IF;
             IF v_p2_mmr IS NULL THEN v_p2_mmr := 1000; END IF;

             -- Elo Calculation
             v_p1_exp := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::numeric / 400.0));
             v_p2_exp := 1.0 / (1.0 + power(10.0, (v_p1_mmr - v_p2_mmr)::numeric / 400.0));

             IF v_winner = v_session.player1_id THEN
                -- P1 Wins
                v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (1 - v_p1_exp));
                v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (0 - v_p2_exp));
                
                UPDATE profiles SET mmr = v_new_p1_mmr, wins = wins + 1 WHERE id = v_session.player1_id::uuid;
                UPDATE profiles SET mmr = v_new_p2_mmr, losses = losses + 1 WHERE id = v_session.player2_id::uuid;
             ELSE
                -- P2 Wins
                v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (0 - v_p1_exp));
                v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (1 - v_p2_exp));
                
                UPDATE profiles SET mmr = v_new_p1_mmr, losses = losses + 1 WHERE id = v_session.player1_id::uuid;
                UPDATE profiles SET mmr = v_new_p2_mmr, wins = wins + 1 WHERE id = v_session.player2_id::uuid;
             END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
