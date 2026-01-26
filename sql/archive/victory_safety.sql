-- [SAFETY] Server-Side Victory Check
-- Ensures that if a player reaches 3 points, the game ends IMMEDIATELY on the server.
-- This prevents "Zombie Games" if the Host disconnects during the celebration phase.

CREATE OR REPLACE FUNCTION submit_move(p_room_id uuid, p_player_id text, p_move text)
RETURNS void AS $$
DECLARE
  v_game_type text;
  v_round int;
  v_p1 text; v_p2 text;
  v_target text;
  v_p1_move text; v_p2_move text;
  v_p1_time int; v_p2_time int;
  v_p1_score int; v_p2_score int;
  v_new_status text;
BEGIN
  -- Get context
  select game_type, current_round, target_move, player1_id, player2_id, player1_score, player2_score
  into v_game_type, v_round, v_target, v_p1, v_p2, v_p1_score, v_p2_score
  from game_sessions where id = p_room_id;

  -- 1. Log move
  insert into game_moves (room_id, player_id, round, move)
  values (p_room_id, p_player_id, v_round, p_move);

  -- 2. Evaluate Logic
  if v_game_type = 'RPS' then
      -- (RPS Logic simplified for brevity, assuming standard 1-point increment)
      declare
          v_win_move text;
          v_winner text := null;
      begin
          if v_target = 'rock' then v_win_move := 'paper';
          elsif v_target = 'paper' then v_win_move := 'scissors';
          else v_win_move := 'rock';
          end if;

          if p_move = v_win_move then
             if p_player_id = v_p1 then
                v_p1_score := v_p1_score + 1;
                v_winner := 'p1';
             else
                v_p2_score := v_p2_score + 1;
                v_winner := 'p2';
             end if;
             
             -- UPDATE SCORES
             update game_sessions set player1_score = v_p1_score, player2_score = v_p2_score where id = p_room_id;

             -- CHECK VICTORY
             if v_p1_score >= 3 or v_p2_score >= 3 then
                 update game_sessions set status = 'finished', phase_end_at = now() where id = p_room_id;
                 perform update_mmr(p_room_id); -- <--- DIRECT SERVER TRIGGER
             else
                 update game_sessions set status = 'round_end', phase_end_at = now() where id = p_room_id;
             end if;
          end if;
      end;

  elsif v_game_type like 'NUMBER%' then
      -- Check if both moved
      select move into v_p1_move from game_moves where room_id = p_room_id and round = v_round and player_id = v_p1 and move like 'DONE:%' limit 1;
      select move into v_p2_move from game_moves where room_id = p_room_id and round = v_round and player_id = v_p2 and move like 'DONE:%' limit 1;

      if v_p1_move is not null and v_p2_move is not null then
          v_p1_time := cast(split_part(v_p1_move, ':', 2) as int);
          v_p2_time := cast(split_part(v_p2_move, ':', 2) as int);

          if v_p1_time < v_p2_time then v_p1_score := v_p1_score + 3; -- Winner takes all/chunk
          elsif v_p2_time < v_p1_time then v_p2_score := v_p2_score + 3;
          else v_p1_score := v_p1_score + 1; v_p2_score := v_p2_score + 1; -- Draw
          end if;

          update game_sessions set player1_score = v_p1_score, player2_score = v_p2_score where id = p_room_id;
          
          if v_p1_score >= 3 or v_p2_score >= 3 then
             update game_sessions set status = 'finished', phase_end_at = now() where id = p_room_id;
             perform update_mmr(p_room_id); -- <--- DIRECT SERVER TRIGGER
          else
             update game_sessions set status = 'round_end', phase_end_at = now() where id = p_room_id;
          end if;

      else
          -- Sudden Death Trigger
          update game_sessions set phase_end_at = now() + interval '500 milliseconds' where id = p_room_id;
      end if;
  end if;
END;
$$ LANGUAGE plpgsql;

-- Also update resolve_round for timeouts
CREATE OR REPLACE FUNCTION resolve_round(p_room_id uuid)
RETURNS void AS $$
DECLARE
  v_game_type text; v_round int; v_p1 text; v_p2 text;
  v_p1_move text; v_p2_move text;
  v_p1_score int; v_p2_score int;
BEGIN
  select game_type, current_round, player1_id, player2_id, player1_score, player2_score
  into v_game_type, v_round, v_p1, v_p2, v_p1_score, v_p2_score
  from game_sessions where id = p_room_id and status = 'playing';

  if not found then return; end if;

  if v_game_type like 'NUMBER%' then
      select move into v_p1_move from game_moves where room_id = p_room_id and round = v_round and player_id = v_p1 and move like 'DONE:%' limit 1;
      select move into v_p2_move from game_moves where room_id = p_room_id and round = v_round and player_id = v_p2 and move like 'DONE:%' limit 1;
      
      if v_p1_move is not null and v_p2_move is null then v_p1_score := v_p1_score + 3;
      elsif v_p2_move is not null and v_p1_move is null then v_p2_score := v_p2_score + 3;
      end if;
      
      update game_sessions set player1_score = v_p1_score, player2_score = v_p2_score where id = p_room_id;
      
      if v_p1_score >= 3 or v_p2_score >= 3 then
         update game_sessions set status = 'finished', phase_end_at = now() where id = p_room_id;
         perform update_mmr(p_room_id);
      else
         update game_sessions set status = 'round_end', phase_end_at = now() where id = p_room_id;
      end if;
  else
      update game_sessions set status = 'round_end', phase_end_at = now() where id = p_room_id;
  end if;
END;
$$ LANGUAGE plpgsql;
