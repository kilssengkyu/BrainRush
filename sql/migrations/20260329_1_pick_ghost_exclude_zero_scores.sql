-- Exclude zero-score ghosts from timeline selection.
-- This prevents bots from receiving empty/meaningless ghost runs.

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

    WITH nearest_ghosts AS (
        SELECT gs.score_timeline
        FROM ghost_scores gs
        WHERE gs.game_type = p_game_type
          AND gs.final_score > 0
        ORDER BY ABS(gs.final_score - COALESCE(v_target_score, 0)), random()
        LIMIT 3
    )
    SELECT ng.score_timeline
    INTO v_timeline
    FROM nearest_ghosts ng
    ORDER BY random()
    LIMIT 1;

    RETURN v_timeline;
END;
$$;

