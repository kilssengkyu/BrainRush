-- Create bot session for normal mode when matchmaking is slow
CREATE OR REPLACE FUNCTION create_bot_session(p_player_id text)
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

    -- Only allow low-level users (<= 5) to use bot matchmaking
    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
        SELECT level INTO v_level FROM profiles WHERE id = p_player_id::uuid;
        IF v_level IS NULL OR v_level > 5 THEN
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

GRANT EXECUTE ON FUNCTION create_bot_session(text) TO anon, authenticated, service_role;

-- Update match history to resolve bot profiles
CREATE OR REPLACE FUNCTION get_player_match_history(
    p_user_id UUID,
    p_mode TEXT DEFAULT 'all',
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    session_id UUID,
    game_mode TEXT,
    created_at TIMESTAMPTZ,
    result TEXT,
    opponent_id TEXT,
    opponent_nickname TEXT,
    opponent_avatar_url TEXT,
    opponent_country TEXT,
    is_friend BOOLEAN
) AS $$
BEGIN
    -- Security Check: Only allow viewing own history
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Permission denied';
    END IF;

    RETURN QUERY
    SELECT
        gs.id AS session_id,
        gs.mode AS game_mode,
        gs.created_at,
        CASE
            WHEN gs.winner_id::text = p_user_id::text THEN 'WIN'
            WHEN gs.winner_id IS NULL AND gs.status IN ('completed', 'finished') THEN 'DRAW'
            ELSE 'LOSE'
        END AS result,
        (CASE
            WHEN gs.player1_id::text = p_user_id::text THEN gs.player2_id::text
            ELSE gs.player1_id::text
        END) AS opponent_id,
        COALESCE(p.nickname, b.nickname) AS opponent_nickname,
        COALESCE(p.avatar_url, b.avatar_url) AS opponent_avatar_url,
        COALESCE(p.country, b.country) AS opponent_country,
        (EXISTS (
            SELECT 1 FROM friendships f
            WHERE (f.user_id = p_user_id AND f.friend_id::text = (CASE WHEN gs.player1_id::text = p_user_id::text THEN gs.player2_id::text ELSE gs.player1_id::text END))
               OR (f.user_id::text = (CASE WHEN gs.player1_id::text = p_user_id::text THEN gs.player2_id::text ELSE gs.player1_id::text END) AND f.friend_id = p_user_id)
            AND f.status = 'accepted'
        )) AS is_friend
    FROM
        game_sessions gs
    LEFT JOIN
        profiles p ON p.id::text = (CASE WHEN gs.player1_id::text = p_user_id::text THEN gs.player2_id::text ELSE gs.player1_id::text END)
    LEFT JOIN
        bot_profiles b ON b.id = (CASE WHEN gs.player1_id::text = p_user_id::text THEN gs.player2_id::text ELSE gs.player1_id::text END)
    WHERE
        (gs.player1_id::text = p_user_id::text OR gs.player2_id::text = p_user_id::text)
        AND gs.status IN ('finished', 'forfeited', 'completed')
        AND gs.mode NOT ILIKE '%practice%'
        AND (p_mode = 'all' OR gs.mode = p_mode)
    ORDER BY
        gs.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_player_match_history(UUID, TEXT, INT, INT) TO anon, authenticated, service_role;
