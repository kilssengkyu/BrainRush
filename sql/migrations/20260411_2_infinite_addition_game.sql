-- Add INFINITE_ADD minigame.
-- Initial rollout is practice-only so balance can be checked before adding it to matchmaking pools.

ALTER TABLE public.game_sessions
  DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;

ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_game_type_check
  CHECK (
    game_type IN (
      'RPS',
      'NUMBER',
      'MATH',
      'MATH_OX',
      'INFINITE_ADD',
      'ONE_STROKE',
      'TEN',
      'COLOR',
      'MEMORY',
      'SEQUENCE',
      'SEQUENCE_NORMAL',
      'LARGEST',
      'PAIR',
      'UPDOWN',
      'SLIDER',
      'ARROW',
      'NUMBER_DESC',
      'BLANK',
      'OPERATOR',
      'LADDER',
      'TAP_COLOR',
      'AIM',
      'MOST_COLOR',
      'SORTING',
      'SPY',
      'PATH',
      'BLIND_PATH',
      'BALLS',
      'CATCH_COLOR',
      'TIMING_BAR',
      'COLOR_TIMING',
      'STAIRWAY',
      'MAKE_ZERO'
    )
  );

INSERT INTO public.game_catalog (
  game_type,
  is_enabled,
  use_in_practice,
  use_in_rank,
  use_in_normal,
  stat_speed,
  stat_memory,
  stat_judgment,
  stat_calculation,
  stat_accuracy,
  stat_observation,
  updated_at
)
VALUES (
  'INFINITE_ADD',
  true,
  true,
  false,
  false,
  0,
  0,
  1,
  4,
  0,
  0,
  now()
)
ON CONFLICT (game_type)
DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled,
  use_in_practice = EXCLUDED.use_in_practice,
  use_in_rank = EXCLUDED.use_in_rank,
  use_in_normal = EXCLUDED.use_in_normal,
  stat_speed = EXCLUDED.stat_speed,
  stat_memory = EXCLUDED.stat_memory,
  stat_judgment = EXCLUDED.stat_judgment,
  stat_calculation = EXCLUDED.stat_calculation,
  stat_accuracy = EXCLUDED.stat_accuracy,
  stat_observation = EXCLUDED.stat_observation,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.get_game_duration(p_game_type text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN CASE p_game_type
        WHEN 'RPS' THEN 30
        WHEN 'ARROW' THEN 30
        WHEN 'TAP_COLOR' THEN 30
        WHEN 'SLIDER' THEN 30
        WHEN 'UPDOWN' THEN 30
        WHEN 'CATCH_COLOR' THEN 30
        WHEN 'MATH' THEN 30
        WHEN 'MATH_OX' THEN 30
        WHEN 'INFINITE_ADD' THEN 30
        WHEN 'TEN' THEN 30
        WHEN 'BLANK' THEN 30
        WHEN 'OPERATOR' THEN 30
        WHEN 'LARGEST' THEN 30
        WHEN 'NUMBER' THEN 30
        WHEN 'NUMBER_DESC' THEN 30
        WHEN 'SORTING' THEN 30
        WHEN 'LADDER' THEN 30
        WHEN 'MOST_COLOR' THEN 30
        WHEN 'COLOR' THEN 30
        WHEN 'SEQUENCE' THEN 30
        WHEN 'SEQUENCE_NORMAL' THEN 30
        WHEN 'PAIR' THEN 30
        WHEN 'MAKE_ZERO' THEN 40
        WHEN 'AIM' THEN 40
        WHEN 'BALLS' THEN 40
        WHEN 'MEMORY' THEN 40
        WHEN 'SPY' THEN 40
        WHEN 'TIMING_BAR' THEN 40
        WHEN 'COLOR_TIMING' THEN 40
        WHEN 'STAIRWAY' THEN 40
        WHEN 'ONE_STROKE' THEN 40
        WHEN 'PATH' THEN 45
        WHEN 'BLIND_PATH' THEN 45
        ELSE 30
    END;
END;
$$;
