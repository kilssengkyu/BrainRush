-- Add ONE_STROKE to game catalog.
-- Practice-only for initial rollout.

INSERT INTO public.game_catalog (
  game_type,
  is_enabled,
  use_in_practice,
  use_in_rank,
  use_in_normal
)
VALUES (
  'ONE_STROKE',
  true,
  true,
  false,
  false
)
ON CONFLICT (game_type)
DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled,
  use_in_practice = EXCLUDED.use_in_practice,
  use_in_rank = EXCLUDED.use_in_rank,
  use_in_normal = EXCLUDED.use_in_normal;
