-- Leaderboard query optimization for scale:
-- - Keep same RPC signature (`get_leaderboard`) for frontend compatibility.
-- - Add partial indexes for global/country leaderboard filters.
-- - Avoid full-window ranking over all eligible rows for every request.

CREATE INDEX IF NOT EXISTS idx_profiles_leaderboard_global
ON public.profiles (mmr DESC, id)
WHERE COALESCE(rank_games_played, 0) >= 5;

CREATE INDEX IF NOT EXISTS idx_profiles_leaderboard_country
ON public.profiles (country, mmr DESC, id)
WHERE COALESCE(rank_games_played, 0) >= 5
  AND country IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_leaderboard(
    p_user_id uuid,
    p_country text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_top_players json;
    v_user_rank json;
    v_user_profile RECORD;
    v_rank integer;
BEGIN
    -- Top 100 rows only, then calculate rank with indexed COUNT(mmr > current_mmr).
    SELECT json_agg(t) INTO v_top_players
    FROM (
        SELECT
            (
                SELECT COUNT(*)::int + 1
                FROM public.profiles p2
                WHERE (p_country IS NULL OR p2.country = p_country)
                  AND COALESCE(p2.rank_games_played, 0) >= 5
                  AND p2.mmr > p.mmr
            ) AS rank,
            p.id,
            p.nickname,
            p.avatar_url,
            p.country,
            p.mmr,
            p.level,
            get_tier_name(p.mmr) AS tier
        FROM public.profiles p
        WHERE (p_country IS NULL OR p.country = p_country)
          AND COALESCE(p.rank_games_played, 0) >= 5
        ORDER BY p.mmr DESC, p.id ASC
        LIMIT 100
    ) t;

    IF p_user_id IS NOT NULL THEN
        SELECT
            p.id,
            p.nickname,
            p.avatar_url,
            p.country,
            p.mmr,
            p.level
        INTO v_user_profile
        FROM public.profiles p
        WHERE p.id = p_user_id
          AND (p_country IS NULL OR p.country = p_country)
          AND COALESCE(p.rank_games_played, 0) >= 5;

        IF FOUND THEN
            SELECT COUNT(*)::int + 1
            INTO v_rank
            FROM public.profiles p2
            WHERE (p_country IS NULL OR p2.country = p_country)
              AND COALESCE(p2.rank_games_played, 0) >= 5
              AND p2.mmr > v_user_profile.mmr;

            v_user_rank := json_build_object(
                'rank', v_rank,
                'id', v_user_profile.id,
                'nickname', v_user_profile.nickname,
                'avatar_url', v_user_profile.avatar_url,
                'country', v_user_profile.country,
                'mmr', v_user_profile.mmr,
                'level', v_user_profile.level,
                'tier', get_tier_name(v_user_profile.mmr)
            );
        END IF;
    END IF;

    RETURN json_build_object(
        'top_players', COALESCE(v_top_players, '[]'::json),
        'user_rank', v_user_rank
    );
END;
$$;
