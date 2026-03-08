-- Move stat increment source of truth to game_catalog.

ALTER TABLE IF EXISTS public.game_catalog
  ADD COLUMN IF NOT EXISTS stat_speed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stat_memory integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stat_judgment integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stat_calculation integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stat_accuracy integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stat_observation integer NOT NULL DEFAULT 0;

UPDATE public.game_catalog
SET
  stat_speed = CASE game_type
    WHEN 'AIM' THEN 4
    WHEN 'RPS' THEN 1
    WHEN 'UPDOWN' THEN 1
    WHEN 'ARROW' THEN 3
    WHEN 'TAP_COLOR' THEN 1
    WHEN 'PATH' THEN 3
    WHEN 'CATCH_COLOR' THEN 3
    WHEN 'COLOR_TIMING' THEN 2
    WHEN 'STAIRWAY' THEN 4
    ELSE 0
  END,
  stat_memory = CASE game_type
    WHEN 'MEMORY' THEN 4
    WHEN 'SEQUENCE' THEN 4
    WHEN 'SEQUENCE_NORMAL' THEN 4
    WHEN 'SPY' THEN 2
    WHEN 'PAIR' THEN 3
    WHEN 'TAP_COLOR' THEN 3
    WHEN 'BALLS' THEN 1
    WHEN 'BLIND_PATH' THEN 3
    ELSE 0
  END,
  stat_judgment = CASE game_type
    WHEN 'RPS' THEN 3
    WHEN 'UPDOWN' THEN 2
    WHEN 'ARROW' THEN 2
    WHEN 'SEQUENCE_NORMAL' THEN 1
    WHEN 'MOST_COLOR' THEN 1
    WHEN 'TEN' THEN 1
    WHEN 'OPERATOR' THEN 1
    WHEN 'LARGEST' THEN 1
    WHEN 'NUMBER' THEN 2
    WHEN 'NUMBER_DESC' THEN 2
    WHEN 'SORTING' THEN 2
    WHEN 'LADDER' THEN 3
    WHEN 'PATH' THEN 1
    WHEN 'BLIND_PATH' THEN 1
    WHEN 'STAIRWAY' THEN 1
    ELSE 0
  END,
  stat_calculation = CASE game_type
    WHEN 'UPDOWN' THEN 2
    WHEN 'SLIDER' THEN 3
    WHEN 'MATH' THEN 4
    WHEN 'TEN' THEN 4
    WHEN 'BLANK' THEN 3
    WHEN 'OPERATOR' THEN 4
    WHEN 'LARGEST' THEN 3
    ELSE 0
  END,
  stat_accuracy = CASE game_type
    WHEN 'AIM' THEN 1
    WHEN 'SLIDER' THEN 2
    WHEN 'SEQUENCE' THEN 1
    WHEN 'COLOR' THEN 2
    WHEN 'MATH' THEN 1
    WHEN 'BLANK' THEN 2
    WHEN 'NUMBER' THEN 3
    WHEN 'NUMBER_DESC' THEN 3
    WHEN 'SORTING' THEN 2
    WHEN 'LADDER' THEN 2
    WHEN 'BALLS' THEN 1
    WHEN 'CATCH_COLOR' THEN 2
    WHEN 'COLOR_TIMING' THEN 3
    ELSE 0
  END,
  stat_observation = CASE game_type
    WHEN 'RPS' THEN 1
    WHEN 'MEMORY' THEN 1
    WHEN 'SPY' THEN 3
    WHEN 'PAIR' THEN 2
    WHEN 'COLOR' THEN 3
    WHEN 'MOST_COLOR' THEN 4
    WHEN 'TAP_COLOR' THEN 1
    WHEN 'LARGEST' THEN 1
    WHEN 'SORTING' THEN 1
    WHEN 'PATH' THEN 1
    WHEN 'BALLS' THEN 3
    WHEN 'BLIND_PATH' THEN 1
    ELSE 0
  END;

CREATE OR REPLACE FUNCTION public.stat_increments(p_game_type text)
RETURNS TABLE(
    speed integer,
    memory integer,
    judgment integer,
    calculation integer,
    accuracy integer,
    observation integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT
      COALESCE(gc.stat_speed, 0),
      COALESCE(gc.stat_memory, 0),
      COALESCE(gc.stat_judgment, 0),
      COALESCE(gc.stat_calculation, 0),
      COALESCE(gc.stat_accuracy, 0),
      COALESCE(gc.stat_observation, 0)
    FROM public.game_catalog gc
    WHERE gc.game_type = p_game_type
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN QUERY SELECT 0, 0, 0, 0, 0, 0;
    END IF;
END;
$$;
