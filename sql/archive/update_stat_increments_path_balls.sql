-- Migration: update_stat_increments_path_balls.sql
-- Add PATH and BALLS mappings to stat_increments.

CREATE OR REPLACE FUNCTION stat_increments(p_game_type text)
RETURNS TABLE (
    speed int,
    memory int,
    judgment int,
    calculation int,
    accuracy int,
    observation int
) AS $$
DECLARE
    v_speed int := 0;
    v_memory int := 0;
    v_judgment int := 0;
    v_calculation int := 0;
    v_accuracy int := 0;
    v_observation int := 0;
BEGIN
    CASE p_game_type
        WHEN 'AIM' THEN v_speed := 2; v_accuracy := 1;
        WHEN 'RPS' THEN v_speed := 2; v_judgment := 1;
        WHEN 'UPDOWN' THEN v_judgment := 2; v_speed := 1;
        WHEN 'ARROW' THEN v_speed := 2; v_judgment := 1;
        WHEN 'SLIDER' THEN v_accuracy := 2; v_speed := 1;
        WHEN 'MEMORY' THEN v_memory := 2; v_accuracy := 1;
        WHEN 'SEQUENCE' THEN v_memory := 2; v_accuracy := 1;
        WHEN 'SEQUENCE_NORMAL' THEN v_memory := 2; v_accuracy := 1;
        WHEN 'SPY' THEN v_memory := 2; v_observation := 1;
        WHEN 'PAIR' THEN v_memory := 2; v_observation := 1;
        WHEN 'COLOR' THEN v_observation := 2; v_accuracy := 1;
        WHEN 'MOST_COLOR' THEN v_observation := 2; v_judgment := 1;
        WHEN 'TAP_COLOR' THEN v_observation := 2; v_speed := 1;
        WHEN 'MATH' THEN v_calculation := 2; v_accuracy := 1;
        WHEN 'TEN' THEN v_calculation := 2; v_judgment := 1;
        WHEN 'BLANK' THEN v_calculation := 2; v_accuracy := 1;
        WHEN 'OPERATOR' THEN v_calculation := 2; v_judgment := 1;
        WHEN 'LARGEST' THEN v_calculation := 2; v_judgment := 1;
        WHEN 'NUMBER' THEN v_accuracy := 2; v_judgment := 1;
        WHEN 'NUMBER_DESC' THEN v_accuracy := 2; v_judgment := 1;
        WHEN 'NUMBER_ASC' THEN v_accuracy := 2; v_judgment := 1;
        WHEN 'SORTING' THEN v_accuracy := 2; v_judgment := 1;
        WHEN 'LADDER' THEN v_judgment := 2; v_accuracy := 1;
        WHEN 'PATH' THEN v_speed := 2; v_judgment := 1;
        WHEN 'BALLS' THEN v_observation := 2; v_accuracy := 1;
        ELSE
            -- no-op
    END CASE;

    RETURN QUERY SELECT v_speed, v_memory, v_judgment, v_calculation, v_accuracy, v_observation;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
