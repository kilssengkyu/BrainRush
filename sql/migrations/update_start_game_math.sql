CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_game_type text;
    v_seed text;
    v_end_at timestamptz;
BEGIN
    -- 1. Random Game Type (RPS, NUMBER, MATH)
    -- random() returns 0.0 to 1.0
    -- < 0.33 : RPS
    -- < 0.66 : NUMBER
    -- else   : MATH
    IF random() < 0.33 THEN
        v_game_type := 'RPS';
    ELSIF random() < 0.66 THEN
        v_game_type := 'NUMBER';
    ELSE
        v_game_type := 'MATH';
    END IF;

    -- 2. Generate Seed
    v_seed := md5(random()::text || clock_timestamp()::text);

    -- 3. Set End Time (30 seconds from now)
    v_end_at := now() + interval '30 seconds';

    -- 4. Update Session
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

    -- 5. Notify (Implicit via Realtime)
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
