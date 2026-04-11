-- ============================================================
-- 연승/연패 보너스 시스템
-- ============================================================

-- 1. profiles 테이블에 컬럼 추가
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rank_win_streak integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rank_streak_updated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS rank_lose_streak integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rank_lose_bonus_date date;

-- 2. game_sessions 테이블에 mmr_change + 연승보너스 컬럼 추가
ALTER TABLE public.game_sessions
  ADD COLUMN IF NOT EXISTS player1_mmr_change integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS player2_mmr_change integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS player1_streak_bonus integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS player2_streak_bonus integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS player1_lose_pencil boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS player2_lose_pencil boolean DEFAULT false;

-- 3. finish_game 함수 재정의 (연승/연패 로직 + mmr_change/streak_bonus 저장)
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

    -- Streak variables
    v_winner_streak int;
    v_winner_streak_at timestamptz;
    v_loser_lose_streak int;
    v_loser_lose_bonus_date date;
    v_streak_bonus int := 0;
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
             -- RANK MODE: Update MMR + Standard Wins/Losses (only for real users)
             IF v_session.player1_id ~ '^[0-9a-fA-F-]{36}$' AND v_session.player2_id ~ '^[0-9a-fA-F-]{36}$' THEN
                 SELECT mmr INTO v_p1_mmr FROM profiles WHERE id = v_session.player1_id::uuid;
                 SELECT mmr INTO v_p2_mmr FROM profiles WHERE id = v_session.player2_id::uuid;

                 v_p1_exp := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::numeric / 400.0));
                 v_p2_exp := 1.0 / (1.0 + power(10.0, (v_p1_mmr - v_p2_mmr)::numeric / 400.0));

                 -- === STREAK BONUS for winner ===
                 SELECT rank_win_streak, rank_streak_updated_at
                 INTO v_winner_streak, v_winner_streak_at
                 FROM profiles WHERE id = v_winner::uuid;

                 -- 10분 내 연속 승리면 연승 +1, 아니면 1로 리셋
                 IF v_winner_streak_at IS NOT NULL AND (now() - v_winner_streak_at) <= interval '10 minutes' THEN
                     v_winner_streak := COALESCE(v_winner_streak, 0) + 1;
                 ELSE
                     v_winner_streak := 1;
                 END IF;

                 -- 3의 배수 연승 시 보너스 MMR (+5, +10, +15 최대)
                 IF v_winner_streak >= 3 AND (v_winner_streak % 3) = 0 THEN
                     v_streak_bonus := LEAST((v_winner_streak / 3) * 5, 15);
                 END IF;

                 -- 9연승 달성 후 리셋
                 IF v_winner_streak >= 9 THEN
                     v_winner_streak := 0;
                 END IF;

                 IF v_winner = v_session.player1_id::text THEN
                    v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (1 - v_p1_exp)) + v_streak_bonus;
                    v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (0 - v_p2_exp));

                    UPDATE profiles SET mmr = v_new_p1_mmr, wins = wins + 1,
                        rank_win_streak = v_winner_streak, rank_streak_updated_at = now(), rank_lose_streak = 0
                    WHERE id = v_session.player1_id::uuid;
                    UPDATE profiles SET mmr = v_new_p2_mmr, losses = losses + 1,
                        rank_win_streak = 0, rank_streak_updated_at = NULL,
                        rank_lose_streak = COALESCE(rank_lose_streak, 0) + 1
                    WHERE id = v_session.player2_id::uuid;
                 ELSE
                    v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (0 - v_p1_exp));
                    v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (1 - v_p2_exp)) + v_streak_bonus;

                    UPDATE profiles SET mmr = v_new_p1_mmr, losses = losses + 1,
                        rank_win_streak = 0, rank_streak_updated_at = NULL,
                        rank_lose_streak = COALESCE(rank_lose_streak, 0) + 1
                    WHERE id = v_session.player1_id::uuid;
                    UPDATE profiles SET mmr = v_new_p2_mmr, wins = wins + 1,
                        rank_win_streak = v_winner_streak, rank_streak_updated_at = now(), rank_lose_streak = 0
                    WHERE id = v_session.player2_id::uuid;
                 END IF;

                 -- Save MMR changes + streak bonus to session
                 IF v_winner = v_session.player1_id::text THEN
                     UPDATE game_sessions SET
                         player1_mmr_change = v_new_p1_mmr - v_p1_mmr,
                         player2_mmr_change = v_new_p2_mmr - v_p2_mmr,
                         player1_streak_bonus = v_streak_bonus,
                         player2_streak_bonus = 0
                     WHERE id = p_room_id;
                 ELSE
                     UPDATE game_sessions SET
                         player1_mmr_change = v_new_p1_mmr - v_p1_mmr,
                         player2_mmr_change = v_new_p2_mmr - v_p2_mmr,
                         player1_streak_bonus = 0,
                         player2_streak_bonus = v_streak_bonus
                     WHERE id = p_room_id;
                 END IF;

                 -- === LOSE STREAK BONUS (3연패 시 연필 1개, 하루 1회) ===
                 SELECT rank_lose_streak, rank_lose_bonus_date
                 INTO v_loser_lose_streak, v_loser_lose_bonus_date
                 FROM profiles WHERE id = v_loser::uuid;

                 -- 위에서 이미 +1 했으므로 현재 값 다시 조회
                 SELECT rank_lose_streak INTO v_loser_lose_streak FROM profiles WHERE id = v_loser::uuid;

                 IF v_loser_lose_streak >= 3 AND (v_loser_lose_bonus_date IS NULL OR v_loser_lose_bonus_date < CURRENT_DATE) THEN
                     UPDATE profiles
                     SET pencils = pencils + 1,
                         rank_lose_bonus_date = CURRENT_DATE,
                         rank_lose_streak = 0
                     WHERE id = v_loser::uuid;

                     -- 패배자에게 연필 보상 플래그 저장
                     IF v_loser = v_session.player1_id THEN
                         UPDATE game_sessions SET player1_lose_pencil = true WHERE id = p_room_id;
                     ELSE
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
