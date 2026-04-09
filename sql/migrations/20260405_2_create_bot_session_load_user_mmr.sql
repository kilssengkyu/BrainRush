-- Ensure create_bot_session uses the real player's MMR for bot selection.
-- Preference: pick bot within ±200 MMR from player MMR, fallback to random bot.

CREATE OR REPLACE FUNCTION public.create_bot_session(p_player_id text, p_force boolean DEFAULT false)
RETURNS TABLE(room_id uuid, opponent_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_bot record;
    v_user_mmr int := 1000;
    v_has_close_bot boolean := false;
    v_room_id uuid;
    v_level int;
    v_existing_room uuid;
    v_existing_opponent text;
    v_mode text := 'normal';
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
    SELECT mode INTO v_mode
    FROM matchmaking_queue
    WHERE player_id = p_player_id
    ORDER BY updated_at DESC
    LIMIT 1;

    IF v_mode IS NULL OR v_mode NOT IN ('normal', 'rank') THEN
        v_mode := 'normal';
    END IF;

    DELETE FROM matchmaking_queue WHERE player_id = p_player_id;

    -- Load player MMR (fallback 1000)
    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
        SELECT COALESCE(p.mmr, 1000)
        INTO v_user_mmr
        FROM public.profiles p
        WHERE p.id = p_player_id::uuid;
    END IF;

    -- Prefer close-MMR bots within ±200
    SELECT EXISTS (
        SELECT 1
        FROM public.bot_profiles b
        WHERE ABS(COALESCE(b.mmr, 1000) - COALESCE(v_user_mmr, 1000)) <= 200
    )
    INTO v_has_close_bot;

    IF v_has_close_bot THEN
        SELECT *
        INTO v_bot
        FROM public.bot_profiles b
        WHERE ABS(COALESCE(b.mmr, 1000) - COALESCE(v_user_mmr, 1000)) <= 200
        ORDER BY random()
        LIMIT 1;
    ELSE
        SELECT *
        INTO v_bot
        FROM public.bot_profiles
        ORDER BY random()
        LIMIT 1;
    END IF;

    IF v_bot.id IS NULL THEN
        RAISE EXCEPTION 'No bot profiles available';
    END IF;

    INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode)
    VALUES (p_player_id, v_bot.id, 'waiting', 0, v_mode)
    RETURNING id INTO v_room_id;

    room_id := v_room_id;
    opponent_id := v_bot.id;
    RETURN NEXT;
END;
$$;
