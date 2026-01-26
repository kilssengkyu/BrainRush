-- Update finish_game to handle casual_wins and casual_losses
-- Fix: proper casting of text player_ids to uuid for profiles table updates

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
BEGIN
    SELECT * INTO v_session FROM game_sessions WHERE id = p_room_id;
    
    IF v_session.status = 'finished' THEN RETURN; END IF;

    -- Determine Winner
    IF v_session.player1_score > v_session.player2_score THEN
        v_winner := v_session.player1_id;
        v_loser := v_session.player2_id;
    ELSIF v_session.player2_score > v_session.player1_score THEN
        v_winner := v_session.player2_id;
        v_loser := v_session.player1_id;
    ELSE
        v_is_draw := true;
    END IF;

    UPDATE game_sessions 
    SET status = 'finished', winner_id = v_winner 
    WHERE id = p_room_id;

    -- Stats Update (Only for Valid Users, skip guests)
    IF v_winner IS NOT NULL AND NOT v_is_draw THEN
        IF v_winner NOT LIKE 'guest_%' AND v_loser NOT LIKE 'guest_%' THEN
            
            IF v_session.mode = 'rank' THEN
                -- Rank Mode: Update MMR and Rank Wins/Losses
                -- Cast text ID to uuid for profiles table
                SELECT mmr INTO v_p1_mmr FROM profiles WHERE id = v_session.player1_id::uuid;
                SELECT mmr INTO v_p2_mmr FROM profiles WHERE id = v_session.player2_id::uuid;
                
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

            ELSE
                -- Casual (or Non-Rank) Mode: Update Casual Wins/Losses
                -- Cast v_winner/v_loser (which are text) to uuid
                UPDATE profiles SET casual_wins = casual_wins + 1 WHERE id = v_winner::uuid;
                UPDATE profiles SET casual_losses = casual_losses + 1 WHERE id = v_loser::uuid;
            END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
