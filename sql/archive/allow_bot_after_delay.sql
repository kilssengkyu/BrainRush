-- Allow bot matchmaking for higher levels when forced by client (after delay)

DROP FUNCTION IF EXISTS create_bot_session(text);

CREATE OR REPLACE FUNCTION create_bot_session(p_player_id text, p_force boolean DEFAULT false)
RETURNS TABLE (room_id uuid, opponent_id text) AS $$
DECLARE
    v_bot record;
    v_room_id uuid;
    v_level int;
BEGIN
    -- Ownership check if UUID
    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
         IF p_player_id != auth.uid()::text THEN RAISE EXCEPTION 'Not authorized'; END IF;
    END IF;

    -- Restrict bots for higher levels unless forced
    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
        SELECT level INTO v_level FROM profiles WHERE id = p_player_id::uuid;
        IF (v_level IS NULL OR v_level > 5) AND NOT p_force THEN
            RAISE EXCEPTION 'Bot match restricted';
        END IF;
    END IF;

    -- Remove from queue to avoid race
    DELETE FROM matchmaking_queue WHERE player_id = p_player_id;

    -- Pick a random bot profile
    SELECT * INTO v_bot FROM bot_profiles ORDER BY random() LIMIT 1;
    IF v_bot.id IS NULL THEN
        RAISE EXCEPTION 'No bot profiles available';
    END IF;

    INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode)
    VALUES (p_player_id, v_bot.id, 'waiting', 0, 'normal')
    RETURNING id INTO v_room_id;

    room_id := v_room_id;
    opponent_id := v_bot.id;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION create_bot_session(text, boolean) TO anon, authenticated, service_role;
