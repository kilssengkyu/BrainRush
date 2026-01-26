-- Migration to add 'SLIDER' game type by updating constraint
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find checking constraints on the game_type column
    FOR r IN (
        SELECT con.conname
        FROM pg_catalog.pg_constraint con
        INNER JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
        INNER JOIN pg_catalog.pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
        WHERE rel.relname = 'game_sessions'
          AND att.attname = 'game_type'
          AND con.contype = 'c' -- 'c' for check constraint
    ) LOOP
        -- Dynamically drop the constraint
        EXECUTE 'ALTER TABLE game_sessions DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- Add the new inclusive constraint including SLIDER, SEQUENCE_NORMAL, NUMBER_DESC, UPDOWN, PAIR
ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_game_type_check 
CHECK (game_type IN ('RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR', 'UPDOWN', 'SEQUENCE_NORMAL', 'NUMBER_DESC', 'SLIDER'));

-- We also need to update the start_game function to include 'SLIDER' in the randomization pool
-- Update the v_all_types array in start_game function
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    v_all_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'PAIR', 'UPDOWN', 'SEQUENCE_NORMAL', 'NUMBER_DESC', 'SLIDER'];
    v_selected_types text[];
    v_first_type text;
BEGIN
    -- TEST MODE: Force SLIDER first, then 2 random games
    v_selected_types := ARRAY['SLIDER'];

    SELECT v_selected_types || ARRAY(
        SELECT x
        FROM unnest(v_all_types) AS x
        WHERE x != 'SLIDER'
        ORDER BY random()
        LIMIT 2
    ) INTO v_selected_types;

    -- Skip shuffling to ensure SLIDER is first
    -- SELECT ARRAY(
    --     SELECT x
    --     FROM unnest(v_selected_types) AS x
    --     ORDER BY random()
    -- ) INTO v_selected_types;

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
