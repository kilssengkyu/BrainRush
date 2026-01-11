-- Fix game logic: Ensure Game Type persists across rounds (Sticky Game Type)
-- Currently, start_next_round picks a random game every time, causing RPS to switch to Number mid-match.

CREATE OR REPLACE FUNCTION start_next_round(p_room_id uuid)
RETURNS void AS $$
DECLARE
  v_status text; v_cur_round int; v_p1_s int; v_p2_s int;
  v_next_type text; v_game_data jsonb; v_target text;
  v_current_type text; -- Added missing variable
  v_types text[] := ARRAY['RPS', 'NUMBER_ASC', 'NUMBER_DESC'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
BEGIN
  -- 1. Get current state (Added game_type to selection)
  select game_type, status, current_round, player1_score, player2_score
  into v_current_type, v_status, v_cur_round, v_p1_s, v_p2_s
  from game_sessions where id = p_room_id;

  -- 2. Check Victory Condition (Best of 5 -> First to 3)
  if v_p1_s >= 3 or v_p2_s >= 3 then
      update game_sessions set status = 'finished', phase_end_at = now() where id = p_room_id;
      
      -- TRIGGER MMR UPDATE
      perform update_mmr(p_room_id);
      
      return;
  end if;

  -- 3. Determine Next Game
  -- Logic: If game_type is already set (e.g. RPS), KEEP IT. 
  -- Only pick random if it's the first round (NULL) or if we want to switch (not implemented yet).
  if v_current_type is not null then
      v_next_type := v_current_type;
  else
      v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
  end if;
  
  -- 4. Setup Game Data based on Type
  if v_next_type = 'RPS' then
      v_target := v_opts[floor(random()*3 + 1)]; v_game_data := '{}';
  else
      v_target := null; v_game_data := jsonb_build_object('seed', floor(random()*10000));
  end if;

  -- 5. Advance Round
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
