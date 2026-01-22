-- Fix start_game to respect Practice Mode (Single Game, No Randomization)
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    v_mode text;
    v_current_type text;
    v_all_types text[] := ARRAY[
        'RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 
        'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR', 
        'UPDOWN', 'SEQUENCE_NORMAL', 'NUMBER_DESC', 
        'SLIDER', 'ARROW'
    ];
    v_selected_types text[];
    v_first_type text;
BEGIN
    -- Check Mode first
    SELECT mode, game_type INTO v_mode, v_current_type FROM game_sessions WHERE id = p_room_id;

    v_seed := md5(random()::text);

        UPDATE game_sessions
        SET status = 'playing',
            game_types = ARRAY[v_current_type], -- Just one game
            current_round_index = 0,
            current_round = 1, -- Fix: Explicitly set to Round 1
            seed = v_seed,
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '34 seconds', -- 30s game + 4s delay
            round_scores = '[]'::jsonb
        WHERE id = p_room_id;
    ELSE
        -- NORMAL / RANK / FRIENDLY: Select 3 unique random games
        SELECT ARRAY(
            SELECT x
            FROM unnest(v_all_types) AS x
            ORDER BY random()
            LIMIT 3
        ) INTO v_selected_types;

        v_first_type := v_selected_types[1];

        UPDATE game_sessions
        SET status = 'playing',
            game_types = v_selected_types,
            current_round_index = 0,
            current_round = 1, -- Fix: Explicitly set to Round 1
            game_type = v_first_type,
            seed = v_seed,
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '34 seconds',
            round_scores = '[]'::jsonb
        WHERE id = p_room_id AND status = 'waiting';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
