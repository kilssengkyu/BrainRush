-- Rank mode unlock for all logged-in users
-- + allow bot sessions to inherit queue mode (normal/rank)
-- + keep bot eligibility capped to low level unless forced

CREATE OR REPLACE FUNCTION public.create_bot_session(p_player_id text, p_force boolean DEFAULT false)
RETURNS TABLE(room_id uuid, opponent_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_bot record;
    v_room_id uuid;
    v_level int;
    v_existing_room uuid;
    v_existing_opponent text;
    v_mode text := 'normal';
BEGIN
    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
        IF p_player_id != auth.uid()::text THEN
            RAISE EXCEPTION 'Not authorized';
        END IF;
    END IF;

    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
        SELECT level INTO v_level FROM profiles WHERE id = p_player_id::uuid;
        IF (v_level IS NULL OR v_level > 5) AND NOT p_force THEN
            RAISE EXCEPTION 'Bot match restricted';
        END IF;
    END IF;

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

    SELECT mode INTO v_mode
    FROM matchmaking_queue
    WHERE player_id = p_player_id
    ORDER BY updated_at DESC
    LIMIT 1;

    IF v_mode IS NULL OR v_mode NOT IN ('normal', 'rank') THEN
        v_mode := 'normal';
    END IF;

    DELETE FROM matchmaking_queue WHERE player_id = p_player_id;

    SELECT * INTO v_bot FROM bot_profiles ORDER BY random() LIMIT 1;
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

CREATE OR REPLACE FUNCTION public.find_match(
    p_min_mmr integer,
    p_max_mmr integer,
    p_player_id text,
    p_mode text DEFAULT 'rank'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_opponent_id text;
    v_room_id uuid;
    v_existing_room uuid;
BEGIN
    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
        IF p_player_id != auth.uid()::text THEN
            RAISE EXCEPTION 'Not authorized';
        END IF;
    END IF;

    -- Rank mode now requires login only (no level gate).
    IF p_mode = 'rank' THEN
        IF p_player_id !~ '^[0-9a-fA-F-]{36}$' THEN
            RAISE EXCEPTION 'Rank requires login';
        END IF;
    END IF;

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

    DELETE FROM matchmaking_queue
    WHERE updated_at < (now() - interval '60 seconds');

    SELECT player_id INTO v_opponent_id
    FROM matchmaking_queue mq
    WHERE mq.player_id <> p_player_id
      AND mq.mode = p_mode
      AND mq.mmr BETWEEN p_min_mmr AND p_max_mmr
      AND NOT EXISTS (
            SELECT 1
            FROM game_sessions gs
            WHERE (gs.player1_id = mq.player_id OR gs.player2_id = mq.player_id)
              AND gs.mode IS DISTINCT FROM 'practice'
              AND (
                  (gs.status = 'waiting' AND gs.created_at > (now() - interval '60 seconds'))
                  OR
                  (gs.status IN ('countdown', 'playing') AND COALESCE(gs.end_at, gs.created_at + interval '5 minutes') > (now() - interval '10 seconds'))
              )
      )
    ORDER BY abs(mq.mmr - ((p_min_mmr + p_max_mmr) / 2))
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_opponent_id IS NOT NULL THEN
        INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode)
        VALUES (p_player_id, v_opponent_id, 'waiting', 0, p_mode)
        RETURNING id INTO v_room_id;

        DELETE FROM matchmaking_queue WHERE player_id IN (p_player_id, v_opponent_id);
        RETURN v_room_id;
    END IF;

    INSERT INTO matchmaking_queue (player_id, mmr, mode, updated_at)
    VALUES (p_player_id, (p_min_mmr + p_max_mmr) / 2, p_mode, now())
    ON CONFLICT (player_id) DO UPDATE
    SET mmr = EXCLUDED.mmr,
        mode = EXCLUDED.mode,
        updated_at = now();

    RETURN NULL;
END;
$$;
