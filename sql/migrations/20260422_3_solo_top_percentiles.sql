-- Batch top-percent lookup for solo mode results.
-- Input example:
-- [
--   { "game_type": "MATH", "score": 820 },
--   { "game_type": "COLOR", "score": 640 },
--   { "game_type": "RPS", "score": 510 }
-- ]

CREATE OR REPLACE FUNCTION public.get_score_top_percent(
    p_game_type text,
    p_score integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_total_count integer := 0;
    v_higher_or_equal_count integer := 0;
BEGIN
    IF COALESCE(trim(p_game_type), '') = '' THEN
        RETURN NULL;
    END IF;

    SELECT COUNT(*)::int
    INTO v_total_count
    FROM public.player_highscores ph
    WHERE ph.game_type = p_game_type;

    IF v_total_count = 0 THEN
        RETURN NULL;
    END IF;

    SELECT COUNT(*)::int
    INTO v_higher_or_equal_count
    FROM public.player_highscores ph
    WHERE ph.game_type = p_game_type
      AND ph.best_score >= COALESCE(p_score, 0);

    IF v_higher_or_equal_count = 0 THEN
        RETURN NULL;
    END IF;

    RETURN LEAST(100, GREATEST(1, CEIL((v_higher_or_equal_count::numeric / v_total_count::numeric) * 100)::int));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_scores_top_percent(
    p_scores jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE (
    game_type text,
    score integer,
    top_percent integer,
    total_players integer,
    higher_or_equal_players integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    WITH input_scores AS (
        SELECT
            trim(COALESCE(item.game_type, '')) AS game_type,
            COALESCE(item.score, 0)::int AS score
        FROM jsonb_to_recordset(
            CASE
                WHEN p_scores IS NULL OR jsonb_typeof(p_scores) <> 'array' THEN '[]'::jsonb
                ELSE p_scores
            END
        ) AS item(game_type text, score integer)
        WHERE trim(COALESCE(item.game_type, '')) <> ''
    ),
    aggregated AS (
        SELECT
            i.game_type,
            i.score,
            COUNT(ph.user_id)::int AS total_players,
            COUNT(ph.user_id) FILTER (WHERE ph.best_score >= i.score)::int AS higher_or_equal_players
        FROM input_scores i
        LEFT JOIN public.player_highscores ph
            ON ph.game_type = i.game_type
        GROUP BY i.game_type, i.score
    )
    SELECT
        a.game_type,
        a.score,
        CASE
            WHEN a.total_players = 0 OR a.higher_or_equal_players = 0 THEN NULL
            ELSE LEAST(100, GREATEST(1, CEIL((a.higher_or_equal_players::numeric / a.total_players::numeric) * 100)::int))
        END AS top_percent,
        a.total_players,
        a.higher_or_equal_players
    FROM aggregated a;
$$;

GRANT EXECUTE ON FUNCTION public.get_score_top_percent(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_scores_top_percent(jsonb) TO authenticated, service_role;
