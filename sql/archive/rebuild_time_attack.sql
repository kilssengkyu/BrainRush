-- REBUILD FOR TIME ATTACK MODE
-- WARNING: This script drops game_sessions and matchmaking_queue tables!

-- 1. Drop Old Tables
DROP TABLE IF EXISTS game_moves CASCADE;
DROP TABLE IF EXISTS game_sessions CASCADE;
DROP TABLE IF EXISTS matchmaking_queue CASCADE;

-- 2. Create Tables

-- Matchmaking Queue
CREATE TABLE matchmaking_queue (
    player_id TEXT PRIMARY KEY,
    mmr INT DEFAULT 1000,
    mode TEXT DEFAULT 'rank',
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Game Sessions (Simplified)
CREATE TABLE game_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player1_id TEXT NOT NULL,
    player2_id TEXT NOT NULL,
    
    status TEXT DEFAULT 'waiting', -- waiting, playing, finished
    game_type TEXT, -- 'RPS', 'NUMBER', etc.
    seed TEXT, -- Shared random seed for content generation
    
    player1_score INT DEFAULT 0,
    player2_score INT DEFAULT 0,
    
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ, -- Game ends at this time
    
    winner_id TEXT,
    mode TEXT DEFAULT 'rank',
    
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure public client access and realtime updates after table rebuild
ALTER TABLE game_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE matchmaking_queue DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE game_sessions;
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;

-- 3. Functions (RPCs)

-- Check Active Session (For Reconnection)
DROP FUNCTION IF EXISTS check_active_session(text);
CREATE OR REPLACE FUNCTION check_active_session(p_player_id text)
RETURNS TABLE (
    room_id uuid,
    opponent_id text,
    status text,
    created_at timestamptz,
    game_type text,
    end_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        gs.id,
        CASE 
            WHEN gs.player1_id = p_player_id THEN gs.player2_id 
            ELSE gs.player1_id 
        END,
        gs.status,
        gs.created_at,
        gs.game_type,
        gs.end_at
    FROM game_sessions gs
    WHERE (gs.player1_id = p_player_id OR gs.player2_id = p_player_id)
      AND gs.status != 'finished'
      AND (
          (gs.status = 'waiting' AND gs.created_at > (now() - interval '60 seconds'))
          OR
          (gs.status != 'waiting' AND gs.created_at > (now() - interval '1 hour'))
      )
    ORDER BY gs.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Find Match (Robust, Same as before but adapted)
DROP FUNCTION IF EXISTS find_match(int, int, text, text);
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
BEGIN
    -- Cleanup Stale
    DELETE FROM matchmaking_queue 
    WHERE updated_at < (now() - interval '60 seconds');

    -- Search
    SELECT player_id INTO v_opponent_id
    FROM matchmaking_queue
    WHERE player_id != p_player_id
      AND mmr BETWEEN p_min_mmr AND p_max_mmr
      AND mode = p_mode
      AND updated_at > (now() - interval '30 seconds')
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_opponent_id IS NOT NULL THEN
        -- Create Session (No Round, No Target)
        INSERT INTO game_sessions (player1_id, player2_id, status, mode)
        VALUES (p_player_id, v_opponent_id, 'waiting', p_mode)
        RETURNING id INTO v_room_id;

        DELETE FROM matchmaking_queue WHERE player_id IN (p_player_id, v_opponent_id);
        RETURN v_room_id;
    END IF;

    -- Upsert Self
    INSERT INTO matchmaking_queue (player_id, mmr, mode, updated_at)
    VALUES (p_player_id, (p_min_mmr + p_max_mmr) / 2, p_mode, now())
    ON CONFLICT (player_id) 
    DO UPDATE SET mmr = EXCLUDED.mmr, mode = EXCLUDED.mode, updated_at = now();

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Start Game (Triggered by Host)
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    v_types text[] := ARRAY['RPS', 'NUMBER']; -- Available games
    v_selected_type text;
BEGIN
    v_seed := md5(random()::text);
    v_selected_type := v_types[floor(random()*array_length(v_types, 1) + 1)];

    UPDATE game_sessions
    SET status = 'playing',
        game_type = v_selected_type,
        seed = v_seed,
        start_at = now(),
        end_at = now() + interval '60 seconds' -- 1 Minute Time Attack
    WHERE id = p_room_id AND status = 'waiting';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Update Score (Called periodically by clients)
CREATE OR REPLACE FUNCTION update_score(p_room_id uuid, p_player_id text, p_score int)
RETURNS void AS $$
DECLARE
    v_p1 text;
    v_p2 text;
BEGIN
    SELECT player1_id, player2_id INTO v_p1, v_p2
    FROM game_sessions WHERE id = p_room_id;

    IF p_player_id = v_p1 THEN
        UPDATE game_sessions SET player1_score = p_score WHERE id = p_room_id;
    ELSIF p_player_id = v_p2 THEN
        UPDATE game_sessions SET player2_score = p_score WHERE id = p_room_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Finish Game (Check Time & MMR)
CREATE OR REPLACE FUNCTION finish_game(p_room_id uuid)
RETURNS void AS $$
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
BEGIN
    SELECT * INTO v_session FROM game_sessions WHERE id = p_room_id;
    
    IF v_session.status = 'finished' THEN RETURN; END IF;

    -- Determine Winner
    IF v_session.player1_score > v_session.player2_score THEN
        v_winner := v_session.player1_id;
        v_loser := v_session.player2_id;
    ELSIF v_session.player2_score > v_session.player1_score THEN
        v_winner := v_session.player2_id;
        v_loser := v_session.player1_id;
    ELSE
        v_is_draw := true;
    END IF;

    UPDATE game_sessions 
    SET status = 'finished', winner_id = v_winner 
    WHERE id = p_room_id;

    -- MMR Logic (Only for Rank Mode & Valid Users)
    IF v_session.mode = 'rank' AND v_winner IS NOT NULL AND NOT v_is_draw THEN
        IF v_winner NOT LIKE 'guest_%' AND v_loser NOT LIKE 'guest_%' THEN
             
             SELECT mmr INTO v_p1_mmr FROM profiles WHERE id = v_session.player1_id;
             SELECT mmr INTO v_p2_mmr FROM profiles WHERE id = v_session.player2_id;
             
             v_p1_exp := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::numeric / 400.0));
             v_p2_exp := 1.0 / (1.0 + power(10.0, (v_p1_mmr - v_p2_mmr)::numeric / 400.0));

             IF v_winner = v_session.player1_id THEN
                -- P1 Wins
                v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (1 - v_p1_exp));
                v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (0 - v_p2_exp));
                
                UPDATE profiles SET mmr = v_new_p1_mmr, wins = wins + 1 WHERE id = v_session.player1_id;
                UPDATE profiles SET mmr = v_new_p2_mmr, losses = losses + 1 WHERE id = v_session.player2_id;
             ELSE
                -- P2 Wins
                v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (0 - v_p1_exp));
                v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (1 - v_p2_exp));
                
                UPDATE profiles SET mmr = v_new_p1_mmr, losses = losses + 1 WHERE id = v_session.player1_id;
                UPDATE profiles SET mmr = v_new_p2_mmr, wins = wins + 1 WHERE id = v_session.player2_id;
             END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
