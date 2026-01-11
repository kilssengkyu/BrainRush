-- 1. Add disconnects column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS disconnects int default 0;

-- 2. Define handle_disconnection RPC
-- Called by the staying player when the opponent fails to reconnect within 30s
CREATE OR REPLACE FUNCTION handle_disconnection(p_room_id uuid, p_leaver_id text)
RETURNS void AS $$
DECLARE
  v_p1 text; v_p2 text;
  v_winner_id text;
  v_leaver_mmr int; v_winner_mmr int;
  v_k int := 32;
  v_p1_score int; v_p2_score int;
  v_leaver_score_penalty int := -1; -- Or just 0 points? Treating as forfeit.
BEGIN
  -- Get Session Info
  select player1_id, player2_id, player1_score, player2_score 
  into v_p1, v_p2, v_p1_score, v_p2_score
  from game_sessions where id = p_room_id;

  -- Validate Leaver is in the room
  if v_p1 != p_leaver_id and v_p2 != p_leaver_id then
      raise exception 'Leaver not found in this room';
  end if;

  -- Identify Winner
  if v_p1 = p_leaver_id then
      v_winner_id := v_p2;
  else
      v_winner_id := v_p1;
  end if;

  -- Fetch MMRs
  select mmr into v_leaver_mmr from public.profiles where id = p_leaver_id::uuid;
  select mmr into v_winner_mmr from public.profiles where id = v_winner_id::uuid;

  -- Calculate MMR Change (Treat calculation as if Winner won against Leaver)
  -- Standard Elo calculation
  declare
      v_expect_winner float;
      v_expect_leaver float;
      v_winner_chg int;
      v_leaver_chg int;
  begin
      v_expect_winner := 1.0 / (1.0 + power(10.0, (v_leaver_mmr - v_winner_mmr)::float / 400.0));
      v_expect_leaver := 1.0 / (1.0 + power(10.0, (v_winner_mmr - v_leaver_mmr)::float / 400.0));

      v_winner_chg := round(v_k * (1.0 - v_expect_winner)); -- Actual result is 1.0 (Win)
      v_leaver_chg := round(v_k * (0.0 - v_expect_leaver)); -- Actual result is 0.0 (Loss)
      
      -- Update Leaver Profile (Disconnect +1, MMR down, NO Loss increase)
      update public.profiles 
      set mmr = mmr + v_leaver_chg, 
          disconnects = disconnects + 1 
      where id = p_leaver_id::uuid;

      -- Update Winner Profile (Win +1, MMR up)
      update public.profiles 
      set mmr = mmr + v_winner_chg, 
          wins = wins + 1 
      where id = v_winner_id::uuid;

      -- Close Session
      -- Give Winner 3 points to signify victory (or just mark finished)
      if v_winner_id = v_p1 then
          v_p1_score := 3;
      else
          v_p2_score := 3;
      end if;

      update game_sessions 
      set status = 'finished', 
          phase_end_at = now(),
          player1_score = v_p1_score,
          player2_score = v_p2_score,
          player1_mmr_change = case when v_p1 = v_winner_id then v_winner_chg else v_leaver_chg end,
          player2_mmr_change = case when v_p2 = v_winner_id then v_winner_chg else v_leaver_chg end
      where id = p_room_id;
  end;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
