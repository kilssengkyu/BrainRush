-- 1. UPDATED update_mmr Function (Safe & Robust)
create or replace function update_mmr(p_room_id uuid)
returns void as $$
declare
  v_p1 text;
  v_p2 text;
  v_p1_score int;
  v_p2_score int;
  
  v_p1_mmr int;
  v_p2_mmr int;
  
  v_k_factor int := 32;
  v_expected_p1 float;
  v_expected_p2 float;
  v_actual_p1 float;
  v_new_p1_mmr int;
  v_new_p2_mmr int;
begin
  -- Get Game Info
  select player1_id, player2_id, player1_score, player2_score
  into v_p1, v_p2, v_p1_score, v_p2_score
  from game_sessions
  where id = p_room_id;

  -- Try Fetch P1 MMR (Safely)
  begin
      select mmr into v_p1_mmr from public.profiles where id = v_p1::uuid;
  exception when others then v_p1_mmr := null; end;

  -- Try Fetch P2 MMR (Safely)
  begin
      select mmr into v_p2_mmr from public.profiles where id = v_p2::uuid;
  exception when others then v_p2_mmr := null; end;

  -- Only update if BOTH are valid users (Ranked Match)
  if v_p1_mmr is null or v_p2_mmr is null then
      return; 
  end if;

  -- Calculate Expected Score
  v_expected_p1 := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::float / 400.0));
  v_expected_p2 := 1.0 / (1.0 + power(10.0, (v_p1_mmr - v_p2_mmr)::float / 400.0));

  -- Determine Actual Score
  if v_p1_score > v_p2_score then v_actual_p1 := 1.0;
  elsif v_p2_score > v_p1_score then v_actual_p1 := 0.0;
  else v_actual_p1 := 0.5;
  end if;

  -- Calculate New Ratings
  v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (v_actual_p1 - v_expected_p1));
  v_new_p2_mmr := round(v_p2_mmr + v_k_factor * ((1.0 - v_actual_p1) - v_expected_p2));

  -- Update Profiles
  update public.profiles set mmr = v_new_p1_mmr, wins = wins + (case when v_actual_p1 = 1.0 then 1 else 0 end), losses = losses + (case when v_actual_p1 = 0.0 then 1 else 0 end) where id = v_p1::uuid;
  update public.profiles set mmr = v_new_p2_mmr, wins = wins + (case when v_actual_p1 = 0.0 then 1 else 0 end), losses = losses + (case when v_actual_p1 = 1.0 then 1 else 0 end) where id = v_p2::uuid;
end;
$$ language plpgsql security definer;

-- 2. UPDATED start_next_round Function (Calls update_mmr on finish)
create or replace function start_next_round(p_room_id uuid)
returns void as $$
declare
  v_next_type text;
  v_current_type text;
  v_status text;
  v_current_round int;
  v_next_round int;
  v_p1_score int;
  v_p2_score int;
  v_game_data jsonb;
  v_target text;
  v_types text[] := ARRAY['RPS', 'NUMBER_ASC', 'NUMBER_DESC'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
begin
  -- Get current state
  select game_type, status, current_round, player1_score, player2_score
  into v_current_type, v_status, v_current_round, v_p1_score, v_p2_score
  from game_sessions where id = p_room_id;

  -- 0. Check Victory Condition (Best of 5 -> First to 3)
  if v_p1_score >= 3 or v_p2_score >= 3 then
      update game_sessions set status = 'finished', phase_end_at = now() where id = p_room_id;
      
      -- [NEW] Trigger MMR Update automatically
      perform update_mmr(p_room_id);
      
      return;
  end if;

  -- 1. Pick Game Type
  if v_current_type = 'RPS' then
      v_next_type := 'RPS';
  else
      v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
  end if;
  
  -- 2. Setup Game Data
  if v_next_type = 'RPS' then
      v_target := v_opts[floor(random()*3 + 1)];
      v_game_data := '{}';
  else
      v_target := null;
      v_game_data := jsonb_build_object('seed', floor(random()*10000));
  end if;

  -- 3. Calculate Next Round
  if v_status = 'waiting' then
      v_next_round := 1;
  else
      v_next_round := v_current_round + 1;
  end if;

  -- 4. Update Session -> COUNTDOWN State (3 Seconds)
  update game_sessions
  set status = 'countdown',
      current_round = v_next_round,
      game_type = v_next_type,
      game_data = v_game_data,
      target_move = v_target,
      phase_start_at = now(),
      phase_end_at = now() + interval '3 seconds'
  where id = p_room_id;
end;
$$ language plpgsql;
