-- 1. Add columns to store MMR Change
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS player1_mmr_change int default 0;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS player2_mmr_change int default 0;

-- 2. UPDATED update_mmr Function (Calculates and SAVES change)
CREATE OR REPLACE FUNCTION update_mmr(p_room_id uuid)
RETURNS void AS $$
DECLARE
  v_mode text;
  v_p1 text; v_p2 text;
  v_p1_score int; v_p2_score int;
  v_p1_mmr int; v_p2_mmr int;
  v_k int := 32;
  v_expect_p1 float; v_actual_p1 float;
  v_p1_change int; v_p2_change int;
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

  -- Calculate Change
  v_p1_change := round(v_k * (v_actual_p1 - v_expected_p1));
  v_p2_change := round(v_k * ((1.0 - v_actual_p1) - (1.0 - v_expected_p1)));

  -- Update Profiles
  update public.profiles set mmr = mmr + v_p1_change, wins = wins + (case when v_actual_p1 = 1.0 then 1 else 0 end), losses = losses + (case when v_actual_p1 = 0.0 then 1 else 0 end) where id = v_p1::uuid;
  update public.profiles set mmr = mmr + v_p2_change, wins = wins + (case when v_actual_p1 = 0.0 then 1 else 0 end), losses = losses + (case when v_actual_p1 = 1.0 then 1 else 0 end) where id = v_p2::uuid;

  -- [NEW] Save Change to Session
  update game_sessions 
  set player1_mmr_change = v_p1_change, 
      player2_mmr_change = v_p2_change 
  where id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
