-- Drop valid function if it exists to ensure clean state
DROP FUNCTION IF EXISTS get_player_match_history(UUID, TEXT, INT, INT);

-- Recreate Function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION get_player_match_history(
    p_user_id UUID,
    p_mode TEXT DEFAULT 'all',  -- 'all', 'rank', 'normal', 'friendly'
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    session_id UUID,
    game_mode TEXT,
    created_at TIMESTAMPTZ,
    result TEXT, -- 'WIN', 'LOSE', 'DRAW'
    opponent_id TEXT, -- Changed to TEXT to support guest IDs
    opponent_nickname TEXT,
    opponent_avatar_url TEXT,
    opponent_country TEXT,
    is_friend BOOLEAN
) AS $$
BEGIN
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
        -- Determine opponent ID
        (CASE
            WHEN gs.player1_id::text = p_user_id::text THEN gs.player2_id::text
            ELSE gs.player1_id::text
        END) AS opponent_id,
        p.nickname AS opponent_nickname,
        p.avatar_url AS opponent_avatar_url,
        p.country AS opponent_country,
        -- Check both directions of friendship
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
    WHERE
        (gs.player1_id::text = p_user_id::text OR gs.player2_id::text = p_user_id::text)
        AND gs.status IN ('finished', 'forfeited', 'completed') -- Only finished games
        AND gs.mode NOT ILIKE '%practice%' -- Exclude practice mode
        AND (p_mode = 'all' OR gs.mode = p_mode)
    ORDER BY
        gs.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions explicitly
GRANT EXECUTE ON FUNCTION get_player_match_history TO authenticated;
GRANT EXECUTE ON FUNCTION get_player_match_history TO service_role;
GRANT EXECUTE ON FUNCTION get_player_match_history TO anon;

-- Force schema cache reload
NOTIFY pgrst, 'reload schema';
