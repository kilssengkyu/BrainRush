--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: cancel_friendly_session(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_friendly_session(p_room_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE game_sessions
  SET status = 'finished',
      end_at = now()
  WHERE id = p_room_id
    AND mode = 'friendly'
    AND status = 'waiting'
    AND (player1_id = auth.uid()::text OR player2_id = auth.uid()::text);
END;
$$;


--
-- Name: check_active_session(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_active_session(p_player_id text) RETURNS TABLE(room_id uuid, opponent_id text, status text, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
BEGIN
    -- If UUID, enforce ownership for authenticated users
    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
        IF auth.uid() IS NOT NULL AND p_player_id != auth.uid()::text THEN
            RAISE EXCEPTION 'Not authorized';
        END IF;
    END IF;

    -- Return only recent, non-finished sessions with valid opponent
    RETURN QUERY
    SELECT 
        gs.id as room_id,
        CASE 
            WHEN gs.player1_id = p_player_id THEN gs.player2_id 
            ELSE gs.player1_id 
        END as opponent_id,
        gs.status,
        gs.created_at
    FROM game_sessions gs
    WHERE (gs.player1_id = p_player_id OR gs.player2_id = p_player_id)
      AND gs.status != 'finished'
      AND gs.player1_id IS NOT NULL
      AND gs.player2_id IS NOT NULL
      AND gs.mode IS DISTINCT FROM 'practice'
      AND (
          (gs.status = 'waiting' AND gs.created_at > (now() - interval '60 seconds'))
          OR
          (gs.status != 'waiting' AND gs.created_at > (now() - interval '1 hour'))
      )
    ORDER BY gs.created_at DESC
    LIMIT 1;
END;
$_$;


--
-- Name: consume_pencil(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_pencil(user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    current_pencils INTEGER;
BEGIN
    -- Security Check
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot consume pencil of another user';
    END IF;

    SELECT p.pencils INTO current_pencils FROM public.profiles p WHERE p.id = user_id;

    IF current_pencils > 0 THEN
        UPDATE public.profiles 
        SET pencils = pencils - 1,
            last_recharge_at = CASE WHEN pencils = 5 THEN NOW() ELSE last_recharge_at END
        WHERE id = user_id;
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;


--
-- Name: create_bot_session(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_bot_session(p_player_id text) RETURNS TABLE(room_id uuid, opponent_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
$_$;


--
-- Name: create_practice_session(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_practice_session(p_player_id text, p_game_type text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Insert with mode='practice'
  INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode, game_type)
  VALUES (p_player_id, 'practice_solo', 'waiting', 0, 'practice', p_game_type)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;


--
-- Name: create_session(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_session(p_player1_id text, p_player2_id text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Security Check
  IF p_player1_id != auth.uid()::text THEN
    RAISE EXCEPTION 'Not authorized to create session for another user';
  END IF;

  INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode)
  VALUES (auth.uid()::text, p_player2_id, 'waiting', 0, 'friendly')
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;


--
-- Name: delete_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_account() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Clean up dependent rows that reference auth.users
  DELETE FROM public.friendships WHERE user_id::text = auth.uid()::text OR friend_id::text = auth.uid()::text;
  DELETE FROM public.chat_messages WHERE sender_id::text = auth.uid()::text OR receiver_id::text = auth.uid()::text;
  DELETE FROM public.matchmaking_queue WHERE player_id::text = auth.uid()::text;

  -- Delete profile (cascades to per-game stats/highscores)
  DELETE FROM public.profiles WHERE id::text = auth.uid()::text;

  -- Delete the user from Auth
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;


--
-- Name: find_match(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_match(p_min_mmr integer, p_max_mmr integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_my_id uuid := auth.uid();
  v_opponent_id uuid;
  v_room_id uuid;
  v_my_mmr int;
BEGIN
  -- Get my current MMR for the queue record
  SELECT mmr INTO v_my_mmr FROM public.profiles WHERE id = v_my_id;

  -- 1. Try to find an opponent
  SELECT player_id INTO v_opponent_id
  FROM matchmaking_queue
  WHERE mmr >= p_min_mmr 
    AND mmr <= p_max_mmr
    AND player_id != v_my_id
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_opponent_id IS NOT NULL THEN
    -- 2. Match Found!
    DELETE FROM matchmaking_queue WHERE player_id IN (v_my_id, v_opponent_id);
    
    -- Create session (Rank Mode)
    INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode)
    VALUES (v_my_id::text, v_opponent_id::text, 'waiting', 0, 'rank')
    RETURNING id INTO v_room_id;
    
    RETURN v_room_id;
  ELSE
    -- 3. No match found, ensure I am in the queue
    INSERT INTO matchmaking_queue (player_id, mmr)
    VALUES (v_my_id, v_my_mmr)
    ON CONFLICT (player_id) DO UPDATE
    SET mmr = v_my_mmr, created_at = now();
    
    RETURN NULL;
  END IF;
END;
$$;


--
-- Name: find_match(integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_match(p_min_mmr integer, p_max_mmr integer, p_player_id text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  -- Use the passed ID. 
  v_my_id text := p_player_id;
  v_opponent_id text;
  v_room_id uuid;
  v_my_mmr int;
begin
  -- Get my current MMR. If I am a guest, default to 1000.
  -- We try to find a profile first.
  select mmr into v_my_mmr from public.profiles where id::text = v_my_id;
  
  if v_my_mmr is null then
    v_my_mmr := 1000; -- Default Guest MMR
  end if;

  -- 1. Try to find an opponent
  -- Lock the row to prevent race conditions
  select player_id into v_opponent_id
  from matchmaking_queue
  where mmr >= p_min_mmr 
    and mmr <= p_max_mmr
    and player_id != v_my_id
  order by created_at asc
  limit 1
  for update skip locked;

  if v_opponent_id is not null then
    -- 2. Match Found!
    -- Remove both from queue
    delete from matchmaking_queue where player_id in (v_my_id, v_opponent_id);
    
    -- Create session
    -- Note: game_sessions player columns are already TEXT type, so this allows guests.
    insert into game_sessions (player1_id, player2_id, status, current_round)
    values (v_my_id, v_opponent_id, 'waiting', 0)
    returning id into v_room_id;
    
    return v_room_id;
  else
    -- 3. No match found, ensure I am in the queue
    insert into matchmaking_queue (player_id, mmr)
    values (v_my_id, v_my_mmr)
    on conflict (player_id) do update
    set mmr = v_my_mmr, created_at = now(); -- Update heartbeat
    
    return null;
  end if;
end;
$$;


--
-- Name: find_match(integer, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_match(p_min_mmr integer, p_max_mmr integer, p_player_id text, p_mode text DEFAULT 'rank'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
    v_opponent_id text;
    v_room_id uuid;
    v_level int;
BEGIN
    -- [SECURE] Verify ownership if UUID
    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
         IF p_player_id != auth.uid()::text THEN RAISE EXCEPTION 'Not authorized'; END IF;
    END IF;

    -- Rank gate: require authenticated user with level >= 5
    IF p_mode = 'rank' THEN
        IF p_player_id !~ '^[0-9a-fA-F-]{36}$' THEN
            RAISE EXCEPTION 'Rank requires login';
        END IF;

        SELECT level INTO v_level FROM profiles WHERE id = p_player_id::uuid;
        IF v_level IS NULL OR v_level < 5 THEN
            RAISE EXCEPTION 'Rank requires level 5';
        END IF;
    END IF;

    -- A. Cleanup Stale Entries
    DELETE FROM matchmaking_queue 
    WHERE updated_at < (now() - interval '60 seconds');

    -- B. Find Opponent
    SELECT player_id INTO v_opponent_id
    FROM matchmaking_queue
    WHERE player_id != p_player_id
      AND mmr BETWEEN p_min_mmr AND p_max_mmr
      AND mode = p_mode
      AND updated_at > (now() - interval '30 seconds')
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    -- C. Match Found?
    IF v_opponent_id IS NOT NULL THEN
        INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode)
        VALUES (p_player_id, v_opponent_id, 'waiting', 0, p_mode)
        RETURNING id INTO v_room_id;

        DELETE FROM matchmaking_queue WHERE player_id IN (p_player_id, v_opponent_id);
        RETURN v_room_id;
    END IF;

    -- D. No match -> Upsert Self
    INSERT INTO matchmaking_queue (player_id, mmr, mode, updated_at)
    VALUES (p_player_id, (p_min_mmr + p_max_mmr) / 2, p_mode, now())
    ON CONFLICT (player_id) 
    DO UPDATE SET 
        mmr = EXCLUDED.mmr,
        mode = EXCLUDED.mode,
        updated_at = now();

    RETURN NULL;
END;
$_$;


--
-- Name: finish_game(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finish_game(p_room_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
    v_session record;
    v_winner text;
    v_loser text;
    v_is_draw boolean := false;
    v_k_factor int := 32;
    v_p1_mmr int;
    v_p2_mmr int;
    v_p1_exp float;
    v_p2_exp float;
    v_new_p1_mmr int;
    v_new_p2_mmr int;
    
    v_p1_total int := 0;
    v_p2_total int := 0;
    v_round jsonb;
BEGIN
    -- [SECURE] Caller Check
    IF NOT EXISTS (SELECT 1 FROM game_sessions WHERE id = p_room_id 
        AND (player1_id = auth.uid()::text OR player2_id = auth.uid()::text)) THEN
       RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT * INTO v_session FROM game_sessions WHERE id = p_room_id;
    
    -- Status check
    IF v_session.status = 'finished' THEN RETURN; END IF;

    -- Calculate Totals
    SELECT round_scores INTO v_session.round_scores FROM game_sessions WHERE id = p_room_id;

    FOR v_round IN SELECT * FROM jsonb_array_elements(v_session.round_scores)
    LOOP
        v_p1_total := v_p1_total + (v_round->>'p1_score')::int;
        v_p2_total := v_p2_total + (v_round->>'p2_score')::int;
    END LOOP;

    -- Determine Winner
    IF v_p1_total > v_p2_total THEN
        v_winner := v_session.player1_id;
        v_loser := v_session.player2_id;
    ELSIF v_p2_total > v_p1_total THEN
        v_winner := v_session.player2_id;
        v_loser := v_session.player1_id;
    ELSE
        v_is_draw := true;
    END IF;

    -- Update Session
    UPDATE game_sessions 
    SET status = 'finished', 
        winner_id = v_winner, 
        end_at = now(),
        player1_score = v_p1_total,
        player2_score = v_p2_total
    WHERE id = p_room_id;

    -- STATS UPDATE LOGIC
    IF v_winner IS NOT NULL AND NOT v_is_draw THEN
        IF v_session.mode = 'rank' THEN
             -- RANK MODE: Update MMR + Standard Wins/Losses (only for real users)
             IF v_session.player1_id ~ '^[0-9a-fA-F-]{36}$' AND v_session.player2_id ~ '^[0-9a-fA-F-]{36}$' THEN
                 SELECT mmr INTO v_p1_mmr FROM profiles WHERE id = v_session.player1_id::uuid;
                 SELECT mmr INTO v_p2_mmr FROM profiles WHERE id = v_session.player2_id::uuid;
                 
                 v_p1_exp := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::numeric / 400.0));
                 v_p2_exp := 1.0 / (1.0 + power(10.0, (v_p1_mmr - v_p2_mmr)::numeric / 400.0));

                 IF v_winner = v_session.player1_id::text THEN
                    v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (1 - v_p1_exp));
                    v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (0 - v_p2_exp));
                    
                    UPDATE profiles SET mmr = v_new_p1_mmr, wins = wins + 1 WHERE id = v_session.player1_id::uuid;
                    UPDATE profiles SET mmr = v_new_p2_mmr, losses = losses + 1 WHERE id = v_session.player2_id::uuid;
                 ELSE
                    v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (0 - v_p1_exp));
                    v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (1 - v_p2_exp));
                    
                    UPDATE profiles SET mmr = v_new_p1_mmr, losses = losses + 1 WHERE id = v_session.player1_id::uuid;
                    UPDATE profiles SET mmr = v_new_p2_mmr, wins = wins + 1 WHERE id = v_session.player2_id::uuid;
                 END IF;
             END IF;
        ELSIF v_session.mode = 'normal' THEN
             -- NORMAL MODE: Update Casual Wins/Losses (No MMR)
             IF v_winner ~ '^[0-9a-fA-F-]{36}$' THEN
                 UPDATE profiles SET casual_wins = casual_wins + 1 WHERE id = v_winner::uuid;
             END IF;
             IF v_loser ~ '^[0-9a-fA-F-]{36}$' THEN
                 UPDATE profiles SET casual_losses = casual_losses + 1 WHERE id = v_loser::uuid;
             END IF;
        ELSE
            -- FRIENDLY or PRACTICE MODE: Do NOT update any stats
            -- Just finish the session (already done above)
        END IF;
    END IF;

    -- XP/Level Update (Rank + Normal only)
    IF v_session.mode IN ('rank', 'normal') THEN
        IF v_session.player1_id ~ '^[0-9a-fA-F-]{36}$' THEN
            UPDATE profiles
            SET xp = COALESCE(xp, 0) + (10 + CASE WHEN v_winner = v_session.player1_id THEN 5 ELSE 0 END),
                level = floor((-(45)::numeric + sqrt((45 * 45) + (40 * (COALESCE(xp, 0) + (10 + CASE WHEN v_winner = v_session.player1_id THEN 5 ELSE 0 END))))) / 10) + 1
            WHERE id = v_session.player1_id::uuid;
        END IF;

        IF v_session.player2_id ~ '^[0-9a-fA-F-]{36}$' THEN
            UPDATE profiles
            SET xp = COALESCE(xp, 0) + (10 + CASE WHEN v_winner = v_session.player2_id THEN 5 ELSE 0 END),
                level = floor((-(45)::numeric + sqrt((45 * 45) + (40 * (COALESCE(xp, 0) + (10 + CASE WHEN v_winner = v_session.player2_id THEN 5 ELSE 0 END))))) / 10) + 1
            WHERE id = v_session.player2_id::uuid;
        END IF;
    END IF;
END;
$_$;


--
-- Name: get_leaderboard(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_leaderboard(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: get_player_match_history(uuid, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_player_match_history(p_user_id uuid, p_mode text DEFAULT 'all'::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0) RETURNS TABLE(session_id uuid, game_mode text, created_at timestamp with time zone, result text, opponent_id text, opponent_nickname text, opponent_avatar_url text, opponent_country text, is_friend boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: get_profile_with_pencils(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_profile_with_pencils(user_id uuid) RETURNS TABLE(pencils integer, last_recharge_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    current_pencils INTEGER;
    last_time TIMESTAMPTZ;
    time_diff INTERVAL;
    recharge_amount INTEGER;
    new_last_time TIMESTAMPTZ;
BEGIN
    -- Security Check
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot access pencil data of another user';
    END IF;

    -- Get current state
    SELECT p.pencils, p.last_recharge_at 
    INTO current_pencils, last_time 
    FROM public.profiles p 
    WHERE p.id = user_id;

    -- If null (shouldn't happen for existing users if default applied, but safe check)
    IF current_pencils IS NULL THEN
        current_pencils := 5;
        last_time := NOW();
        UPDATE public.profiles SET pencils = 5, last_recharge_at = NOW() WHERE id = user_id;
    END IF;

    -- Calculate recharge if below 5
    IF current_pencils < 5 THEN
        time_diff := NOW() - last_time;
        -- 1 pencil every 10 minutes
        recharge_amount := FLOOR(EXTRACT(EPOCH FROM time_diff) / 600); -- 600 sec = 10 min

        IF recharge_amount > 0 THEN
            current_pencils := LEAST(5, current_pencils + recharge_amount);
            
            IF current_pencils = 5 THEN
                new_last_time := NOW(); 
            ELSE
                new_last_time := last_time + (recharge_amount * INTERVAL '10 minutes');
            END IF;

            -- Update DB
            UPDATE public.profiles 
            SET pencils = current_pencils, 
                last_recharge_at = new_last_time 
            WHERE id = user_id;
            
            last_time := new_last_time;
        END IF;
    END IF;

    RETURN QUERY SELECT current_pencils, last_time;
END;
$$;


--
-- Name: get_server_time(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_server_time() RETURNS timestamp with time zone
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN now();
END;
$$;


--
-- Name: get_tier_name(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tier_name(p_mmr integer) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
    IF p_mmr >= 2500 THEN RETURN 'Diamond';
    ELSIF p_mmr >= 2000 THEN RETURN 'Platinum';
    ELSIF p_mmr >= 1500 THEN RETURN 'Gold';
    ELSIF p_mmr >= 1200 THEN RETURN 'Silver';
    ELSE RETURN 'Bronze';
    END IF;
END;
$$;


--
-- Name: grant_ads_removal(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grant_ads_removal(user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot grant ads removal for another user';
    END IF;

    UPDATE public.profiles
    SET ads_removed = TRUE
    WHERE id = user_id;

    RETURN TRUE;
END;
$$;


--
-- Name: grant_pencils(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grant_pencils(user_id uuid, amount integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot grant pencils for another user';
    END IF;

    IF amount IS NULL OR amount <= 0 OR amount > 1000 THEN
        RAISE EXCEPTION 'Invalid pencil amount';
    END IF;

    UPDATE public.profiles
    SET pencils = pencils + amount
    WHERE id = user_id;

    RETURN TRUE;
END;
$$;


--
-- Name: handle_disconnection(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_disconnection(p_room_id uuid, p_leaver_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_p1 text; v_p2 text;
  v_winner_id text;
  v_leaver_mmr int; v_winner_mmr int;
  v_k int := 32;
  v_p1_score int; v_p2_score int;
  v_leaver_score_penalty int := -1; -- Or just 0 points? Treating as forfeit.
BEGIN
  -- Get Session Info
  select player1_id, player2_id, player1_score, player2_score 
  into v_p1, v_p2, v_p1_score, v_p2_score
  from game_sessions where id = p_room_id;

  -- Validate Leaver is in the room
  if v_p1 != p_leaver_id and v_p2 != p_leaver_id then
      raise exception 'Leaver not found in this room';
  end if;

  -- Identify Winner
  if v_p1 = p_leaver_id then
      v_winner_id := v_p2;
  else
      v_winner_id := v_p1;
  end if;

  -- Fetch MMRs
  select mmr into v_leaver_mmr from public.profiles where id = p_leaver_id::uuid;
  select mmr into v_winner_mmr from public.profiles where id = v_winner_id::uuid;

  -- Calculate MMR Change (Treat calculation as if Winner won against Leaver)
  -- Standard Elo calculation
  declare
      v_expect_winner float;
      v_expect_leaver float;
      v_winner_chg int;
      v_leaver_chg int;
  begin
      v_expect_winner := 1.0 / (1.0 + power(10.0, (v_leaver_mmr - v_winner_mmr)::float / 400.0));
      v_expect_leaver := 1.0 / (1.0 + power(10.0, (v_winner_mmr - v_leaver_mmr)::float / 400.0));

      v_winner_chg := round(v_k * (1.0 - v_expect_winner)); -- Actual result is 1.0 (Win)
      v_leaver_chg := round(v_k * (0.0 - v_expect_leaver)); -- Actual result is 0.0 (Loss)
      
      -- Update Leaver Profile (Disconnect +1, MMR down, NO Loss increase)
      update public.profiles 
      set mmr = mmr + v_leaver_chg, 
          disconnects = disconnects + 1 
      where id = p_leaver_id::uuid;

      -- Update Winner Profile (Win +1, MMR up)
      update public.profiles 
      set mmr = mmr + v_winner_chg, 
          wins = wins + 1 
      where id = v_winner_id::uuid;

      -- Close Session
      -- Give Winner 3 points to signify victory (or just mark finished)
      if v_winner_id = v_p1 then
          v_p1_score := 3;
      else
          v_p2_score := 3;
      end if;

      update game_sessions 
      set status = 'finished', 
          phase_end_at = now(),
          player1_score = v_p1_score,
          player2_score = v_p2_score,
          player1_mmr_change = case when v_p1 = v_winner_id then v_winner_chg else v_leaver_chg end,
          player2_mmr_change = case when v_p2 = v_winner_id then v_winner_chg else v_leaver_chg end
      where id = p_room_id;
  end;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, nickname)
  values (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'avatar_url',
    'Player_' || floor(random() * 9000 + 1000)::text
  );
  return new;
end;
$$;


--
-- Name: next_round(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_round(p_room_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_session record;
    v_new_type text;
    v_new_index int;
    v_seed text;
    v_round_record jsonb;
BEGIN
    SELECT * INTO v_session FROM game_sessions WHERE id = p_room_id FOR UPDATE;

    -- Practice Mode: finish immediately after Round 1 (or on timeout)
    IF v_session.mode = 'practice' THEN
        UPDATE game_sessions
        SET status = 'finished',
            end_at = now()
        WHERE id = p_room_id;
        RETURN;
    END IF;

    -- Safety check
    IF v_session.status = 'finished' THEN RETURN; END IF;

    -- Record scores from the JUST FINISHED round
    v_round_record := jsonb_build_object(
        'round', v_session.current_round_index + 1,
        'p1_score', v_session.player1_score,
        'p2_score', v_session.player2_score,
        'game_type', v_session.game_type
    );

    UPDATE game_sessions 
    SET round_scores = round_scores || v_round_record,
        player1_score = 0,
        player2_score = 0
    WHERE id = p_room_id;

    -- Check if we have more rounds
    IF v_session.current_round_index < 2 THEN
        v_new_index := v_session.current_round_index + 1;
        v_new_type := v_session.game_types[v_new_index + 1];
        v_seed := md5(random()::text);

        UPDATE game_sessions
        SET current_round_index = v_new_index,
            game_type = v_new_type,
            seed = v_seed,
            start_at = now() + interval '6 seconds',
            end_at = now() + interval '36 seconds'
        WHERE id = p_room_id;
    ELSE
        PERFORM finish_game(p_room_id);
    END IF;
END;
$$;


--
-- Name: resolve_round(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_round(p_room_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_game_type text; v_round int; v_p1 text; v_p2 text;
  v_p1_move text; v_p2_move text;
  v_p1_score int; v_p2_score int;
BEGIN
  select game_type, current_round, player1_id, player2_id, player1_score, player2_score
  into v_game_type, v_round, v_p1, v_p2, v_p1_score, v_p2_score
  from game_sessions where id = p_room_id and status = 'playing';

  if not found then return; end if;

  if v_game_type like 'NUMBER%' then
      select move into v_p1_move from game_moves where room_id = p_room_id and round = v_round and player_id = v_p1 and move like 'DONE:%' limit 1;
      select move into v_p2_move from game_moves where room_id = p_room_id and round = v_round and player_id = v_p2 and move like 'DONE:%' limit 1;
      
      if v_p1_move is not null and v_p2_move is null then v_p1_score := v_p1_score + 3;
      elsif v_p2_move is not null and v_p1_move is null then v_p2_score := v_p2_score + 3;
      end if;
      
      update game_sessions set player1_score = v_p1_score, player2_score = v_p2_score where id = p_room_id;
      
      if v_p1_score >= 3 or v_p2_score >= 3 then
         update game_sessions set status = 'finished', phase_end_at = now() where id = p_room_id;
         perform update_mmr(p_room_id);
      else
         update game_sessions set status = 'round_end', phase_end_at = now() where id = p_room_id;
      end if;
  else
      update game_sessions set status = 'round_end', phase_end_at = now() where id = p_room_id;
  end if;
END;
$$;


--
-- Name: reward_ad_pencils(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reward_ad_pencils(user_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    new_count INTEGER;
    current_count INTEGER;
    current_day DATE;
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot reward pencils for another user';
    END IF;

    SELECT p.ad_reward_count, p.ad_reward_day
    INTO current_count, current_day
    FROM public.profiles p
    WHERE p.id = user_id
    FOR UPDATE;

    IF current_count IS NULL THEN
        current_count := 0;
    END IF;

    IF current_day IS NULL OR current_day <> CURRENT_DATE THEN
        current_count := 0;
        current_day := CURRENT_DATE;
    END IF;

    IF current_count >= 5 THEN
        RAISE EXCEPTION 'Daily ad reward limit reached';
    END IF;

    UPDATE public.profiles
    SET pencils = pencils + 2,
        ad_reward_count = current_count + 1,
        ad_reward_day = current_day
    WHERE id = user_id
    RETURNING pencils INTO new_count;

    RETURN new_count;
END;
$$;


--
-- Name: set_player_ready(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_player_ready(p_room_id uuid, p_player_id text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_p1 text;
    v_p2 text;
BEGIN
    SELECT player1_id, player2_id INTO v_p1, v_p2
    FROM game_sessions
    WHERE id = p_room_id;

    IF v_p1 = p_player_id THEN
        UPDATE game_sessions SET player1_ready = true WHERE id = p_room_id;
    ELSIF v_p2 = p_player_id THEN
        UPDATE game_sessions SET player2_ready = true WHERE id = p_room_id;
    END IF;
END;
$$;


--
-- Name: start_game(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_game(p_room_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_seed text;
    v_mode text;
    v_current_type text;
    v_all_types text[] := ARRAY[
        'RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 
        'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR', 
        'UPDOWN', 'SEQUENCE_NORMAL', 'NUMBER_DESC', 
        'SLIDER', 'ARROW', 'BLANK', 'OPERATOR', 'LADDER', 'TAP_COLOR', 'AIM', 'MOST_COLOR', 'SORTING', 'SPY'
    ];
    v_selected_types text[];
    v_first_type text;
BEGIN
    SELECT mode, game_type INTO v_mode, v_current_type FROM game_sessions WHERE id = p_room_id;
    v_seed := md5(random()::text);

    IF v_mode = 'practice' THEN
        -- PRACTICE: Start immediately
        UPDATE game_sessions
        SET status = 'playing',
            game_types = ARRAY[v_current_type], 
            current_round_index = 0,
            current_round = 1, 
            seed = v_seed,
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '34 seconds',
            round_scores = '[]'::jsonb
        WHERE id = p_room_id;
    ELSE
        -- NORMAL/RANK: Random 3 games
        SELECT ARRAY(
            SELECT x
            FROM unnest(v_all_types) AS x
            ORDER BY random()
            LIMIT 3
        ) INTO v_selected_types;

        v_first_type := v_selected_types[1];

        UPDATE game_sessions
        SET status = 'playing',
            game_types = v_selected_types,
            current_round_index = 0,
            current_round = 1,
            game_type = v_first_type,
            seed = v_seed,
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '34 seconds',
            round_scores = '[]'::jsonb
        WHERE id = p_room_id AND status = 'waiting';
    END IF;
END;
$$;


--
-- Name: start_next_round(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_next_round(p_room_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_next_type text;
  v_current_type text;
  v_status text;
  v_current_round int;
  v_next_round int;
  v_next_round_index int;
  
  -- Scores (Wins)
  v_p1_wins int;
  v_p2_wins int;
  
  -- Current Points
  v_p1_points int;
  v_p2_points int;
  
  v_game_data jsonb;
  v_target text;
  v_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW', 'NUMBER_DESC', 'BLANK', 'OPERATOR', 'LADDER', 'TAP_COLOR', 'AIM', 'MOST_COLOR', 'SORTING', 'SPY'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
  
  v_round_snapshot jsonb;
  v_mode text;
  v_p1_id text;
  v_p2_id text;
BEGIN
  -- Get current state
  SELECT game_type, status, COALESCE(current_round, 0), player1_score, player2_score, COALESCE(p1_current_score, 0), COALESCE(p2_current_score, 0), mode, player1_id, player2_id
  INTO v_current_type, v_status, v_current_round, v_p1_wins, v_p2_wins, v_p1_points, v_p2_points, v_mode, v_p1_id, v_p2_id
  FROM game_sessions WHERE id = p_room_id
  FOR UPDATE;

  -- Graceful Exit if Room Not Found
  IF v_status IS NULL THEN
      RETURN;
  END IF;

  IF v_status = 'finished' THEN
      RETURN;
  END IF;

  -- Race Condition Fix: If already in countdown, do not advance round again.
  IF v_status = 'countdown' THEN
      RETURN;
  END IF;

  -- 1. Snapshot Previous Round (if not first round)
  IF v_current_round > 0 THEN
      -- Determine Round Winner based on POINTS
      IF v_p1_points > v_p2_points THEN
          v_p1_wins := v_p1_wins + 1;
      ELSIF v_p2_points > v_p1_points THEN
          v_p2_wins := v_p2_wins + 1;
      END IF;

      -- Create Snapshot Object
      v_round_snapshot := jsonb_build_object(
          'round', v_current_round,
          'game_type', v_current_type,
          'p1_score', v_p1_points,
          'p2_score', v_p2_points,
          'winner', CASE WHEN v_p1_points > v_p2_points THEN 'p1' WHEN v_p2_points > v_p1_points THEN 'p2' ELSE 'draw' END
      );

      -- Update Session: Add Snapshot, Update Wins, RESET Current Points
      UPDATE game_sessions
      SET round_scores = COALESCE(round_scores, '[]'::jsonb) || jsonb_build_array(v_round_snapshot),
          player1_score = v_p1_wins,
          player2_score = v_p2_wins,
          p1_current_score = 0,
          p2_current_score = 0
      WHERE id = p_room_id;

      -- Update highscores (per minigame)
      IF v_current_type IS NOT NULL THEN
          IF v_p1_id ~ '^[0-9a-fA-F-]{36}$' THEN
              INSERT INTO player_highscores (user_id, game_type, best_score, updated_at)
              VALUES (v_p1_id::uuid, v_current_type, v_p1_points, now())
              ON CONFLICT (user_id, game_type)
              DO UPDATE SET best_score = GREATEST(player_highscores.best_score, EXCLUDED.best_score),
                            updated_at = now();
          END IF;

          IF v_p2_id ~ '^[0-9a-fA-F-]{36}$' THEN
              INSERT INTO player_highscores (user_id, game_type, best_score, updated_at)
              VALUES (v_p2_id::uuid, v_current_type, v_p2_points, now())
              ON CONFLICT (user_id, game_type)
              DO UPDATE SET best_score = GREATEST(player_highscores.best_score, EXCLUDED.best_score),
                            updated_at = now();
          END IF;
      END IF;

      -- Update per-minigame stats (normal/rank)
      IF v_current_type IS NOT NULL AND v_mode IN ('rank', 'normal') THEN
          IF v_p1_id ~ '^[0-9a-fA-F-]{36}$' THEN
              INSERT INTO player_game_stats (
                  user_id,
                  game_type,
                  normal_wins,
                  normal_losses,
                  normal_draws,
                  rank_wins,
                  rank_losses,
                  rank_draws,
                  updated_at
              )
              VALUES (
                  v_p1_id::uuid,
                  v_current_type,
                  CASE WHEN v_mode = 'normal' AND v_p1_points > v_p2_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'normal' AND v_p1_points < v_p2_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'normal' AND v_p1_points = v_p2_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'rank' AND v_p1_points > v_p2_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'rank' AND v_p1_points < v_p2_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'rank' AND v_p1_points = v_p2_points THEN 1 ELSE 0 END,
                  now()
              )
              ON CONFLICT (user_id, game_type)
              DO UPDATE SET
                  normal_wins = player_game_stats.normal_wins + EXCLUDED.normal_wins,
                  normal_losses = player_game_stats.normal_losses + EXCLUDED.normal_losses,
                  normal_draws = player_game_stats.normal_draws + EXCLUDED.normal_draws,
                  rank_wins = player_game_stats.rank_wins + EXCLUDED.rank_wins,
                  rank_losses = player_game_stats.rank_losses + EXCLUDED.rank_losses,
                  rank_draws = player_game_stats.rank_draws + EXCLUDED.rank_draws,
                  updated_at = now();
          END IF;

          IF v_p2_id ~ '^[0-9a-fA-F-]{36}$' THEN
              INSERT INTO player_game_stats (
                  user_id,
                  game_type,
                  normal_wins,
                  normal_losses,
                  normal_draws,
                  rank_wins,
                  rank_losses,
                  rank_draws,
                  updated_at
              )
              VALUES (
                  v_p2_id::uuid,
                  v_current_type,
                  CASE WHEN v_mode = 'normal' AND v_p2_points > v_p1_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'normal' AND v_p2_points < v_p1_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'normal' AND v_p2_points = v_p1_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'rank' AND v_p2_points > v_p1_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'rank' AND v_p2_points < v_p1_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'rank' AND v_p2_points = v_p1_points THEN 1 ELSE 0 END,
                  now()
              )
              ON CONFLICT (user_id, game_type)
              DO UPDATE SET
                  normal_wins = player_game_stats.normal_wins + EXCLUDED.normal_wins,
                  normal_losses = player_game_stats.normal_losses + EXCLUDED.normal_losses,
                  normal_draws = player_game_stats.normal_draws + EXCLUDED.normal_draws,
                  rank_wins = player_game_stats.rank_wins + EXCLUDED.rank_wins,
                  rank_losses = player_game_stats.rank_losses + EXCLUDED.rank_losses,
                  rank_draws = player_game_stats.rank_draws + EXCLUDED.rank_draws,
                  updated_at = now();
          END IF;
      END IF;
  END IF;

  -- Practice: End after 1 round
  IF v_mode = 'practice' THEN
      UPDATE game_sessions SET status = 'finished', phase_end_at = now(), end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  -- 2. Check Victory Condition (3 rounds fixed)
  IF v_current_round >= 3 THEN
      PERFORM finish_game(p_room_id);
      RETURN;
  END IF;

  -- 3. Pick Next Game Type (Random)
  v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
  
  -- 4. Setup Game Data
  IF v_next_type = 'RPS' THEN
      v_target := v_opts[floor(random()*3 + 1)];
      v_game_data := '{}';
  ELSE
      v_target := null;
      v_game_data := jsonb_build_object('seed', floor(random()*10000));
  END IF;

  -- 5. Calculate Next Round
  v_next_round := v_current_round + 1;
  v_next_round_index := GREATEST(v_next_round - 1, 0);

  -- 6. Update Session -> COUNTDOWN State
  UPDATE game_sessions
  SET status = 'countdown',
      current_round = v_next_round,
      current_round_index = v_next_round_index,
      game_type = v_next_type,
      game_data = v_game_data,
      target_move = v_target,
      phase_start_at = now(),
      phase_end_at = now() + interval '4 seconds',
      start_at = now(),
      end_at = now() + interval '4 seconds',
      player1_ready = false,
      player2_ready = false
  WHERE id = p_room_id;
END;
$_$;


--
-- Name: stat_increments(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stat_increments(p_game_type text) RETURNS TABLE(speed integer, memory integer, judgment integer, calculation integer, accuracy integer, observation integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_speed int := 0;
    v_memory int := 0;
    v_judgment int := 0;
    v_calculation int := 0;
    v_accuracy int := 0;
    v_observation int := 0;
BEGIN
    CASE p_game_type
        WHEN 'AIM' THEN v_speed := 2; v_accuracy := 1;
        WHEN 'RPS' THEN v_speed := 2; v_judgment := 1;
        WHEN 'UPDOWN' THEN v_judgment := 2; v_speed := 1;
        WHEN 'ARROW' THEN v_speed := 2; v_judgment := 1;
        WHEN 'SLIDER' THEN v_accuracy := 2; v_speed := 1;
        WHEN 'MEMORY' THEN v_memory := 2; v_accuracy := 1;
        WHEN 'SEQUENCE' THEN v_memory := 2; v_accuracy := 1;
        WHEN 'SEQUENCE_NORMAL' THEN v_memory := 2; v_accuracy := 1;
        WHEN 'SPY' THEN v_memory := 2; v_observation := 1;
        WHEN 'PAIR' THEN v_memory := 2; v_observation := 1;
        WHEN 'COLOR' THEN v_observation := 2; v_accuracy := 1;
        WHEN 'MOST_COLOR' THEN v_observation := 2; v_judgment := 1;
        WHEN 'TAP_COLOR' THEN v_observation := 2; v_speed := 1;
        WHEN 'MATH' THEN v_calculation := 2; v_accuracy := 1;
        WHEN 'TEN' THEN v_calculation := 2; v_judgment := 1;
        WHEN 'BLANK' THEN v_calculation := 2; v_accuracy := 1;
        WHEN 'OPERATOR' THEN v_calculation := 2; v_judgment := 1;
        WHEN 'LARGEST' THEN v_calculation := 2; v_judgment := 1;
        WHEN 'NUMBER' THEN v_accuracy := 2; v_judgment := 1;
        WHEN 'NUMBER_DESC' THEN v_accuracy := 2; v_judgment := 1;
        WHEN 'NUMBER_ASC' THEN v_accuracy := 2; v_judgment := 1;
        WHEN 'SORTING' THEN v_accuracy := 2; v_judgment := 1;
        WHEN 'LADDER' THEN v_judgment := 2; v_accuracy := 1;
        ELSE
            -- no-op
    END CASE;

    RETURN QUERY SELECT v_speed, v_memory, v_judgment, v_calculation, v_accuracy, v_observation;
END;
$$;


--
-- Name: submit_move(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_move(p_room_id uuid, p_player_id text, p_move text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_game_type text;
  v_round int;
  v_target text;
  v_mode text;
  v_opts text[] := ARRAY['rock','paper','scissors'];
  v_p1 text;
  v_p2 text;
  v_p1_move_standard text;
  v_p2_move_standard text;
  v_p1_time int;
  v_p2_time int;
BEGIN
  SELECT game_type, current_round, target_move, mode
  INTO v_game_type, v_round, v_target, v_mode
  FROM game_sessions WHERE id = p_room_id;

  INSERT INTO game_moves (room_id, player_id, round, move)
  VALUES (p_room_id, p_player_id, v_round, p_move);
  
  -- PRACTICE LOGIC
  IF v_mode = 'practice' THEN
      -- Immediate Finish on Success
      IF v_game_type = 'RPS' THEN
          DECLARE
              v_win_move text;
          BEGIN
              IF v_target = 'rock' THEN v_win_move := 'paper';
              ELSIF v_target = 'paper' THEN v_win_move := 'scissors';
              ELSE v_win_move := 'rock';
              END IF;

              IF p_move = v_win_move THEN
                 UPDATE game_sessions 
                 SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
                 WHERE id = p_room_id;
              ELSE
                 UPDATE game_sessions 
                 SET status = 'finished', end_at = now() 
                 WHERE id = p_room_id;
              END IF;
          END;
          RETURN;
      ELSE
          -- Time Attack Games: "DONE:xxx"
          IF p_move LIKE 'DONE:%' THEN
              UPDATE game_sessions 
              SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
              WHERE id = p_room_id;
              RETURN;
          END IF;
      END IF;
      RETURN;
  END IF;

  -- STANDARD LOGIC (For Normal/Rank)
  SELECT player1_id, player2_id INTO v_p1, v_p2 FROM game_sessions WHERE id = p_room_id;

  IF v_game_type = 'RPS' THEN
      DECLARE
          v_win_move_std text;
      BEGIN
          IF v_target = 'rock' THEN v_win_move_std := 'paper';
          ELSIF v_target = 'paper' THEN v_win_move_std := 'scissors';
          ELSE v_win_move_std := 'rock';
          END IF;

          IF p_move = v_win_move_std THEN
             IF p_player_id = v_p1 THEN
                UPDATE game_sessions SET player1_score = player1_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
             ELSE
                UPDATE game_sessions SET player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
             END IF;
          END IF;
      END;
  -- Added SPY here
  ELSIF v_game_type LIKE 'NUMBER%' OR v_game_type IN ('MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW', 'BLANK', 'OPERATOR', 'LADDER', 'TAP_COLOR', 'AIM', 'MOST_COLOR', 'SORTING', 'SPY') THEN
      SELECT move INTO v_p1_move_standard FROM game_moves WHERE room_id = p_room_id AND round = v_round AND player_id = v_p1 AND move LIKE 'DONE:%' LIMIT 1;
      SELECT move INTO v_p2_move_standard FROM game_moves WHERE room_id = p_room_id AND round = v_round AND player_id = v_p2 AND move LIKE 'DONE:%' LIMIT 1;

      IF v_p1_move_standard IS NOT NULL AND v_p2_move_standard IS NOT NULL THEN
          v_p1_time := cast(split_part(v_p1_move_standard, ':', 2) AS int);
          v_p2_time := cast(split_part(v_p2_move_standard, ':', 2) AS int);
          IF v_p1_time < v_p2_time THEN
             UPDATE game_sessions SET player1_score = player1_score + 3, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          ELSIF v_p2_time < v_p1_time THEN
             UPDATE game_sessions SET player2_score = player2_score + 3, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          ELSE
             UPDATE game_sessions SET player1_score = player1_score + 1, player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          END IF;
       ELSE
          UPDATE game_sessions SET phase_end_at = now() + interval '500 milliseconds' WHERE id = p_room_id;
      END IF;
  END IF;
END;
$$;


--
-- Name: trigger_game_start(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_game_start(p_room_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM game_sessions WHERE id = p_room_id;
  
  -- Only transition if currently in countdown
  IF v_status = 'countdown' THEN
    UPDATE game_sessions
    SET status = 'playing',
        phase_start_at = now(),
        phase_end_at = now() + interval '30 seconds',
        start_at = now(),
        end_at = now() + interval '30 seconds'
    WHERE id = p_room_id;
  END IF;
END;
$$;


--
-- Name: update_last_seen(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_last_seen() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Only update if the user initiated the change (e.g., via a heartbeat call)
  -- or we could blindly update it on any profile change, but a specific RPC is better.
  NEW.last_seen = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_mmr(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_mmr(p_room_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_mode text;
  v_p1 uuid; v_p2 uuid;
  v_p1_score int; v_p2_score int;
  v_p1_mmr int; v_p2_mmr int;
  v_k int := 32;
  v_expect_p1 float; v_actual_p1 float;
  v_p1_chg int; v_p2_chg int;
BEGIN
  -- Get Session Info
  select mode, player1_id::uuid, player2_id::uuid, player1_score, player2_score
  into v_mode, v_p1, v_p2, v_p1_score, v_p2_score
  from game_sessions where id = p_room_id;

  -- Default to rank if null
  if v_mode is null then v_mode := 'rank'; end if;

  -- Fetch Current MMRs (Needed for calculation even if not updating in casual? No, casual doesn't use MMR)
  -- Actually, let's just calculate win/loss result first.
  
  if v_p1_score > v_p2_score then v_actual_p1 := 1.0;
  elsif v_p2_score > v_p1_score then v_actual_p1 := 0.0;
  else v_actual_p1 := 0.5;
  end if;

  -- === CASUAL MODE ===
  if v_mode != 'rank' then
      -- Just update casual W/L, NO MMR CHANGE
      update public.profiles 
      set casual_wins = casual_wins + (case when v_actual_p1 = 1.0 then 1 else 0 end),
          casual_losses = casual_losses + (case when v_actual_p1 = 0.0 then 1 else 0 end)
      where id = v_p1;

      update public.profiles 
      set casual_wins = casual_wins + (case when v_actual_p1 = 0.0 then 1 else 0 end),
          casual_losses = casual_losses + (case when v_actual_p1 = 1.0 then 1 else 0 end)
      where id = v_p2;

      -- Set session mmr_change to 0 or null to indicate no change
      update game_sessions set player1_mmr_change = 0, player2_mmr_change = 0 where id = p_room_id;
      return;
  end if;

  -- === RANK MODE (MMR Logic) ===
  
  -- Fetch Profiles
  select mmr into v_p1_mmr from public.profiles where id = v_p1;
  select mmr into v_p2_mmr from public.profiles where id = v_p2;

  -- Safety check
  if v_p1_mmr is null or v_p2_mmr is null then return; end if;

  -- Elo Calculation
  v_expect_p1 := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::float / 400.0));
  
  v_p1_chg := round(v_k * (v_actual_p1 - v_expect_p1));
  v_p2_chg := round(v_k * ((1.0 - v_actual_p1) - (1.0 - v_expect_p1)));

  -- Update DB (Rank Stats)
  update public.profiles 
  set mmr = mmr + v_p1_chg, 
      wins = wins + (case when v_actual_p1 = 1.0 then 1 else 0 end), 
      losses = losses + (case when v_actual_p1 = 0.0 then 1 else 0 end) 
  where id = v_p1;

  update public.profiles 
  set mmr = mmr + v_p2_chg, 
      wins = wins + (case when v_actual_p1 = 0.0 then 1 else 0 end), 
      losses = losses + (case when v_actual_p1 = 1.0 then 1 else 0 end) 
  where id = v_p2;
  
  -- Save Change to Session
  update game_sessions set player1_mmr_change = v_p1_chg, player2_mmr_change = v_p2_chg where id = p_room_id;
END;
$$;


--
-- Name: update_score(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_score(p_room_id uuid, p_player_id text, p_score integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_p1 text;
    v_p2 text;
    v_status text;
    v_p1_points int;
    v_p2_points int;
    v_bot_target int;
BEGIN
    SELECT player1_id, player2_id, status, COALESCE(p1_current_score, 0), COALESCE(p2_current_score, 0)
    INTO v_p1, v_p2, v_status, v_p1_points, v_p2_points
    FROM game_sessions WHERE id = p_room_id;

    IF v_p1 IS NULL THEN
        RAISE EXCEPTION 'Room not found';
    END IF;

    IF v_status = 'finished' THEN
        RETURN;
    END IF;

    -- Security Check: Allow if p_player_id matches valid players in the room
    IF p_player_id != v_p1 AND p_player_id != v_p2 THEN
        IF auth.uid() IS NOT NULL AND auth.uid()::text != p_player_id THEN
            RAISE EXCEPTION 'Not authorized';
        END IF;
    END IF;

    IF p_player_id = v_p1 THEN
        UPDATE game_sessions SET p1_current_score = p_score WHERE id = p_room_id;

        IF v_p2 LIKE 'bot_%' THEN
            v_bot_target := GREATEST(0, LEAST(p_score - 20, floor(p_score * 0.9)));
            IF v_bot_target < v_p2_points THEN
                v_bot_target := v_p2_points;
            END IF;
            UPDATE game_sessions SET p2_current_score = v_bot_target WHERE id = p_room_id;
        END IF;
    ELSIF p_player_id = v_p2 THEN
        UPDATE game_sessions SET p2_current_score = p_score WHERE id = p_room_id;

        IF v_p1 LIKE 'bot_%' THEN
            v_bot_target := GREATEST(0, LEAST(p_score - 20, floor(p_score * 0.9)));
            IF v_bot_target < v_p1_points THEN
                v_bot_target := v_p1_points;
            END IF;
            UPDATE game_sessions SET p1_current_score = v_bot_target WHERE id = p_room_id;
        END IF;
    END IF;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: bot_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bot_profiles (
    id text NOT NULL,
    nickname text NOT NULL,
    avatar_url text,
    country text,
    mmr integer DEFAULT 1000,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    content text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: friendships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friendships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    friend_id uuid NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT friendships_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'blocked'::text])))
);


--
-- Name: game_moves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_moves (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id uuid,
    player_id text NOT NULL,
    round integer NOT NULL,
    move text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: game_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player1_id text NOT NULL,
    player2_id text NOT NULL,
    status text DEFAULT 'waiting'::text,
    game_type text,
    seed text,
    player1_score integer DEFAULT 0,
    player2_score integer DEFAULT 0,
    start_at timestamp with time zone,
    end_at timestamp with time zone,
    winner_id text,
    mode text DEFAULT 'rank'::text,
    created_at timestamp with time zone DEFAULT now(),
    current_round integer DEFAULT 0,
    phase_end_at timestamp with time zone,
    game_types text[],
    current_round_index integer DEFAULT 0,
    p1_current_score integer DEFAULT 0,
    p2_current_score integer DEFAULT 0,
    round_scores jsonb,
    game_data jsonb DEFAULT '{}'::jsonb,
    target_move text,
    phase_start_at timestamp with time zone,
    player1_ready boolean DEFAULT false,
    player2_ready boolean DEFAULT false,
    CONSTRAINT game_sessions_game_type_check CHECK ((game_type = ANY (ARRAY['RPS'::text, 'NUMBER'::text, 'MATH'::text, 'TEN'::text, 'COLOR'::text, 'MEMORY'::text, 'SEQUENCE'::text, 'SEQUENCE_NORMAL'::text, 'LARGEST'::text, 'PAIR'::text, 'UPDOWN'::text, 'SLIDER'::text, 'ARROW'::text, 'NUMBER_DESC'::text, 'BLANK'::text, 'OPERATOR'::text, 'LADDER'::text, 'TAP_COLOR'::text, 'AIM'::text, 'MOST_COLOR'::text, 'SORTING'::text, 'SPY'::text])))
);


--
-- Name: matchmaking_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matchmaking_queue (
    player_id text NOT NULL,
    mmr integer DEFAULT 1000,
    mode text DEFAULT 'rank'::text,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: player_game_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_game_stats (
    user_id uuid NOT NULL,
    game_type text NOT NULL,
    normal_wins integer DEFAULT 0 NOT NULL,
    normal_losses integer DEFAULT 0 NOT NULL,
    normal_draws integer DEFAULT 0 NOT NULL,
    rank_wins integer DEFAULT 0 NOT NULL,
    rank_losses integer DEFAULT 0 NOT NULL,
    rank_draws integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: player_highscores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_highscores (
    user_id uuid NOT NULL,
    game_type text NOT NULL,
    best_score integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    full_name text,
    avatar_url text,
    nickname text,
    wins integer DEFAULT 0,
    losses integer DEFAULT 0,
    mmr integer DEFAULT 1000,
    created_at timestamp with time zone DEFAULT now(),
    disconnects integer DEFAULT 0,
    casual_wins integer DEFAULT 0,
    casual_losses integer DEFAULT 0,
    country text,
    last_seen timestamp with time zone DEFAULT now(),
    pencils integer DEFAULT 5,
    last_recharge_at timestamp with time zone DEFAULT now(),
    speed integer DEFAULT 0,
    memory integer DEFAULT 0,
    judgment integer DEFAULT 0,
    calculation integer DEFAULT 0,
    accuracy integer DEFAULT 0,
    observation integer DEFAULT 0,
    ad_reward_count integer DEFAULT 0,
    ad_reward_day date DEFAULT CURRENT_DATE,
    ads_removed boolean DEFAULT false,
    xp integer DEFAULT 0 NOT NULL,
    level integer DEFAULT 1 NOT NULL
);


--
-- Name: COLUMN profiles.country; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.country IS 'ISO 3166-1 alpha-2 country code (e.g. KR, US)';


--
-- Name: bot_profiles bot_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_profiles
    ADD CONSTRAINT bot_profiles_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_user_id_friend_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user_id_friend_id_key UNIQUE (user_id, friend_id);


--
-- Name: game_moves game_moves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_moves
    ADD CONSTRAINT game_moves_pkey PRIMARY KEY (id);


--
-- Name: game_sessions game_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_sessions
    ADD CONSTRAINT game_sessions_pkey PRIMARY KEY (id);


--
-- Name: matchmaking_queue matchmaking_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matchmaking_queue
    ADD CONSTRAINT matchmaking_queue_pkey PRIMARY KEY (player_id);


--
-- Name: player_game_stats player_game_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_game_stats
    ADD CONSTRAINT player_game_stats_pkey PRIMARY KEY (user_id, game_type);


--
-- Name: player_highscores player_highscores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_highscores
    ADD CONSTRAINT player_highscores_pkey PRIMARY KEY (user_id, game_type);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: idx_profiles_mmr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_mmr ON public.profiles USING btree (mmr DESC);


--
-- Name: chat_messages chat_messages_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id);


--
-- Name: chat_messages chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id);


--
-- Name: friendships friendships_friend_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_friend_id_fkey FOREIGN KEY (friend_id) REFERENCES auth.users(id);


--
-- Name: friendships friendships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: game_moves game_moves_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_moves
    ADD CONSTRAINT game_moves_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.game_sessions(id) ON DELETE CASCADE;


--
-- Name: player_game_stats player_game_stats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_game_stats
    ADD CONSTRAINT player_game_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: player_highscores player_highscores_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_highscores
    ADD CONSTRAINT player_highscores_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id);


--
-- Name: matchmaking_queue Manage own queue entry; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Manage own queue entry" ON public.matchmaking_queue USING (((auth.uid())::text = player_id));


--
-- Name: game_moves Participants can view moves; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can view moves" ON public.game_moves FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.game_sessions s
  WHERE ((s.id = game_moves.room_id) AND ((s.player1_id = (auth.uid())::text) OR (s.player2_id = (auth.uid())::text))))));


--
-- Name: game_sessions Participants can view sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can view sessions" ON public.game_sessions FOR SELECT USING ((((auth.uid())::text = player1_id) OR ((auth.uid())::text = player2_id)));


--
-- Name: game_moves Players can insert own moves; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can insert own moves" ON public.game_moves FOR INSERT WITH CHECK ((((auth.uid())::text = player_id) AND (EXISTS ( SELECT 1
   FROM public.game_sessions s
  WHERE ((s.id = game_moves.room_id) AND ((s.player1_id = (auth.uid())::text) OR (s.player2_id = (auth.uid())::text)))))));


--
-- Name: bot_profiles Public bot profiles are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public bot profiles are viewable by everyone" ON public.bot_profiles FOR SELECT USING (true);


--
-- Name: profiles Public profiles are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);


--
-- Name: game_sessions Users can create their own sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own sessions" ON public.game_sessions FOR INSERT WITH CHECK (((auth.uid())::text = player1_id));


--
-- Name: friendships Users can delete their own friendships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own friendships" ON public.friendships FOR DELETE USING (((auth.uid() = user_id) OR (auth.uid() = friend_id)));


--
-- Name: friendships Users can insert friendship requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert friendship requests" ON public.friendships FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: player_game_stats Users can insert own game stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own game stats" ON public.player_game_stats FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: player_highscores Users can insert own highscores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own highscores" ON public.player_highscores FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: chat_messages Users can send messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can send messages" ON public.chat_messages FOR INSERT WITH CHECK ((auth.uid() = sender_id));


--
-- Name: chat_messages Users can update (mark read) received messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update (mark read) received messages" ON public.chat_messages FOR UPDATE USING ((auth.uid() = receiver_id));


--
-- Name: player_game_stats Users can update own game stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own game stats" ON public.player_game_stats FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: player_highscores Users can update own highscores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own highscores" ON public.player_highscores FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: profiles Users can update their own last_seen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own last_seen" ON public.profiles FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: friendships Users can update their received requests or own friendships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their received requests or own friendships" ON public.friendships FOR UPDATE USING (((auth.uid() = user_id) OR (auth.uid() = friend_id)));


--
-- Name: player_game_stats Users can view own game stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own game stats" ON public.player_game_stats FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: player_highscores Users can view own highscores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own highscores" ON public.player_highscores FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: friendships Users can view their own friendships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own friendships" ON public.friendships FOR SELECT USING (((auth.uid() = user_id) OR (auth.uid() = friend_id)));


--
-- Name: chat_messages Users can view their own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own messages" ON public.chat_messages FOR SELECT USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));


--
-- Name: bot_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bot_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: friendships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

--
-- Name: game_moves; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.game_moves ENABLE ROW LEVEL SECURITY;

--
-- Name: game_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: matchmaking_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: player_game_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.player_game_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: player_highscores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.player_highscores ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


