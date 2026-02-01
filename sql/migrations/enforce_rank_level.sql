-- Enforce rank level requirement in matchmaking
CREATE OR REPLACE FUNCTION find_match(
    p_min_mmr int,
    p_max_mmr int,
    p_player_id text,
    p_mode text DEFAULT 'rank'
)
RETURNS uuid AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
