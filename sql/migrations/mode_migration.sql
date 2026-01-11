-- 1. Add 'mode' column to Matchmaking Queue
ALTER TABLE matchmaking_queue ADD COLUMN IF NOT EXISTS mode text default 'rank';

-- 2. Add 'mode' column to Game Sessions
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS mode text default 'rank';

-- 3. UPDATED find_match: Enforce Mode Matching (Rank vs Rank, Normal vs Normal)
CREATE OR REPLACE FUNCTION find_match(p_min_mmr int, p_max_mmr int, p_player_id text, p_mode text)
RETURNS uuid AS $$
DECLARE
  v_my_id text := p_player_id;
  v_opponent_id text;
  v_room_id uuid;
  v_my_mmr int;
BEGIN
  -- Get my MMR
  select mmr into v_my_mmr from public.profiles where id::text = v_my_id;
  if v_my_mmr is null then v_my_mmr := 1000; end if;

  -- Search for opponent in SAME MODE
  select player_id into v_opponent_id
  from matchmaking_queue
  where mmr >= p_min_mmr 
    and mmr <= p_max_mmr
    and player_id != v_my_id
    and mode = p_mode  -- Strict Mode Matching
  order by created_at asc
  limit 1
  for update skip locked;

  if v_opponent_id is not null then
    delete from matchmaking_queue where player_id in (v_my_id, v_opponent_id);
    
    -- Insert with Mode
    insert into game_sessions (player1_id, player2_id, status, current_round, mode)
    values (v_my_id, v_opponent_id, 'waiting', 0, p_mode)
    returning id into v_room_id;
    
    return v_room_id;
  else
    insert into matchmaking_queue (player_id, mmr, mode)
    values (v_my_id, v_my_mmr, p_mode)
    on conflict (player_id) do update
    set mmr = v_my_mmr, created_at = now(), mode = p_mode;
    
    return null;
  end if;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. UPDATED update_mmr: Only Run for Rank Mode
CREATE OR REPLACE FUNCTION update_mmr(p_room_id uuid)
RETURNS void AS $$
DECLARE
  v_mode text;
  v_p1 text; v_p2 text;
  v_p1_score int; v_p2_score int;
  v_p1_mmr int; v_p2_mmr int;
  v_k int := 32;
  v_expect_p1 float; v_actual_p1 float;
BEGIN
  -- Get Session Info
  select mode, player1_id, player2_id, player1_score, player2_score
  into v_mode, v_p1, v_p2, v_p1_score, v_p2_score
  from game_sessions
  where id = p_room_id;

  -- [CRITICAL] EXIT IF NOT RANK MODE
  if v_mode != 'rank' then
      return; 
  end if;

  -- Safe MMR fetch
  begin select mmr into v_p1_mmr from public.profiles where id = v_p1::uuid; exception when others then v_p1_mmr := null; end;
  begin select mmr into v_p2_mmr from public.profiles where id = v_p2::uuid; exception when others then v_p2_mmr := null; end;

  if v_p1_mmr is null or v_p2_mmr is null then return; end if;

  -- Elo Calculation
  v_expect_p1 := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::float / 400.0));
  
  if v_p1_score > v_p2_score then v_actual_p1 := 1.0;
  elsif v_p2_score > v_p1_score then v_actual_p1 := 0.0;
  else v_actual_p1 := 0.5;
  end if;

  -- Update
  update public.profiles set mmr = round(v_p1_mmr + v_k * (v_actual_p1 - v_expect_p1)), wins = wins + (case when v_actual_p1 = 1.0 then 1 else 0 end), losses = losses + (case when v_actual_p1 = 0.0 then 1 else 0 end) where id = v_p1::uuid;
  update public.profiles set mmr = round(v_p2_mmr + v_k * ((1.0 - v_actual_p1) - (1.0 - v_expect_p1))), wins = wins + (case when v_actual_p1 = 0.0 then 1 else 0 end), losses = losses + (case when v_actual_p1 = 1.0 then 1 else 0 end) where id = v_p2::uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
