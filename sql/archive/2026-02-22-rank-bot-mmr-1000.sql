CREATE OR REPLACE FUNCTION public.finish_game(p_room_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
    v_p1_delta int := 0;
    v_p2_delta int := 0;
    v_p1_is_real boolean := false;
    v_p2_is_real boolean := false;

    v_p1_total int := 0;
    v_p2_total int := 0;
    v_round jsonb;

    -- Streak variables
    v_winner_streak int;
    v_winner_streak_at timestamptz;
    v_loser_lose_streak int;
    v_loser_lose_bonus_date date;
    v_streak_bonus int := 0;

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
             -- RANK MODE: allow bot matches by treating bot MMR as fixed 1000
             v_p1_is_real := v_session.player1_id ~ '^[0-9a-fA-F-]{36}$';
             v_p2_is_real := v_session.player2_id ~ '^[0-9a-fA-F-]{36}$';
             v_streak_bonus := 0;

             IF v_p1_is_real OR v_p2_is_real THEN
                 IF v_p1_is_real THEN
                     SELECT mmr INTO v_p1_mmr FROM profiles WHERE id = v_session.player1_id::uuid;
                 ELSE
                     v_p1_mmr := 1000;
                 END IF;

                 IF v_p2_is_real THEN
                     SELECT mmr INTO v_p2_mmr FROM profiles WHERE id = v_session.player2_id::uuid;
                 ELSE
                     v_p2_mmr := 1000;
                 END IF;

                 v_p1_mmr := COALESCE(v_p1_mmr, 1000);
                 v_p2_mmr := COALESCE(v_p2_mmr, 1000);

                 v_p1_exp := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::numeric / 400.0));
                 v_p2_exp := 1.0 / (1.0 + power(10.0, (v_p1_mmr - v_p2_mmr)::numeric / 400.0));

                 -- Winner streak bonus is only for real users
                 IF v_winner = v_session.player1_id::text AND v_p1_is_real THEN
                     SELECT rank_win_streak, rank_streak_updated_at
                     INTO v_winner_streak, v_winner_streak_at
                     FROM profiles WHERE id = v_session.player1_id::uuid;

                     IF v_winner_streak_at IS NOT NULL AND (now() - v_winner_streak_at) <= interval '10 minutes' THEN
                         v_winner_streak := COALESCE(v_winner_streak, 0) + 1;
                     ELSE
                         v_winner_streak := 1;
                     END IF;

                     IF v_winner_streak >= 3 AND (v_winner_streak % 3) = 0 THEN
                         v_streak_bonus := LEAST((v_winner_streak / 3) * 5, 15);
                     END IF;

                     IF v_winner_streak >= 9 THEN
                         v_winner_streak := 0;
                     END IF;
                 ELSIF v_winner = v_session.player2_id::text AND v_p2_is_real THEN
                     SELECT rank_win_streak, rank_streak_updated_at
                     INTO v_winner_streak, v_winner_streak_at
                     FROM profiles WHERE id = v_session.player2_id::uuid;

                     IF v_winner_streak_at IS NOT NULL AND (now() - v_winner_streak_at) <= interval '10 minutes' THEN
                         v_winner_streak := COALESCE(v_winner_streak, 0) + 1;
                     ELSE
                         v_winner_streak := 1;
                     END IF;

                     IF v_winner_streak >= 3 AND (v_winner_streak % 3) = 0 THEN
                         v_streak_bonus := LEAST((v_winner_streak / 3) * 5, 15);
                     END IF;

                     IF v_winner_streak >= 9 THEN
                         v_winner_streak := 0;
                     END IF;
                 END IF;

                 IF v_winner = v_session.player1_id::text THEN
                     v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (1 - v_p1_exp)) + v_streak_bonus;
                     v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (0 - v_p2_exp));
                 ELSE
                     v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (0 - v_p1_exp));
                     v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (1 - v_p2_exp)) + v_streak_bonus;
                 END IF;

                 v_p1_delta := v_new_p1_mmr - v_p1_mmr;
                 v_p2_delta := v_new_p2_mmr - v_p2_mmr;

                 -- Apply MMR/stat updates only to real profiles
                 IF v_p1_is_real THEN
                     IF v_winner = v_session.player1_id::text THEN
                         UPDATE profiles
                         SET mmr = v_new_p1_mmr, wins = wins + 1,
                             rank_win_streak = COALESCE(v_winner_streak, 0),
                             rank_streak_updated_at = now(),
                             rank_lose_streak = 0
                         WHERE id = v_session.player1_id::uuid;
                     ELSE
                         UPDATE profiles
                         SET mmr = v_new_p1_mmr, losses = losses + 1,
                             rank_win_streak = 0,
                             rank_streak_updated_at = NULL,
                             rank_lose_streak = COALESCE(rank_lose_streak, 0) + 1
                         WHERE id = v_session.player1_id::uuid;
                     END IF;
                 END IF;

                 IF v_p2_is_real THEN
                     IF v_winner = v_session.player2_id::text THEN
                         UPDATE profiles
                         SET mmr = v_new_p2_mmr, wins = wins + 1,
                             rank_win_streak = COALESCE(v_winner_streak, 0),
                             rank_streak_updated_at = now(),
                             rank_lose_streak = 0
                         WHERE id = v_session.player2_id::uuid;
                     ELSE
                         UPDATE profiles
                         SET mmr = v_new_p2_mmr, losses = losses + 1,
                             rank_win_streak = 0,
                             rank_streak_updated_at = NULL,
                             rank_lose_streak = COALESCE(rank_lose_streak, 0) + 1
                         WHERE id = v_session.player2_id::uuid;
                     END IF;
                 END IF;

                 UPDATE game_sessions SET
                     player1_mmr_change = v_p1_delta,
                     player2_mmr_change = v_p2_delta,
                     player1_streak_bonus = CASE WHEN v_winner = v_session.player1_id::text AND v_p1_is_real THEN v_streak_bonus ELSE 0 END,
                     player2_streak_bonus = CASE WHEN v_winner = v_session.player2_id::text AND v_p2_is_real THEN v_streak_bonus ELSE 0 END
                 WHERE id = p_room_id;

                 -- Lose streak reward only for real loser
                 IF v_loser = v_session.player1_id::text AND v_p1_is_real THEN
                     SELECT rank_lose_streak, rank_lose_bonus_date
                     INTO v_loser_lose_streak, v_loser_lose_bonus_date
                     FROM profiles WHERE id = v_session.player1_id::uuid;

                     IF v_loser_lose_streak >= 3 AND (v_loser_lose_bonus_date IS NULL OR v_loser_lose_bonus_date < CURRENT_DATE) THEN
                         UPDATE profiles
                         SET pencils = pencils + 1,
                             rank_lose_bonus_date = CURRENT_DATE,
                             rank_lose_streak = 0
                         WHERE id = v_session.player1_id::uuid;
                         UPDATE game_sessions SET player1_lose_pencil = true WHERE id = p_room_id;
                     END IF;
                 ELSIF v_loser = v_session.player2_id::text AND v_p2_is_real THEN
                     SELECT rank_lose_streak, rank_lose_bonus_date
                     INTO v_loser_lose_streak, v_loser_lose_bonus_date
                     FROM profiles WHERE id = v_session.player2_id::uuid;

                     IF v_loser_lose_streak >= 3 AND (v_loser_lose_bonus_date IS NULL OR v_loser_lose_bonus_date < CURRENT_DATE) THEN
                         UPDATE profiles
                         SET pencils = pencils + 1,
                             rank_lose_bonus_date = CURRENT_DATE,
                             rank_lose_streak = 0
                         WHERE id = v_session.player2_id::uuid;
                         UPDATE game_sessions SET player2_lose_pencil = true WHERE id = p_room_id;
                     END IF;
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

    -- Skill stats: per-round winner gains (rank/normal only, exclude guests/bots)
    IF v_session.mode IN ('rank', 'normal') THEN
        IF v_session.player1_id ~ '^[0-9a-fA-F-]{36}$' THEN
            UPDATE profiles
            SET speed = LEAST(999, COALESCE(speed, 0) + v_p1_speed),
                memory = LEAST(999, COALESCE(memory, 0) + v_p1_memory),
                judgment = LEAST(999, COALESCE(judgment, 0) + v_p1_judgment),
                calculation = LEAST(999, COALESCE(calculation, 0) + v_p1_calculation),
                accuracy = LEAST(999, COALESCE(accuracy, 0) + v_p1_accuracy),
                observation = LEAST(999, COALESCE(observation, 0) + v_p1_observation)
            WHERE id = v_session.player1_id::uuid;
        END IF;

        IF v_session.player2_id ~ '^[0-9a-fA-F-]{36}$' THEN
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
$_$;
