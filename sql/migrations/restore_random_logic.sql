-- Restore random game selection logic
-- Removes the forced "Arrow/Slider First" test logic
-- Now selects 3 unique random games from the full pool

CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    v_all_types text[] := ARRAY[
        'RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 
        'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR', 
        'UPDOWN', 'SEQUENCE_NORMAL', 'NUMBER_DESC', 
        'SLIDER', 'ARROW'
    ];
    v_selected_types text[];
    v_first_type text;
BEGIN
    -- Select 3 unique random games
    SELECT ARRAY(
        SELECT x
        FROM unnest(v_all_types) AS x
        ORDER BY random()
        LIMIT 3
    ) INTO v_selected_types;

    v_first_type := v_selected_types[1];
    v_seed := md5(random()::text);

    UPDATE game_sessions
    SET status = 'playing',
        game_types = v_selected_types,
        current_round_index = 0,
        game_type = v_first_type,
        seed = v_seed,
        start_at = now() + interval '4 seconds',
        end_at = now() + interval '34 seconds',
        round_scores = '[]'::jsonb
    WHERE id = p_room_id AND status = 'waiting';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
