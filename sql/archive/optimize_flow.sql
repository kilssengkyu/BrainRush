-- Optimize flow: Reduce countdown from 3s to 1s
CREATE OR REPLACE FUNCTION start_next_round(p_room_id uuid)
RETURNS void AS $$
DECLARE
  v_status text; v_cur_round int; v_p1_s int; v_p2_s int;
  v_next_type text; v_game_data jsonb; v_target text;
  v_current_type text; 
  v_types text[] := ARRAY['RPS', 'NUMBER_ASC', 'NUMBER_DESC'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
BEGIN
  -- 1. Get current state
  select game_type, status, current_round, player1_score, player2_score
  into v_current_type, v_status, v_cur_round, v_p1_s, v_p2_s
  from game_sessions where id = p_room_id;

  -- 2. Check Victory Condition
  if v_p1_s >= 3 or v_p2_s >= 3 then
      update game_sessions set status = 'finished', phase_end_at = now() where id = p_room_id;
      perform update_mmr(p_room_id);
      return;
  end if;

  -- 3. Determine Next Game
  if v_current_type is not null then
      v_next_type := v_current_type;
  else
      v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
  end if;
  
  -- 4. Setup Game Data
  if v_next_type = 'RPS' then
      v_target := v_opts[floor(random()*3 + 1)]; v_game_data := '{}';
  else
      v_target := null; v_game_data := jsonb_build_object('seed', floor(random()*10000));
  end if;

  -- 5. Advance Round (Shortened Countdown: 1s)
  update game_sessions
  set status = 'countdown',
      current_round = v_cur_round + 1,
      game_type = v_next_type,
      game_data = v_game_data,
      target_move = v_target,
      phase_start_at = now(),
      phase_end_at = now() + interval '1 second'  -- CHANGED FROM 3 seconds
  where id = p_room_id;
END;
$$ LANGUAGE plpgsql;
