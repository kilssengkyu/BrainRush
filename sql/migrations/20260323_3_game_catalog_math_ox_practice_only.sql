-- Add MATH_OX to game catalog.
-- Enabled for practice only (normal/rank disabled).

INSERT INTO public.game_catalog (
  game_type,
  is_enabled,
  use_in_rank,
  use_in_normal,
  use_in_practice,
  updated_at
)
VALUES (
  'MATH_OX',
  true,
  false,
  false,
  true,
  now()
)
ON CONFLICT (game_type) DO UPDATE
SET
  is_enabled = EXCLUDED.is_enabled,
  use_in_rank = EXCLUDED.use_in_rank,
  use_in_normal = EXCLUDED.use_in_normal,
  use_in_practice = EXCLUDED.use_in_practice,
  updated_at = now();
