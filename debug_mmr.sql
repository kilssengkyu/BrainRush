-- DEBUG VERSION of update_mmr
-- Writes ERROR CODES to mmr_change columns to identify why MMR isn't updating.
-- -1: Game Mode is not 'rank' (Database thinks it is normal or something else)
-- -2: Player 1 Profile Missing (Logic thinks Player 1 is a Guest)
-- -3: Player 2 Profile Missing (Logic thinks Player 2 is a Guest)
-- -4: Both Profiles Missing

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

  -- [DEBUG] Check Mode
  if v_mode != 'rank' then
      update game_sessions set player1_mmr_change = -1, player2_mmr_change = -1 where id = p_room_id;
      return; 
  end if;

  -- Safe MMR fetch
  begin select mmr into v_p1_mmr from public.profiles where id = v_p1::uuid; exception when others then v_p1_mmr := null; end;
  begin select mmr into v_p2_mmr from public.profiles where id = v_p2::uuid; exception when others then v_p2_mmr := null; end;

  -- [DEBUG] Check Profiles
  if v_p1_mmr is null and v_p2_mmr is null then
      update game_sessions set player1_mmr_change = -4, player2_mmr_change = -4 where id = p_room_id;
      return;
  elsif v_p1_mmr is null then
      update game_sessions set player1_mmr_change = -2, player2_mmr_change = 0 where id = p_room_id;
      return;
  elsif v_p2_mmr is null then
      update game_sessions set player1_mmr_change = 0, player2_mmr_change = -3 where id = p_room_id;
      return;
  end if;

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

  -- Save Change
  update game_sessions 
  set player1_mmr_change = v_p1_change, 
      player2_mmr_change = v_p2_change 
  where id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
