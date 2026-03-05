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
DECLARE
    v_speed int := 0;
    v_memory int := 0;
    v_judgment int := 0;
    v_calculation int := 0;
    v_accuracy int := 0;
    v_observation int := 0;
BEGIN
    CASE p_game_type
        WHEN 'AIM' THEN v_speed := 4; v_accuracy := 1;
        WHEN 'RPS' THEN v_judgment := 3; v_speed := 1; v_observation := 1;
        WHEN 'UPDOWN' THEN v_judgment := 2; v_calculation := 2; v_speed := 1;
        WHEN 'ARROW' THEN v_speed := 3; v_judgment := 2;
        WHEN 'SLIDER' THEN v_calculation := 3; v_accuracy := 2;
        WHEN 'MEMORY' THEN v_memory := 4; v_observation := 1;
        WHEN 'SEQUENCE' THEN v_memory := 4; v_accuracy := 1;
        WHEN 'SEQUENCE_NORMAL' THEN v_memory := 4; v_judgment := 1;
        WHEN 'SPY' THEN v_observation := 3; v_memory := 2;
        WHEN 'PAIR' THEN v_memory := 3; v_observation := 2;
        WHEN 'COLOR' THEN v_observation := 3; v_accuracy := 2;
        WHEN 'MOST_COLOR' THEN v_observation := 4; v_judgment := 1;
        WHEN 'TAP_COLOR' THEN v_memory := 3; v_observation := 1; v_speed := 1;
        WHEN 'MATH' THEN v_calculation := 4; v_accuracy := 1;
        WHEN 'TEN' THEN v_calculation := 4; v_judgment := 1;
        WHEN 'BLANK' THEN v_calculation := 3; v_accuracy := 2;
        WHEN 'OPERATOR' THEN v_calculation := 4; v_judgment := 1;
        WHEN 'LARGEST' THEN v_calculation := 3; v_judgment := 1; v_observation := 1;
        WHEN 'NUMBER' THEN v_accuracy := 3; v_judgment := 2;
        WHEN 'NUMBER_DESC' THEN v_accuracy := 3; v_judgment := 2;
        WHEN 'SORTING' THEN v_judgment := 2; v_accuracy := 2; v_observation := 1;
        WHEN 'LADDER' THEN v_judgment := 3; v_accuracy := 2;
        WHEN 'PATH' THEN v_speed := 3; v_judgment := 1; v_observation := 1;
        WHEN 'BALLS' THEN v_observation := 3; v_memory := 1; v_accuracy := 1;
        WHEN 'BLIND_PATH' THEN v_memory := 3; v_observation := 1; v_judgment := 1;
        WHEN 'CATCH_COLOR' THEN v_speed := 3; v_accuracy := 2;
        WHEN 'TIMING_BAR' THEN v_accuracy := 3; v_speed := 2;
        WHEN 'STAIRWAY' THEN v_speed := 4; v_judgment := 1;
        ELSE
            -- no-op
    END CASE;

    RETURN QUERY SELECT v_speed, v_memory, v_judgment, v_calculation, v_accuracy, v_observation;
END;
$$;
