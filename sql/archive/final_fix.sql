-- [FINAL FIX] Consolidated MMR System Script
-- Run this entire script to ensure everything is linked correctly.

-- 1. Ensure Columns Exist
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS player1_mmr_change int default 0;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS player2_mmr_change int default 0;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS mode text default 'rank';

-- 2. Define update_mmr (The Calculater)
CREATE OR REPLACE FUNCTION update_mmr(p_room_id uuid)
RETURNS void AS $$
DECLARE
  v_mode text;
  v_p1 text; v_p2 text;
  v_p1_score int; v_p2_score int;
  v_p1_mmr int; v_p2_mmr int;
  v_k int := 32;
  v_expect_p1 float; v_actual_p1 float;
  v_p1_chg int; v_p2_chg int;
BEGIN
  -- Get Session Info
  select mode, player1_id, player2_id, player1_score, player2_score
  into v_mode, v_p1, v_p2, v_p1_score, v_p2_score
  from game_sessions where id = p_room_id;

  -- [DEBUG] Force run if mode is null (default fallback)
  if v_mode is null then v_mode := 'rank'; end if;

  -- [DEBUG] Mark as -1 if not rank
  if v_mode != 'rank' then
      update game_sessions set player1_mmr_change = -1, player2_mmr_change = -1 where id = p_room_id;
      return; 
  end if;

  -- Fetch Profiles
  begin select mmr into v_p1_mmr from public.profiles where id = v_p1::uuid; exception when others then v_p1_mmr := null; end;
  begin select mmr into v_p2_mmr from public.profiles where id = v_p2::uuid; exception when others then v_p2_mmr := null; end;

  -- [DEBUG] Mark error codes for missing profiles
  if v_p1_mmr is null and v_p2_mmr is null then
      update game_sessions set player1_mmr_change = -4, player2_mmr_change = -4 where id = p_room_id; return;
  elsif v_p1_mmr is null then
      update game_sessions set player1_mmr_change = -2, player2_mmr_change = 0 where id = p_room_id; return;
  elsif v_p2_mmr is null then
      update game_sessions set player1_mmr_change = 0, player2_mmr_change = -3 where id = p_room_id; return;
  end if;

  -- Elo Calculation
  v_expect_p1 := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::float / 400.0));
  
  if v_p1_score > v_p2_score then v_actual_p1 := 1.0;
  elsif v_p2_score > v_p1_score then v_actual_p1 := 0.0;
  else v_actual_p1 := 0.5;
  end if;

  v_p1_chg := round(v_k * (v_actual_p1 - v_expect_p1));
  v_p2_chg := round(v_k * ((1.0 - v_actual_p1) - (1.0 - v_expect_p1)));

  -- Update DB
  update public.profiles set mmr = mmr + v_p1_chg, wins = wins + (case when v_actual_p1 = 1.0 then 1 else 0 end), losses = losses + (case when v_actual_p1 = 0.0 then 1 else 0 end) where id = v_p1::uuid;
  update public.profiles set mmr = mmr + v_p2_chg, wins = wins + (case when v_actual_p1 = 0.0 then 1 else 0 end), losses = losses + (case when v_actual_p1 = 1.0 then 1 else 0 end) where id = v_p2::uuid;
  
  -- Save Change
  update game_sessions set player1_mmr_change = v_p1_chg, player2_mmr_change = v_p2_chg where id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Define start_next_round (The Trigger)
-- [CRITICAL]: This function MUST call update_mmr via 'perform'
CREATE OR REPLACE FUNCTION start_next_round(p_room_id uuid)
RETURNS void AS $$
DECLARE
  v_status text; v_cur_round int; v_p1_s int; v_p2_s int;
  v_next_type text; v_game_data jsonb; v_target text;
  v_types text[] := ARRAY['RPS', 'NUMBER_ASC', 'NUMBER_DESC'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
BEGIN
  select status, current_round, player1_score, player2_score
  into v_status, v_cur_round, v_p1_s, v_p2_s
  from game_sessions where id = p_room_id;

  -- Check Victory Condition
  if v_p1_s >= 3 or v_p2_s >= 3 then
      update game_sessions set status = 'finished', phase_end_at = now() where id = p_room_id;
      
      -- [!!!] TRIGGER MMR UPDATE HERE [!!!]
      perform update_mmr(p_room_id);
      
      return;
  end if;

  -- Determine Next Game
  v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
  
  if v_next_type = 'RPS' then
      v_target := v_opts[floor(random()*3 + 1)]; v_game_data := '{}';
  else
      v_target := null; v_game_data := jsonb_build_object('seed', floor(random()*10000));
  end if;

  -- Advance Round
  update game_sessions
  set status = 'countdown',
      current_round = v_cur_round + 1,
      game_type = v_next_type,
      game_data = v_game_data,
      target_move = v_target,
      phase_start_at = now(),
      phase_end_at = now() + interval '3 seconds'
  where id = p_room_id;
END;
$$ LANGUAGE plpgsql;
