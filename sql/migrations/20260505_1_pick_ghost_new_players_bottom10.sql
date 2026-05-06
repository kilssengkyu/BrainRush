-- Pick very easy ghosts for new players.
-- For the first 3 total normal/rank games, always sample from the bottom 10%
-- of the ghost pool for the selected minigame.

CREATE OR REPLACE FUNCTION public.pick_ghost_timeline(p_player_id text, p_game_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_target_score int := 0;
    v_player_mmr int := 0;
    v_total_games int := 0;
    v_timeline jsonb;
    v_min_percent float := 0.75;
    v_max_percent float := 1.00;
    v_selected_score int := 0;
    v_safe_floor int := 0;
BEGIN
    IF p_game_type IS NULL THEN
        RETURN NULL;
    END IF;

    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
        SELECT COALESCE(MAX(ph.best_score), 0)
        INTO v_target_score
        FROM public.player_highscores ph
        WHERE ph.user_id = p_player_id::uuid
          AND ph.game_type = p_game_type;

        SELECT
            COALESCE(p.mmr, 0),
            COALESCE(p.casual_wins, 0)
                + COALESCE(p.casual_losses, 0)
                + COALESCE(p.wins, 0)
                + COALESCE(p.losses, 0)
        INTO v_player_mmr, v_total_games
        FROM public.profiles p
        WHERE p.id = p_player_id::uuid;
    END IF;

    IF v_total_games < 3 THEN
        v_min_percent := 0.90; v_max_percent := 1.00; -- New players: bottom 10%
    ELSIF v_player_mmr >= 2200 THEN
        v_min_percent := 0.00; v_max_percent := 0.20;
    ELSIF v_player_mmr >= 2100 THEN
        v_min_percent := 0.05; v_max_percent := 0.25;
    ELSIF v_player_mmr >= 2000 THEN
        v_min_percent := 0.08; v_max_percent := 0.30;
    ELSIF v_player_mmr >= 1900 THEN
        v_min_percent := 0.15; v_max_percent := 0.40;
    ELSIF v_player_mmr >= 1800 THEN
        v_min_percent := 0.20; v_max_percent := 0.45;
    ELSIF v_player_mmr >= 1700 THEN
        v_min_percent := 0.25; v_max_percent := 0.50;
    ELSIF v_player_mmr >= 1600 THEN
        v_min_percent := 0.30; v_max_percent := 0.55;
    ELSIF v_player_mmr >= 1500 THEN
        v_min_percent := 0.35; v_max_percent := 0.60;
    ELSIF v_player_mmr >= 1400 THEN
        v_min_percent := 0.35; v_max_percent := 0.70;
    ELSIF v_player_mmr >= 1300 THEN
        v_min_percent := 0.45; v_max_percent := 0.75;
    ELSIF v_player_mmr >= 1200 THEN
        v_min_percent := 0.45; v_max_percent := 0.80;
    ELSIF v_player_mmr >= 1100 THEN
        v_min_percent := 0.50; v_max_percent := 0.85;
    ELSIF v_player_mmr >= 1000 THEN
        v_min_percent := 0.50; v_max_percent := 0.90;
    ELSIF v_player_mmr >= 900 THEN
        v_min_percent := 0.55; v_max_percent := 0.95;
    ELSE
        v_min_percent := 0.80; v_max_percent := 1.00;
    END IF;

    WITH ranked_ghosts AS (
        SELECT
            gs.score_timeline,
            gs.final_score,
            PERCENT_RANK() OVER (ORDER BY gs.final_score DESC) AS rnk
        FROM public.ghost_scores gs
        WHERE gs.game_type = p_game_type
          AND gs.final_score > 0
    )
    SELECT rg.score_timeline, rg.final_score
    INTO v_timeline, v_selected_score
    FROM ranked_ghosts rg
    WHERE rg.rnk >= v_min_percent
      AND rg.rnk <= v_max_percent
    ORDER BY random()
    LIMIT 1;

    v_safe_floor := GREATEST(v_target_score - 150, 0);

    IF v_player_mmr < 1600
       AND v_total_games >= 3
       AND v_timeline IS NOT NULL
       AND v_selected_score > v_safe_floor THEN
        WITH safety_net AS (
            SELECT gs.score_timeline
            FROM public.ghost_scores gs
            WHERE gs.game_type = p_game_type
              AND gs.final_score > 0
              AND gs.final_score < v_safe_floor
            ORDER BY gs.final_score DESC, random()
            LIMIT 10
        )
        SELECT sn.score_timeline
        INTO v_timeline
        FROM safety_net sn
        ORDER BY random()
        LIMIT 1;
    END IF;

    IF v_timeline IS NULL THEN
        WITH fallback AS (
            SELECT gs.score_timeline
            FROM public.ghost_scores gs
            WHERE gs.game_type = p_game_type
              AND gs.final_score > 0
            ORDER BY ABS(gs.final_score - v_target_score), random()
            LIMIT 5
        )
        SELECT f.score_timeline
        INTO v_timeline
        FROM fallback f
        ORDER BY random()
        LIMIT 1;
    END IF;

    RETURN v_timeline;
END;
$$;
