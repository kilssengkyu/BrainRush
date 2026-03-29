-- Add ONE_STROKE duration mapping.
-- Use a longer timer because board and path length scale up to 8x8.

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
