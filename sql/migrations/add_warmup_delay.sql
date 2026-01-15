-- Add delay to start_game
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_game_type text;
    v_seed text;
    v_start_at timestamptz;
    v_end_at timestamptz;
    v_rand float;
BEGIN
    v_rand := random();
    
    -- Equal probability for 5 games? 0.20 each
    IF v_rand < 0.20 THEN
        v_game_type := 'RPS';
    ELSIF v_rand < 0.40 THEN
        v_game_type := 'NUMBER';
    ELSIF v_rand < 0.60 THEN
        v_game_type := 'MATH';
    ELSIF v_rand < 0.80 THEN
        v_game_type := 'TEN';
    ELSE
        v_game_type := 'COLOR';
    END IF;
    
    -- UNCOMMENT TO RESTORE RANDOMNESS (Currently Testing Loop)
    -- v_game_type := 'COLOR'; 

    -- Generate Seed
    v_seed := md5(random()::text || clock_timestamp()::text);

    -- Set Start Time (Now + 4 seconds for Warm-up/Tutorial)
    v_start_at := now() + interval '4 seconds';

    -- Set End Time (Start + 30 seconds)
    v_end_at := v_start_at + interval '30 seconds';

    -- Update Session
    UPDATE game_sessions
    SET 
        status = 'playing',
        game_type = v_game_type,
        seed = v_seed,
        start_at = v_start_at,
        end_at = v_end_at,
        player1_score = 0,
        player2_score = 0,
        winner_id = NULL
    WHERE id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
