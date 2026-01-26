-- Add NUMBER_DESC to game_sessions check constraint
ALTER TABLE game_sessions
DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;

ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_game_type_check
CHECK (game_type IN ('RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'NUMBER_DESC'));

-- Update start_game function to include NUMBER_DESC
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    -- Ensure all game types are listed including NUMBER_DESC
    v_all_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'NUMBER_DESC'];
    v_selected_types text[];
    v_first_type text;
BEGIN
    -- Select 3 unique random games from the full list
    SELECT array_agg(x) INTO v_selected_types
    FROM (
        SELECT x FROM unnest(v_all_types) AS x ORDER BY random() LIMIT 3
    ) t;

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
