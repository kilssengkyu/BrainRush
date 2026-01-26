-- Add UPDOWN to game_sessions check constraint
ALTER TABLE game_sessions
DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;

ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_game_type_check
CHECK (game_type IN ('RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR', 'UPDOWN'));

-- Update start_game function to include UPDOWN
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    -- Ensure all game types are listed including UPDOWN
    v_all_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR', 'UPDOWN'];
    v_selected_types text[];
    v_first_type text;
BEGIN
    -- For testing: Always start with UPDOWN, then pick 2 random others
    SELECT ARRAY_CAT(
        ARRAY['UPDOWN'],
        ARRAY(
            SELECT x 
            FROM unnest(v_all_types) AS x 
            WHERE x != 'UPDOWN'
            ORDER BY random() 
            LIMIT 2
        )
    ) INTO v_selected_types;

    v_first_type := v_selected_types[1];
    v_seed := md5(random()::text);

    -- Update the session to start playing
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
