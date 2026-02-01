-- Add XP/Level fields for player progression
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS xp int NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS level int NOT NULL DEFAULT 1;

-- Update finish_game to grant XP and maintain level
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
    
    v_p1_total int := 0;
    v_p2_total int := 0;
    v_round jsonb;
BEGIN
    -- [SECURE] Caller Check
    IF NOT EXISTS (SELECT 1 FROM game_sessions WHERE id = p_room_id 
        AND (player1_id = auth.uid()::text OR player2_id = auth.uid()::text)) THEN
       RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT * INTO v_session FROM game_sessions WHERE id = p_room_id;
    
    -- Status check
    IF v_session.status = 'finished' THEN RETURN; END IF;

    -- Calculate Totals
    SELECT round_scores INTO v_session.round_scores FROM game_sessions WHERE id = p_room_id;

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

    -- Update Session
    UPDATE game_sessions 
    SET status = 'finished', 
        winner_id = v_winner, 
        end_at = now(),
        player1_score = v_p1_total,
        player2_score = v_p2_total
    WHERE id = p_room_id;

    -- STATS UPDATE LOGIC
    IF v_winner IS NOT NULL AND NOT v_is_draw THEN
        IF v_session.mode = 'rank' THEN
             -- RANK MODE: Update MMR + Standard Wins/Losses (only for real users)
             IF v_session.player1_id ~ '^[0-9a-fA-F-]{36}$' AND v_session.player2_id ~ '^[0-9a-fA-F-]{36}$' THEN
                 SELECT mmr INTO v_p1_mmr FROM profiles WHERE id = v_session.player1_id::uuid;
                 SELECT mmr INTO v_p2_mmr FROM profiles WHERE id = v_session.player2_id::uuid;
                 
                 v_p1_exp := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::numeric / 400.0));
                 v_p2_exp := 1.0 / (1.0 + power(10.0, (v_p1_mmr - v_p2_mmr)::numeric / 400.0));

                 IF v_winner = v_session.player1_id::text THEN
                    v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (1 - v_p1_exp));
                    v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (0 - v_p2_exp));
                    
                    UPDATE profiles SET mmr = v_new_p1_mmr, wins = wins + 1 WHERE id = v_session.player1_id::uuid;
                    UPDATE profiles SET mmr = v_new_p2_mmr, losses = losses + 1 WHERE id = v_session.player2_id::uuid;
                 ELSE
                    v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (0 - v_p1_exp));
                    v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (1 - v_p2_exp));
                    
                    UPDATE profiles SET mmr = v_new_p1_mmr, losses = losses + 1 WHERE id = v_session.player1_id::uuid;
                    UPDATE profiles SET mmr = v_new_p2_mmr, wins = wins + 1 WHERE id = v_session.player2_id::uuid;
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
