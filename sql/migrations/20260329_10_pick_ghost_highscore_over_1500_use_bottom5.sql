CREATE OR REPLACE FUNCTION public.pick_ghost_timeline(p_player_id text, p_game_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_target_score int := 0;
    v_timeline jsonb;
BEGIN
    IF p_game_type IS NULL THEN
        RETURN NULL;
    END IF;

    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
        SELECT COALESCE(MAX(ph.best_score), 0)
        INTO v_target_score
        FROM player_highscores ph
        WHERE ph.user_id = p_player_id::uuid
          AND ph.game_type = p_game_type;
    END IF;

    IF v_target_score > 1500 THEN
        -- 내 점수보다 낮은 점수 중 "가장 가까운 아래 3개"에서 랜덤
        WITH lower_ghosts AS (
            SELECT gs.score_timeline
            FROM ghost_scores gs
            WHERE gs.game_type = p_game_type
              AND gs.final_score > 0
              AND gs.final_score < v_target_score
            ORDER BY gs.final_score DESC, random()
            LIMIT 3
        )
        SELECT lg.score_timeline
        INTO v_timeline
        FROM lower_ghosts lg
        ORDER BY random()
        LIMIT 1;

        -- 아래 점수가 부족하면 기존 nearest-3으로 fallback
        IF v_timeline IS NULL THEN
            WITH nearest_ghosts AS (
                SELECT gs.score_timeline
                FROM ghost_scores gs
                WHERE gs.game_type = p_game_type
                  AND gs.final_score > 0
                ORDER BY ABS(gs.final_score - v_target_score), random()
                LIMIT 3
            )
            SELECT ng.score_timeline
            INTO v_timeline
            FROM nearest_ghosts ng
            ORDER BY random()
            LIMIT 1;
        END IF;
    ELSE
        WITH nearest_ghosts AS (
            SELECT gs.score_timeline
            FROM ghost_scores gs
            WHERE gs.game_type = p_game_type
              AND gs.final_score > 0
            ORDER BY ABS(gs.final_score - v_target_score), random()
            LIMIT 3
        )
        SELECT ng.score_timeline
        INTO v_timeline
        FROM nearest_ghosts ng
        ORDER BY random()
        LIMIT 1;
    END IF;

    RETURN v_timeline;
END;
$$;
