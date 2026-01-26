-- Split Rank/Casual Stats Migration

-- 1. Add Casual Stats Columns
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS casual_wins int DEFAULT 0,
ADD COLUMN IF NOT EXISTS casual_losses int DEFAULT 0;

-- 2. Update update_mmr to handle modes
CREATE OR REPLACE FUNCTION update_mmr(p_room_id uuid)
RETURNS void AS $$
DECLARE
  v_mode text;
  v_p1 uuid; v_p2 uuid;
  v_p1_score int; v_p2_score int;
  v_p1_mmr int; v_p2_mmr int;
  v_k int := 32;
  v_expect_p1 float; v_actual_p1 float;
  v_p1_chg int; v_p2_chg int;
BEGIN
  -- Get Session Info
  select mode, player1_id::uuid, player2_id::uuid, player1_score, player2_score
  into v_mode, v_p1, v_p2, v_p1_score, v_p2_score
  from game_sessions where id = p_room_id;

  -- Default to rank if null
  if v_mode is null then v_mode := 'rank'; end if;

  -- Fetch Current MMRs (Needed for calculation even if not updating in casual? No, casual doesn't use MMR)
  -- Actually, let's just calculate win/loss result first.
  
  if v_p1_score > v_p2_score then v_actual_p1 := 1.0;
  elsif v_p2_score > v_p1_score then v_actual_p1 := 0.0;
  else v_actual_p1 := 0.5;
  end if;

  -- === CASUAL MODE ===
  if v_mode != 'rank' then
      -- Just update casual W/L, NO MMR CHANGE
      update public.profiles 
      set casual_wins = casual_wins + (case when v_actual_p1 = 1.0 then 1 else 0 end),
          casual_losses = casual_losses + (case when v_actual_p1 = 0.0 then 1 else 0 end)
      where id = v_p1;

      update public.profiles 
      set casual_wins = casual_wins + (case when v_actual_p1 = 0.0 then 1 else 0 end),
          casual_losses = casual_losses + (case when v_actual_p1 = 1.0 then 1 else 0 end)
      where id = v_p2;

      -- Set session mmr_change to 0 or null to indicate no change
      update game_sessions set player1_mmr_change = 0, player2_mmr_change = 0 where id = p_room_id;
      return;
  end if;

  -- === RANK MODE (MMR Logic) ===
  
  -- Fetch Profiles
  select mmr into v_p1_mmr from public.profiles where id = v_p1;
  select mmr into v_p2_mmr from public.profiles where id = v_p2;

  -- Safety check
  if v_p1_mmr is null or v_p2_mmr is null then return; end if;

  -- Elo Calculation
  v_expect_p1 := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::float / 400.0));
  
  v_p1_chg := round(v_k * (v_actual_p1 - v_expect_p1));
  v_p2_chg := round(v_k * ((1.0 - v_actual_p1) - (1.0 - v_expect_p1)));

  -- Update DB (Rank Stats)
  update public.profiles 
  set mmr = mmr + v_p1_chg, 
      wins = wins + (case when v_actual_p1 = 1.0 then 1 else 0 end), 
      losses = losses + (case when v_actual_p1 = 0.0 then 1 else 0 end) 
  where id = v_p1;

  update public.profiles 
  set mmr = mmr + v_p2_chg, 
      wins = wins + (case when v_actual_p1 = 0.0 then 1 else 0 end), 
      losses = losses + (case when v_actual_p1 = 1.0 then 1 else 0 end) 
  where id = v_p2;
  
  -- Save Change to Session
  update game_sessions set player1_mmr_change = v_p1_chg, player2_mmr_change = v_p2_chg where id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
