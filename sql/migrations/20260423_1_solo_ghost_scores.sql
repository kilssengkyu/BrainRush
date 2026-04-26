-- Store solo-mode score timelines in ghost_scores while keeping them identifiable.
-- pick_ghost_timeline intentionally continues to read the full ghost pool; source
-- lets us exclude solo ghosts later with a simple WHERE clause if needed.

ALTER TABLE public.ghost_scores
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'match';

CREATE INDEX IF NOT EXISTS idx_ghost_scores_game_source_score
    ON public.ghost_scores (game_type, source, final_score DESC);

CREATE OR REPLACE FUNCTION public.save_solo_run(
    p_started_at timestamptz DEFAULT NULL,
    p_rounds jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_run_id uuid;
    v_round_count integer := 0;
    v_total_score integer := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_rounds IS NULL OR jsonb_typeof(p_rounds) <> 'array' OR jsonb_array_length(p_rounds) = 0 THEN
        RAISE EXCEPTION 'Rounds are required';
    END IF;

    SELECT
        COUNT(*)::int,
        COALESCE(SUM(GREATEST(0, COALESCE((item->>'score')::int, 0))), 0)::int
    INTO v_round_count, v_total_score
    FROM jsonb_array_elements(p_rounds) AS item;

    INSERT INTO public.solo_runs (
        user_id,
        started_at,
        finished_at,
        round_count,
        total_score
    )
    VALUES (
        v_user_id,
        COALESCE(p_started_at, now()),
        now(),
        v_round_count,
        v_total_score
    )
    RETURNING id INTO v_run_id;

    INSERT INTO public.solo_run_rounds (
        solo_run_id,
        round_index,
        game_type,
        score
    )
    SELECT
        v_run_id,
        COALESCE((item->>'round_index')::int, ordinality::int),
        item->>'game_type',
        COALESCE((item->>'score')::int, 0)
    FROM jsonb_array_elements(p_rounds) WITH ORDINALITY AS rounds(item, ordinality)
    WHERE COALESCE(item->>'game_type', '') <> '';

    INSERT INTO public.player_highscores (user_id, game_type, best_score, updated_at)
    SELECT
        v_user_id,
        round_scores.game_type,
        MAX(round_scores.score) AS best_score,
        now()
    FROM (
        SELECT
            item->>'game_type' AS game_type,
            COALESCE((item->>'score')::int, 0) AS score
        FROM jsonb_array_elements(p_rounds) AS rounds(item)
        WHERE COALESCE(item->>'game_type', '') <> ''
    ) AS round_scores
    GROUP BY round_scores.game_type
    ON CONFLICT (user_id, game_type)
    DO UPDATE SET
        best_score = GREATEST(public.player_highscores.best_score, EXCLUDED.best_score),
        updated_at = now();

    INSERT INTO public.ghost_scores (game_type, score_timeline, final_score, source)
    SELECT
        item->>'game_type' AS game_type,
        item->'score_timeline' AS score_timeline,
        GREATEST(0, COALESCE((item->>'score')::int, 0)) AS final_score,
        'solo' AS source
    FROM jsonb_array_elements(p_rounds) AS rounds(item)
    WHERE COALESCE(item->>'game_type', '') <> ''
      AND GREATEST(0, COALESCE((item->>'score')::int, 0)) > 0
      AND GREATEST(0, COALESCE((item->>'score')::int, 0)) <= 50000
      AND item ? 'score_timeline'
      AND jsonb_typeof(item->'score_timeline') = 'array'
      AND jsonb_array_length(item->'score_timeline') > 0;

    RETURN v_run_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_solo_run(timestamptz, jsonb) TO authenticated, service_role;
