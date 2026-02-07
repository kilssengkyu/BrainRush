-- Migration: add_skill_stats.sql
-- Add player skill stats and apply per-round stat gains on win

-- 1) Add columns to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS speed int DEFAULT 0,
ADD COLUMN IF NOT EXISTS memory int DEFAULT 0,
ADD COLUMN IF NOT EXISTS judgment int DEFAULT 0,
ADD COLUMN IF NOT EXISTS calculation int DEFAULT 0,
ADD COLUMN IF NOT EXISTS accuracy int DEFAULT 0,
ADD COLUMN IF NOT EXISTS observation int DEFAULT 0;

UPDATE public.profiles
SET speed = COALESCE(speed, 0),
    memory = COALESCE(memory, 0),
    judgment = COALESCE(judgment, 0),
    calculation = COALESCE(calculation, 0),
    accuracy = COALESCE(accuracy, 0),
    observation = COALESCE(observation, 0)
WHERE speed IS NULL
   OR memory IS NULL
   OR judgment IS NULL
   OR calculation IS NULL
   OR accuracy IS NULL
   OR observation IS NULL;

-- 2) Stat increment mapping (primary +2, secondary +1)
CREATE OR REPLACE FUNCTION stat_increments(p_game_type text)
RETURNS TABLE (
    speed int,
    memory int,
    judgment int,
    calculation int,
    accuracy int,
    observation int
) AS $$
DECLARE
    v_speed int := 0;
    v_memory int := 0;
    v_judgment int := 0;
    v_calculation int := 0;
    v_accuracy int := 0;
    v_observation int := 0;
BEGIN
    CASE p_game_type
        WHEN 'AIM' THEN v_speed := 2; v_accuracy := 1;
        WHEN 'RPS' THEN v_speed := 2; v_judgment := 1;
        WHEN 'UPDOWN' THEN v_judgment := 2; v_speed := 1;
        WHEN 'ARROW' THEN v_speed := 2; v_judgment := 1;
        WHEN 'SLIDER' THEN v_accuracy := 2; v_speed := 1;
        WHEN 'MEMORY' THEN v_memory := 2; v_accuracy := 1;
        WHEN 'SEQUENCE' THEN v_memory := 2; v_accuracy := 1;
        WHEN 'SEQUENCE_NORMAL' THEN v_memory := 2; v_accuracy := 1;
        WHEN 'SPY' THEN v_memory := 2; v_observation := 1;
        WHEN 'PAIR' THEN v_memory := 2; v_observation := 1;
        WHEN 'COLOR' THEN v_observation := 2; v_accuracy := 1;
        WHEN 'MOST_COLOR' THEN v_observation := 2; v_judgment := 1;
        WHEN 'TAP_COLOR' THEN v_observation := 2; v_speed := 1;
        WHEN 'MATH' THEN v_calculation := 2; v_accuracy := 1;
        WHEN 'TEN' THEN v_calculation := 2; v_judgment := 1;
        WHEN 'BLANK' THEN v_calculation := 2; v_accuracy := 1;
        WHEN 'OPERATOR' THEN v_calculation := 2; v_judgment := 1;
        WHEN 'LARGEST' THEN v_calculation := 2; v_judgment := 1;
        WHEN 'NUMBER' THEN v_accuracy := 2; v_judgment := 1;
        WHEN 'NUMBER_DESC' THEN v_accuracy := 2; v_judgment := 1;
        WHEN 'NUMBER_ASC' THEN v_accuracy := 2; v_judgment := 1;
        WHEN 'SORTING' THEN v_accuracy := 2; v_judgment := 1;
        WHEN 'LADDER' THEN v_judgment := 2; v_accuracy := 1;
        WHEN 'PATH' THEN v_speed := 2; v_judgment := 1;
        WHEN 'BALLS' THEN v_observation := 2; v_accuracy := 1;
        ELSE
            -- no-op
    END CASE;

    RETURN QUERY SELECT v_speed, v_memory, v_judgment, v_calculation, v_accuracy, v_observation;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3) Update finish_game to apply per-round stat gains
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
            SELECT * INTO v_inc FROM stat_increments(v_round_type);
            v_p1_speed := v_p1_speed + v_inc.speed;
            v_p1_memory := v_p1_memory + v_inc.memory;
            v_p1_judgment := v_p1_judgment + v_inc.judgment;
            v_p1_calculation := v_p1_calculation + v_inc.calculation;
            v_p1_accuracy := v_p1_accuracy + v_inc.accuracy;
            v_p1_observation := v_p1_observation + v_inc.observation;
        ELSIF v_round_winner = 'p2' THEN
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
             -- RANK MODE: Update MMR + Standard Wins/Losses
             IF v_winner NOT LIKE 'guest_%' AND v_loser NOT LIKE 'guest_%' THEN
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
             -- Only for real users
             IF v_winner NOT LIKE 'guest_%' THEN
                 UPDATE profiles SET casual_wins = casual_wins + 1 WHERE id = v_winner::uuid;
             END IF;
             IF v_loser NOT LIKE 'guest_%' THEN
                 UPDATE profiles SET casual_losses = casual_losses + 1 WHERE id = v_loser::uuid;
             END IF;
        ELSE
            -- FRIENDLY or PRACTICE MODE: Do NOT update any stats
            -- Just finish the session (already done above)
        END IF;
    END IF;

    -- Skill stats: per-round winner gains (rank/normal only, exclude guests)
    IF v_session.mode IN ('rank', 'normal') THEN
        IF v_session.player1_id NOT LIKE 'guest_%' THEN
            UPDATE profiles
            SET speed = LEAST(999, COALESCE(speed, 0) + v_p1_speed),
                memory = LEAST(999, COALESCE(memory, 0) + v_p1_memory),
                judgment = LEAST(999, COALESCE(judgment, 0) + v_p1_judgment),
                calculation = LEAST(999, COALESCE(calculation, 0) + v_p1_calculation),
                accuracy = LEAST(999, COALESCE(accuracy, 0) + v_p1_accuracy),
                observation = LEAST(999, COALESCE(observation, 0) + v_p1_observation)
            WHERE id = v_session.player1_id::uuid;
        END IF;

        IF v_session.player2_id NOT LIKE 'guest_%' THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
