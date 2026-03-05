CREATE OR REPLACE FUNCTION public.get_leaderboard(
    p_user_id uuid,
    p_country text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_top_players JSON;
    v_user_rank JSON;
BEGIN
    SELECT json_agg(t) INTO v_top_players
    FROM (
        SELECT
            ROW_NUMBER() OVER (ORDER BY mmr DESC) AS rank,
            id,
            nickname,
            avatar_url,
            country,
            mmr,
            get_tier_name(mmr) AS tier
        FROM profiles
        WHERE p_country IS NULL OR country = p_country
        LIMIT 100
    ) t;

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
                id,
                nickname,
                avatar_url,
                country,
                mmr,
                RANK() OVER (ORDER BY mmr DESC) AS rank
            FROM profiles
            WHERE p_country IS NULL OR country = p_country
        ) sub
        WHERE id = p_user_id;
    END IF;

    RETURN json_build_object(
        'top_players', COALESCE(v_top_players, '[]'::json),
        'user_rank', v_user_rank
    );
END;
$$;
