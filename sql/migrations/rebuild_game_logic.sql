-- REBUILD GAME LOGIC: 3-Game Set Structure
-- This migration updates the game_sessions table and related functions to support 3-round matches.

-- 1. Alter game_sessions table
-- We add columns to track the set of games and round progress.
ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS game_types text[], -- Array of game types for this match
ADD COLUMN IF NOT EXISTS current_round_index int DEFAULT 0, -- 0, 1, 2
ADD COLUMN IF NOT EXISTS round_scores jsonb DEFAULT '[]'::jsonb; -- History: [{p1: 100, p2: 120}, ...]

-- 2. Update start_game RPC
-- Selects 3 distinct random games and initializes the session.
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    v_all_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE'];
    v_selected_types text[];
    v_first_type text;
BEGIN
    -- Select 3 unique random games using a more robust method
    SELECT ARRAY(
        SELECT x 
        FROM unnest(v_all_types) AS x 
        ORDER BY random() 
        LIMIT 3
    ) INTO v_selected_types;

    v_first_type := v_selected_types[1];
    v_seed := md5(random()::text);

    UPDATE game_sessions
    SET status = 'playing',
        game_types = v_selected_types,
        current_round_index = 0,
        game_type = v_first_type,
        seed = v_seed,
        start_at = now() + interval '4 seconds',
        end_at = now() + interval '34 seconds',
        round_scores = '[]'::jsonb
    WHERE id = p_room_id AND status = 'waiting';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Create/Update start_next_round
-- Logic to handle transitions between rounds.
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
        player1_score = 0, -- RESET SCORES FOR NEXT ROUND
        player2_score = 0
    WHERE id = p_room_id;

    -- Check if we have more rounds
    -- current_round_index is 0-based. 3 games means indices 0, 1, 2.
    IF v_session.current_round_index < 2 THEN
        -- Setup Next Round
        v_new_index := v_session.current_round_index + 1;
        v_new_type := v_session.game_types[v_new_index + 1]; -- Postgres arrays are 1-based
        v_seed := md5(random()::text);

        UPDATE game_sessions
        SET current_round_index = v_new_index,
            game_type = v_new_type,
            seed = v_seed,
            -- Add 6s delay for "Round Result" + "Next Round Splash"
            start_at = now() + interval '6 seconds',
            end_at = now() + interval '36 seconds' -- 30s + 6s
        WHERE id = p_room_id;
    ELSE
        -- No more rounds => Finish Game
        PERFORM finish_game(p_room_id);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Update finish_game
-- Calculate TOTAL scores from round_scores history + last round
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
    -- v_last_round_record jsonb; -- Removed to prevent duplicate
BEGIN
    SELECT * INTO v_session FROM game_sessions WHERE id = p_room_id;
    
    IF v_session.status = 'finished' THEN RETURN; END IF;

    -- Note: 'next_round' ALREADY pushes the last round's score to 'round_scores' before calling 'finish_game'.
    -- So we just need to sum up what's in 'round_scores'.
    
    -- Reload session to be sure (though 'v_session' above might be stale if next_round updated it in the same transaction context? 
    -- Actually, since next_round calls finish_game, the changes in next_round are visible if we query again or pass it.
    -- But PL/PGSQL variable 'v_session' is a snapshot at SELECT time.
    -- We need to re-fetch round_scores or trust it's there.
    
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

    -- Update Final Status (Store Totals in p1_score/p2_score for simple display if needed, but round_scores has details)
    -- Actually, let's keep p1_score/p2_score as the LAST round score? 
    -- User said "Show result ... 1 round score, 2 round score, 3 round score ... and final total"
    -- It's safer to store TOTAL in p1_score/p2_score at the end, so standard logic (like list views) shows total.
    UPDATE game_sessions 
    SET status = 'finished', 
        winner_id = v_winner, 
        end_at = now(),
        player1_score = v_p1_total,
        player2_score = v_p2_total
    WHERE id = p_room_id;

    -- MMR Logic (Only for Rank Mode & Valid Users)
    IF v_session.mode = 'rank' AND v_winner IS NOT NULL AND NOT v_is_draw THEN
        IF v_winner NOT LIKE 'guest_%' AND v_loser NOT LIKE 'guest_%' THEN
             
             SELECT mmr INTO v_p1_mmr FROM profiles WHERE id = v_session.player1_id;
             SELECT mmr INTO v_p2_mmr FROM profiles WHERE id = v_session.player2_id;
             
             v_p1_exp := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::numeric / 400.0));
             v_p2_exp := 1.0 / (1.0 + power(10.0, (v_p1_mmr - v_p2_mmr)::numeric / 400.0));

             IF v_winner = v_session.player1_id THEN
                -- P1 Wins
                v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (1 - v_p1_exp));
                v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (0 - v_p2_exp));
                
                UPDATE profiles SET mmr = v_new_p1_mmr, wins = wins + 1 WHERE id = v_session.player1_id;
                UPDATE profiles SET mmr = v_new_p2_mmr, losses = losses + 1 WHERE id = v_session.player2_id;
             ELSE
                -- P2 Wins
                v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (0 - v_p1_exp));
                v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (1 - v_p2_exp));
                
                UPDATE profiles SET mmr = v_new_p1_mmr, losses = losses + 1 WHERE id = v_session.player1_id;
                UPDATE profiles SET mmr = v_new_p2_mmr, wins = wins + 1 WHERE id = v_session.player2_id;
             END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
