-- Enforce single active session and reconnect behavior

CREATE OR REPLACE FUNCTION public.create_bot_session(p_player_id text, p_force boolean DEFAULT false) RETURNS TABLE(room_id uuid, opponent_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
    v_bot record;
    v_room_id uuid;
    v_level int;
    v_existing_room uuid;
    v_existing_opponent text;
BEGIN
    -- Ownership check if UUID
    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
         IF p_player_id != auth.uid()::text THEN RAISE EXCEPTION 'Not authorized'; END IF;
    END IF;

    -- Restrict bots for higher levels unless forced
    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
        SELECT level INTO v_level FROM profiles WHERE id = p_player_id::uuid;
        IF (v_level IS NULL OR v_level > 5) AND NOT p_force THEN
            RAISE EXCEPTION 'Bot match restricted';
        END IF;
    END IF;

    -- Reconnect to existing active session instead of creating a new one
    SELECT
      gs.id,
      CASE WHEN gs.player1_id = p_player_id THEN gs.player2_id ELSE gs.player1_id END
    INTO v_existing_room, v_existing_opponent
    FROM game_sessions gs
    WHERE (gs.player1_id = p_player_id OR gs.player2_id = p_player_id)
      AND gs.mode IS DISTINCT FROM 'practice'
      AND (
          (gs.status = 'waiting' AND gs.created_at > (now() - interval '60 seconds'))
          OR
          (gs.status IN ('countdown', 'playing') AND COALESCE(gs.end_at, gs.created_at + interval '5 minutes') > (now() - interval '10 seconds'))
      )
    ORDER BY gs.created_at DESC
    LIMIT 1;

    IF v_existing_room IS NOT NULL THEN
      room_id := v_existing_room;
      opponent_id := v_existing_opponent;
      RETURN NEXT;
      RETURN;
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

CREATE OR REPLACE FUNCTION public.create_session(p_player1_id text, p_player2_id text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
  v_existing_room uuid;
BEGIN
  -- Security Check
  IF p_player1_id != auth.uid()::text THEN
    RAISE EXCEPTION 'Not authorized to create session for another user';
  END IF;

  -- Reconnect to existing active session instead of creating a new one
  SELECT gs.id
  INTO v_existing_room
  FROM game_sessions gs
  WHERE (gs.player1_id = p_player1_id OR gs.player2_id = p_player1_id)
    AND gs.mode IS DISTINCT FROM 'practice'
    AND (
      (gs.status = 'waiting' AND gs.created_at > (now() - interval '60 seconds'))
      OR
      (gs.status IN ('countdown', 'playing') AND COALESCE(gs.end_at, gs.created_at + interval '5 minutes') > (now() - interval '10 seconds'))
    )
  ORDER BY gs.created_at DESC
  LIMIT 1;

  IF v_existing_room IS NOT NULL THEN
    RETURN v_existing_room;
  END IF;

  INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode)
  VALUES (auth.uid()::text, p_player2_id, 'waiting', 0, 'friendly')
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_match(p_min_mmr integer, p_max_mmr integer, p_player_id text, p_mode text DEFAULT 'rank'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
    v_opponent_id text;
    v_room_id uuid;
    v_level int;
    v_existing_room uuid;
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

    -- Active session guard: return existing session instead of creating a new one
    SELECT gs.id
    INTO v_existing_room
    FROM game_sessions gs
    WHERE (gs.player1_id = p_player_id OR gs.player2_id = p_player_id)
      AND gs.mode IS DISTINCT FROM 'practice'
      AND (
          (gs.status = 'waiting' AND gs.created_at > (now() - interval '60 seconds'))
          OR
          (gs.status IN ('countdown', 'playing') AND COALESCE(gs.end_at, gs.created_at + interval '5 minutes') > (now() - interval '10 seconds'))
      )
    ORDER BY gs.created_at DESC
    LIMIT 1;

    IF v_existing_room IS NOT NULL THEN
        DELETE FROM matchmaking_queue WHERE player_id = p_player_id;
        RETURN v_existing_room;
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
      AND NOT EXISTS (
          SELECT 1
          FROM game_sessions gs
          WHERE (gs.player1_id = matchmaking_queue.player_id OR gs.player2_id = matchmaking_queue.player_id)
            AND gs.mode IS DISTINCT FROM 'practice'
            AND (
                (gs.status = 'waiting' AND gs.created_at > (now() - interval '60 seconds'))
                OR
                (gs.status IN ('countdown', 'playing') AND COALESCE(gs.end_at, gs.created_at + interval '5 minutes') > (now() - interval '10 seconds'))
            )
      )
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
