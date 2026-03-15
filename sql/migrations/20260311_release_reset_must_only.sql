-- Release reset (must-reset scope only)
-- Scope:
-- 1) Rank/record fields on profiles
-- 2) Highscore + per-game record tables
-- 3) Match/session state tables
-- Keep account identity, social graph, purchases, moderation data untouched.

begin;

-- 0) Stop pending matching first
truncate table public.matchmaking_queue;

-- 1) Reset profile rank/record core fields
update public.profiles
set
  mmr = 1000,
  wins = 0,
  losses = 0,
  casual_wins = 0,
  casual_losses = 0,
  speed = 0,
  memory = 0,
  judgment = 0,
  calculation = 0,
  accuracy = 0,
  observation = 0,
  xp = 0,
  level = 1;

-- Optional newer columns (guarded for schema compatibility)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'rank_games_played'
  ) then
    execute 'update public.profiles set rank_games_played = 0';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'rank_win_streak'
  ) then
    execute 'update public.profiles set rank_win_streak = 0';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'rank_streak_updated_at'
  ) then
    execute 'update public.profiles set rank_streak_updated_at = null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'rank_lose_streak'
  ) then
    execute 'update public.profiles set rank_lose_streak = 0';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'rank_lose_bonus_date'
  ) then
    execute 'update public.profiles set rank_lose_bonus_date = null';
  end if;
end $$;

-- 2) Reset highscore + per-minigame record
truncate table public.player_highscores;
truncate table public.player_game_stats;

-- 3) Reset session/match history and transient round moves
-- NOTE:
-- - player_reports.session_id references game_sessions (ON DELETE SET NULL).
-- - TRUNCATE game_sessions is blocked by FK, so use DELETE to preserve reports.
delete from public.game_moves;
delete from public.game_sessions;

commit;

-- Post-check helpers
-- select count(*) as sessions from public.game_sessions;
-- select count(*) as highscores from public.player_highscores;
-- select count(*) as game_stats from public.player_game_stats;
-- select min(mmr) as min_mmr, max(mmr) as max_mmr from public.profiles;
