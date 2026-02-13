-- Include level in leaderboard results
CREATE OR REPLACE FUNCTION get_leaderboard(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
    v_top_players JSON;
    v_user_rank JSON;
BEGIN
    -- Get Top 100 Players
    SELECT json_agg(t) INTO v_top_players
    FROM (
        SELECT 
            ROW_NUMBER() OVER (ORDER BY mmr DESC) as rank,
            id,
            nickname,
            avatar_url,
            country,
            mmr,
            level,
            get_tier_name(mmr) as tier
        FROM profiles
        LIMIT 100
    ) t;

    -- Get Requesting User's Specific Rank (if logged in)
    IF p_user_id IS NOT NULL THEN
        SELECT json_build_object(
            'rank', rank,
            'id', id,
            'nickname', nickname,
            'avatar_url', avatar_url,
            'country', country,
            'mmr', mmr,
            'level', level,
            'tier', get_tier_name(mmr)
        ) INTO v_user_rank
        FROM (
            SELECT 
                id, nickname, avatar_url, country, mmr, level,
                RANK() OVER (ORDER BY mmr DESC) as rank
            FROM profiles
        ) sub
        WHERE id = p_user_id;
    END IF;

    -- Return combined result
    RETURN json_build_object(
        'top_players', COALESCE(v_top_players, '[]'::json),
        'user_rank', v_user_rank
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
