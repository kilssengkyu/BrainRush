-- Public leaderboard for highscores per game type
CREATE OR REPLACE FUNCTION public.get_game_highscores(p_game_type text, p_limit integer DEFAULT 10)
RETURNS TABLE(
  user_id uuid,
  nickname text,
  avatar_url text,
  country text,
  best_score integer,
  rank integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ph.user_id,
    p.nickname,
    p.avatar_url,
    p.country,
    ph.best_score,
    ROW_NUMBER() OVER (ORDER BY ph.best_score DESC, ph.updated_at DESC) AS rank
  FROM player_highscores ph
  JOIN profiles p ON p.id = ph.user_id
  WHERE ph.game_type = p_game_type
  ORDER BY ph.best_score DESC, ph.updated_at DESC
  LIMIT p_limit;
END;
$$;
