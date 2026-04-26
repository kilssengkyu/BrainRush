-- Solo mode run storage.
-- Keeps per-run history separate from versus game_sessions while still updating
-- the shared player_highscores table for each minigame result.

CREATE TABLE IF NOT EXISTS public.solo_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz NOT NULL DEFAULT now(),
    round_count integer NOT NULL DEFAULT 0,
    total_score integer NOT NULL DEFAULT 0,
    percentile_unlocked boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.solo_run_rounds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    solo_run_id uuid NOT NULL REFERENCES public.solo_runs(id) ON DELETE CASCADE,
    round_index integer NOT NULL,
    game_type text NOT NULL,
    score integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT solo_run_rounds_unique_round UNIQUE (solo_run_id, round_index)
);

CREATE INDEX IF NOT EXISTS idx_solo_runs_user_created_at
    ON public.solo_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_solo_run_rounds_run_round
    ON public.solo_run_rounds (solo_run_id, round_index);

ALTER TABLE public.solo_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solo_run_rounds ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'solo_runs'
          AND policyname = 'Users can view own solo runs'
    ) THEN
        CREATE POLICY "Users can view own solo runs"
            ON public.solo_runs
            FOR SELECT
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'solo_runs'
          AND policyname = 'Users can insert own solo runs'
    ) THEN
        CREATE POLICY "Users can insert own solo runs"
            ON public.solo_runs
            FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'solo_runs'
          AND policyname = 'Users can update own solo runs'
    ) THEN
        CREATE POLICY "Users can update own solo runs"
            ON public.solo_runs
            FOR UPDATE
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'solo_run_rounds'
          AND policyname = 'Users can view own solo run rounds'
    ) THEN
        CREATE POLICY "Users can view own solo run rounds"
            ON public.solo_run_rounds
            FOR SELECT
            USING (
                EXISTS (
                    SELECT 1
                    FROM public.solo_runs sr
                    WHERE sr.id = solo_run_rounds.solo_run_id
                      AND sr.user_id = auth.uid()
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'solo_run_rounds'
          AND policyname = 'Users can insert own solo run rounds'
    ) THEN
        CREATE POLICY "Users can insert own solo run rounds"
            ON public.solo_run_rounds
            FOR INSERT
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM public.solo_runs sr
                    WHERE sr.id = solo_run_rounds.solo_run_id
                      AND sr.user_id = auth.uid()
                )
            );
    END IF;
END;
$$;

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

    RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlock_solo_run_percentile(p_run_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_row_count integer := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    UPDATE public.solo_runs
    SET percentile_unlocked = true
    WHERE id = p_run_id
      AND user_id = auth.uid()
      AND percentile_unlocked = false;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    RETURN v_row_count > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_solo_run(timestamptz, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unlock_solo_run_percentile(uuid) TO authenticated, service_role;
