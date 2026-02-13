-- Security Patch 2026-01-25
-- Enabling RLS and Hardening RPCs without full schema reset

-- 1. Enable RLS on Tables
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchmaking_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Create Safety Policies
-- Game Sessions: Participants can view
DROP POLICY IF EXISTS "Participants can view sessions" ON game_sessions;
CREATE POLICY "Participants can view sessions" ON game_sessions
    FOR SELECT
    USING (auth.uid()::text = player1_id OR auth.uid()::text = player2_id);

-- Game Sessions: Creation (if client creates directly) - allow if player1 is self
DROP POLICY IF EXISTS "Users can create their own sessions" ON game_sessions;
CREATE POLICY "Users can create their own sessions" ON game_sessions
    FOR INSERT
    WITH CHECK (auth.uid()::text = player1_id);

-- Game Moves: Participants can view moves in their room
DROP POLICY IF EXISTS "Participants can view moves" ON game_moves;
CREATE POLICY "Participants can view moves" ON game_moves
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM game_sessions s 
            WHERE s.id = room_id 
            AND (s.player1_id = auth.uid()::text OR s.player2_id = auth.uid()::text)
        )
    );

-- Game Moves: Insert own moves
DROP POLICY IF EXISTS "Players can insert own moves" ON game_moves;
CREATE POLICY "Players can insert own moves" ON game_moves
    FOR INSERT
    WITH CHECK (auth.uid()::text = player_id);

-- Matchmaking Queue: Manage own entry
DROP POLICY IF EXISTS "Manage own queue entry" ON matchmaking_queue;
CREATE POLICY "Manage own queue entry" ON matchmaking_queue
    FOR ALL
    USING (auth.uid() = player_id);

-- Profiles: Public Read (already exists usually, but reinforcing)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);

-- Profiles: Update Own
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);


-- 3. Harden RPCs (Override with Security Checks)

-- create_session (Enforce player1 = auth.uid)
CREATE OR REPLACE FUNCTION create_session(p_player1_id text, p_player2_id text)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Security Check
  IF p_player1_id != auth.uid()::text THEN
    RAISE EXCEPTION 'Not authorized to create session for another user';
  END IF;

  INSERT INTO game_sessions (player1_id, player2_id, status, current_round)
  VALUES (auth.uid()::text, p_player2_id, 'waiting', 0)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- submit_move (Enforce player_id = auth.uid)
CREATE OR REPLACE FUNCTION submit_move(p_room_id uuid, p_player_id text, p_move text)
RETURNS void AS $$
DECLARE
  v_game_type text;
  v_round int;
  v_p1 text;
  v_p2 text;
  v_target text;
  v_p1_move text;
  v_p2_move text;
  v_p1_time int;
  v_p2_time int;
BEGIN
  -- Security Check
  IF p_player_id != auth.uid()::text THEN
     RAISE EXCEPTION 'Not authorized to submit move for another user';
  END IF;

  -- Get current context
  SELECT game_type, current_round, target_move, player1_id, player2_id
  into v_game_type, v_round, v_target, v_p1, v_p2
  from game_sessions where id = p_room_id;

  -- Validation: Verify user is in the room
  IF v_p1 != auth.uid()::text AND v_p2 != auth.uid()::text THEN
     RAISE EXCEPTION 'User is not in this game room';
  END IF;

  -- 1. Log the move
  INSERT INTO game_moves (room_id, player_id, round, move)
  VALUES (p_room_id, auth.uid()::text, v_round, p_move);

  -- [Original Logic Preserved Below] --
  -- 2. Evaluate Logic based on Game Type
  
  -- === RPS Logic ===
  if v_game_type = 'RPS' then
      -- Win logic: First to match target wins.
      declare
          v_win_move text;
      begin
          if v_target = 'rock' then v_win_move := 'paper';
          elsif v_target = 'paper' then v_win_move := 'scissors';
          else v_win_move := 'rock';
          end if;

          if p_move = v_win_move then
             -- Immediate Win for this round (First Verified)
             if auth.uid()::text = v_p1 then
                update game_sessions 
                set player1_score = player1_score + 1, status = 'round_end', phase_end_at = now() 
                where id = p_room_id and status = 'playing';
             else
                update game_sessions 
                set player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() 
                where id = p_room_id and status = 'playing';
             end if;
          end if;
      end;

  -- === NUMBER Logic (Race) ===
  elsif v_game_type like 'NUMBER%' then
      -- Protocol: 'DONE:<duration>'
      
      -- Get moves for this round
      select move into v_p1_move from game_moves where room_id = p_room_id and round = v_round and player_id = v_p1 and move like 'DONE:%' limit 1;
      select move into v_p2_move from game_moves where room_id = p_room_id and round = v_round and player_id = v_p2 and move like 'DONE:%' limit 1;


      if v_p1_move is not null and v_p2_move is not null then
          -- Both finished. Compare times.
          v_p1_time := cast(split_part(v_p1_move, ':', 2) as int);
          v_p2_time := cast(split_part(v_p2_move, ':', 2) as int);

          if v_p1_time < v_p2_time then
             update game_sessions set player1_score = player1_score + 3, status = 'round_end', phase_end_at = now() where id = p_room_id;
          elsif v_p2_time < v_p1_time then
             update game_sessions set player2_score = player2_score + 3, status = 'round_end', phase_end_at = now() where id = p_room_id;
          else
             update game_sessions set player1_score = player1_score + 1, player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() where id = p_room_id;
          end if;
      
      else
          -- One player finished, the other hasn't.
          -- Enable "Sudden Death": End round in 0.5 seconds.
          update game_sessions set phase_end_at = now() + interval '500 milliseconds' where id = p_room_id;
      end if;
  end if;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- trigger_game_start (Validate caller)
CREATE OR REPLACE FUNCTION trigger_game_start(p_room_id uuid)
RETURNS void AS $$
BEGIN
  -- Security Check
  IF NOT EXISTS (
     SELECT 1 FROM game_sessions 
     WHERE id = p_room_id 
     AND (player1_id = auth.uid()::text OR player2_id = auth.uid()::text)
  ) THEN
     RAISE EXCEPTION 'Not authorized to start this game';
  END IF;

  UPDATE game_sessions
  SET status = 'playing',
      phase_start_at = now(),
      phase_end_at = now() + interval '60 seconds' -- Max round time
  WHERE id = p_room_id AND status = 'countdown';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- get_profile_with_pencils (Check owner)
CREATE OR REPLACE FUNCTION get_profile_with_pencils(user_id UUID)
RETURNS TABLE (
    pencils INTEGER,
    last_recharge_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
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


-- consume_pencil (Check owner)
CREATE OR REPLACE FUNCTION consume_pencil(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
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


-- get_player_match_history (Restrict to self or friends - simplified to self only for security first)
CREATE OR REPLACE FUNCTION get_player_match_history(
    p_user_id UUID,
    p_mode TEXT DEFAULT 'all',
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    session_id UUID,
    game_mode TEXT,
    created_at TIMESTAMPTZ,
    result TEXT,
    opponent_id TEXT,
    opponent_nickname TEXT,
    opponent_avatar_url TEXT,
    opponent_country TEXT,
    is_friend BOOLEAN
) AS $$
BEGIN
    -- Security Check: Only allow viewing own history
    IF p_user_id != auth.uid() THEN
        -- Optionally allow viewing friends? For now, strict: only own.
        -- If needed, we can check friendship table here.
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
        p.nickname AS opponent_nickname,
        p.avatar_url AS opponent_avatar_url,
        p.country AS opponent_country,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
