CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    v_types text[] := ARRAY['RPS', 'NUMBER']; -- Available games
    v_selected_type text;
BEGIN
    v_seed := md5(random()::text);
    v_selected_type := v_types[floor(random()*array_length(v_types, 1) + 1)];

    UPDATE game_sessions
    SET status = 'playing',
        game_type = v_selected_type,
        seed = v_seed,
        start_at = now(),
        end_at = now() + interval '30 seconds' -- Changed to 30s
    WHERE id = p_room_id AND status = 'waiting';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
