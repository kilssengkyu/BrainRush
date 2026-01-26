-- Reverse RPS Migration

-- 1. Update start_next_round to include RPS_LOSE
CREATE OR REPLACE FUNCTION start_next_round(p_room_id uuid)
RETURNS void AS $$
DECLARE
  v_next_type text;
  v_current_type text;
  v_status text;
  v_current_round int;
  v_next_round int;
  v_p1_score int;
  v_p2_score int;
  v_game_data jsonb;
  v_target text;
  -- Added RPS_LOSE to types
  v_types text[] := ARRAY['RPS', 'RPS_LOSE', 'NUMBER_ASC', 'NUMBER_DESC'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
BEGIN
  -- Get current state
  select game_type, status, current_round, player1_score, player2_score
  into v_current_type, v_status, v_current_round, v_p1_score, v_p2_score
  from game_sessions where id = p_room_id;

  -- 0. Check Victory Condition (Best of 5 -> First to 3)
  if v_p1_score >= 3 or v_p2_score >= 3 then
      update game_sessions set status = 'finished', phase_end_at = now() where id = p_room_id;
      -- Trigger MMR update
      perform update_mmr(p_room_id);
      return;
  end if;

  -- 1. Pick Game Type
  -- Sticky type logic: If we are already playing a game, keep it until the end of the match.
  if v_current_type is not null then
      v_next_type := v_current_type;
  else
      v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
  end if;
  
  -- 2. Setup Game Data
  if v_next_type = 'RPS' or v_next_type = 'RPS_LOSE' then
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

  -- 4. Update Session
  update game_sessions
  set status = 'countdown',
      current_round = v_next_round,
      game_type = v_next_type,
      game_data = v_game_data,
      target_move = v_target,
      phase_start_at = now(),
      -- 1 second countdown as per previous optimization
      phase_end_at = now() + interval '1 second'
  where id = p_room_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Update submit_move to handle RPS_LOSE
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
  -- Get current context
  select game_type, current_round, target_move, player1_id, player2_id
  into v_game_type, v_round, v_target, v_p1, v_p2
  from game_sessions where id = p_room_id;

  -- 1. Log the move
  insert into game_moves (room_id, player_id, round, move)
  values (p_room_id, p_player_id, v_round, p_move);

  -- 2. Evaluate Logic based on Game Type
  
  -- === RPS & RPS_LOSE Logic ===
  if v_game_type = 'RPS' or v_game_type = 'RPS_LOSE' then
      declare
          v_win_move text;
      begin
          if v_game_type = 'RPS' then
              -- Normal: Beat the target
              if v_target = 'rock' then v_win_move := 'paper';
              elsif v_target = 'paper' then v_win_move := 'scissors';
              else v_win_move := 'rock';
              end if;
          else
              -- Reverse: Lose to the target
              -- Target Rock -> I must play Scissors to lose
              if v_target = 'rock' then v_win_move := 'scissors';
              elsif v_target = 'paper' then v_win_move := 'rock';
              else v_win_move := 'paper';
              end if;
          end if;

          if p_move = v_win_move then
             -- Immediate Win
             if p_player_id = v_p1 then
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

  -- === NUMBER Logic ===
  elsif v_game_type like 'NUMBER%' then
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
          -- One player finished. Enable Sudden Death (0.5s)
          update game_sessions set phase_end_at = now() + interval '500 milliseconds' where id = p_room_id;
      end if;
  end if;
END;
$$ LANGUAGE plpgsql;
