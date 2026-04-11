-- Placement gate for rank visibility: hide leaderboard/MMR ranking until 5 rank games.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rank_games_played integer NOT NULL DEFAULT 0;

-- Backfill from existing rank record columns.
UPDATE public.profiles
SET rank_games_played = GREATEST(
  COALESCE(rank_games_played, 0),
  COALESCE(wins, 0) + COALESCE(losses, 0)
)
WHERE COALESCE(rank_games_played, 0) < COALESCE(wins, 0) + COALESCE(losses, 0);

CREATE OR REPLACE FUNCTION public.increment_rank_games_played()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.mode = 'rank'
    AND NEW.status = 'finished'
    AND COALESCE(OLD.status, '') <> 'finished'
  THEN
    IF NEW.player1_id ~ '^[0-9a-fA-F-]{36}$' THEN
      UPDATE public.profiles
      SET rank_games_played = COALESCE(rank_games_played, 0) + 1
      WHERE id = NEW.player1_id::uuid;
    END IF;

    IF NEW.player2_id ~ '^[0-9a-fA-F-]{36}$' THEN
      UPDATE public.profiles
      SET rank_games_played = COALESCE(rank_games_played, 0) + 1
      WHERE id = NEW.player2_id::uuid;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_rank_games_played ON public.game_sessions;

CREATE TRIGGER trg_increment_rank_games_played
AFTER UPDATE ON public.game_sessions
FOR EACH ROW
EXECUTE FUNCTION public.increment_rank_games_played();

CREATE OR REPLACE FUNCTION public.get_leaderboard(p_user_id uuid, p_country text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_top_players JSON;
    v_user_rank JSON;
BEGIN
    -- Get Top 100 qualified players only (placement completed).
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
        WHERE (p_country IS NULL OR country = p_country)
          AND COALESCE(rank_games_played, 0) >= 5
        LIMIT 100
    ) t;

    -- User rank is also visible only after placement completion.
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
            WHERE (p_country IS NULL OR country = p_country)
              AND COALESCE(rank_games_played, 0) >= 5
        ) sub
        WHERE id = p_user_id;
    END IF;

    RETURN json_build_object(
        'top_players', COALESCE(v_top_players, '[]'::json),
        'user_rank', v_user_rank
    );
END;
$$;
