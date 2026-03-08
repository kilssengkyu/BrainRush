-- Game catalog for runtime enable/disable controls.
CREATE TABLE IF NOT EXISTS public.game_catalog (
  game_type text PRIMARY KEY,
  is_enabled boolean NOT NULL DEFAULT false,
  use_in_rank boolean NOT NULL DEFAULT true,
  use_in_normal boolean NOT NULL DEFAULT true,
  use_in_practice boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.game_catalog ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'game_catalog'
      AND policyname = 'Anyone can read game_catalog'
  ) THEN
    CREATE POLICY "Anyone can read game_catalog"
      ON public.game_catalog
      FOR SELECT
      USING (true);
  END IF;
END $$;

WITH practice_games(game_type) AS (
  VALUES
    ('RPS'),
    ('NUMBER'),
    ('NUMBER_DESC'),
    ('MATH'),
    ('TEN'),
    ('COLOR'),
    ('MEMORY'),
    ('SEQUENCE'),
    ('SEQUENCE_NORMAL'),
    ('LARGEST'),
    ('PAIR'),
    ('UPDOWN'),
    ('SLIDER'),
    ('ARROW'),
    ('BLANK'),
    ('OPERATOR'),
    ('LADDER'),
    ('PATH'),
    ('BLIND_PATH'),
    ('BALLS'),
    ('CATCH_COLOR'),
    ('TAP_COLOR'),
    ('AIM'),
    ('MOST_COLOR'),
    ('SORTING'),
    ('SPY'),
    ('COLOR_TIMING'),
    ('STAIRWAY'),
    ('MAKE_ZERO')
)
INSERT INTO public.game_catalog (
  game_type,
  is_enabled,
  use_in_rank,
  use_in_normal,
  use_in_practice,
  updated_at
)
SELECT
  pg.game_type,
  true,
  true,
  true,
  true,
  now()
FROM practice_games pg
ON CONFLICT (game_type) DO UPDATE
SET
  is_enabled = EXCLUDED.is_enabled,
  use_in_rank = EXCLUDED.use_in_rank,
  use_in_normal = EXCLUDED.use_in_normal,
  use_in_practice = EXCLUDED.use_in_practice,
  updated_at = now();
