-- Gate high-score "lower ghost" behavior by MMR.
-- - MMR >= 1600: always pick from nearest 5 to player's target score.
-- - MMR < 1600: keep existing behavior
--   * if highscore > 1500, prefer lower ghosts (< target - 150), fallback nearest 3.
--   * otherwise nearest 3.

CREATE OR REPLACE FUNCTION public.pick_ghost_timeline(p_player_id text, p_game_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_target_score int := 0;
    v_player_mmr int := 0;
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

        SELECT COALESCE(p.mmr, 0)
        INTO v_player_mmr
        FROM profiles p
        WHERE p.id = p_player_id::uuid;
    END IF;

    -- High-MMR users: always near own level, sample from nearest 5.
    IF v_player_mmr >= 1600 THEN
        WITH nearest_ghosts AS (
            SELECT gs.score_timeline
            FROM ghost_scores gs
            WHERE gs.game_type = p_game_type
              AND gs.final_score > 0
            ORDER BY ABS(gs.final_score - v_target_score), random()
            LIMIT 5
        )
        SELECT ng.score_timeline
        INTO v_timeline
        FROM nearest_ghosts ng
        ORDER BY random()
        LIMIT 1;

    -- Lower-MMR users: keep highscore-over-1500 lower-ghost behavior.
    ELSIF v_target_score > 1500 THEN
        WITH lower_ghosts AS (
            SELECT gs.score_timeline
            FROM ghost_scores gs
            WHERE gs.game_type = p_game_type
              AND gs.final_score > 0
              AND gs.final_score < v_target_score - 150
            ORDER BY gs.final_score DESC, random()
            LIMIT 10
        )
        SELECT lg.score_timeline
        INTO v_timeline
        FROM lower_ghosts lg
        ORDER BY random()
        LIMIT 1;

        -- Fallback to nearest-3 if lower pool is empty.
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
