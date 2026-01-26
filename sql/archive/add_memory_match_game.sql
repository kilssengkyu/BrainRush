-- Add MEMORY to game_sessions check constraint
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT con.conname
        FROM pg_catalog.pg_constraint con
        INNER JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
        INNER JOIN pg_catalog.pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
        WHERE rel.relname = 'game_sessions'
          AND att.attname = 'game_type'
          AND con.contype = 'c'
    ) LOOP
        EXECUTE 'ALTER TABLE game_sessions DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_game_type_check 
CHECK (game_type IN ('RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY'));

-- Update start_game function to include MEMORY (6 games, ~16.6% each)
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_game_type text;
    v_seed text;
    v_end_at timestamptz;
    v_rand float;
BEGIN
    v_rand := random();
    
    -- Equal probability for 6 games? ~0.1666 each
     IF v_rand < 0.16 THEN
         v_game_type := 'RPS';
     ELSIF v_rand < 0.32 THEN
         v_game_type := 'NUMBER';
     ELSIF v_rand < 0.48 THEN
         v_game_type := 'MATH';
     ELSIF v_rand < 0.64 THEN
         v_game_type := 'TEN';
     ELSIF v_rand < 0.80 THEN
         v_game_type := 'COLOR';
     ELSE
         v_game_type := 'MEMORY';
     END IF;
    
    -- FOR TESTING: Force MEMORY
    --v_game_type := 'MEMORY';

    -- Generate Seed
    v_seed := md5(random()::text || clock_timestamp()::text);

    -- Set End Time (30 seconds)
    v_end_at := now() + interval '30 seconds';

    -- Update Session
    UPDATE game_sessions
    SET 
        status = 'playing',
        game_type = v_game_type,
        seed = v_seed,
        start_at = now(),
        end_at = v_end_at,
        player1_score = 0,
        player2_score = 0,
        winner_id = NULL
    WHERE id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
