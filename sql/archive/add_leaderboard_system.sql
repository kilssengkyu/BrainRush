-- 1. Create Index for fast leaderboard queries
CREATE INDEX IF NOT EXISTS idx_profiles_mmr ON profiles (mmr DESC);

-- 2. Helper Function to calculate Tier from MMR
CREATE OR REPLACE FUNCTION get_tier_name(p_mmr INT)
RETURNS TEXT AS $$
BEGIN
    IF p_mmr >= 2500 THEN RETURN 'Diamond';
    ELSIF p_mmr >= 2000 THEN RETURN 'Platinum';
    ELSIF p_mmr >= 1500 THEN RETURN 'Gold';
    ELSIF p_mmr >= 1200 THEN RETURN 'Silver';
    ELSE RETURN 'Bronze';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Leaderboard RPC
-- Returns top 100 players + the requesting user's rank/info
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
            'tier', get_tier_name(mmr)
        ) INTO v_user_rank
        FROM (
            SELECT 
                id, nickname, avatar_url, country, mmr,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
