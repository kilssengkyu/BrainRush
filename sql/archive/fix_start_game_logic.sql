-- FIX: Ensure Start Game Logic and Schema are correct

-- 1. Ensure columns for 3-game set exist
ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS game_types text[],
ADD COLUMN IF NOT EXISTS current_round_index int DEFAULT 0,
ADD COLUMN IF NOT EXISTS round_scores jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS mode text DEFAULT 'rank';

-- 2. Recreate start_game function
DROP FUNCTION IF EXISTS start_game(uuid);

CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    -- Ensure all game types are listed
    v_all_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'LARGEST'];
    v_selected_types text[];
    v_first_type text;
BEGIN
    -- Select 3 unique random games
    -- Use a CTE or subquery to randomize
    SELECT ARRAY(
        SELECT x 
        FROM unnest(v_all_types) AS x 
        ORDER BY random() 
        LIMIT 3
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
