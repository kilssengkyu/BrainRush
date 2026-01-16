-- Add SEQUENCE to game_sessions check constraint
ALTER TABLE game_sessions
DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;

ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_game_type_check
CHECK (game_type IN ('RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE'));


-- Update start_next_round function to include SEQUENCE (Used for rounds?)
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
  v_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
begin
  -- Get current state
  select game_type, status, current_round, player1_score, player2_score
  into v_current_type, v_status, v_current_round, v_p1_score, v_p2_score
  from game_sessions where id = p_room_id;

  -- 0. Check Victory Condition (Best of 5 -> First to 3)
  if v_p1_score >= 3 or v_p2_score >= 3 then
      update game_sessions set status = 'finished', phase_end_at = now() where id = p_room_id;
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


-- Update start_game function to include SEQUENCE (Used for initial start or single round games?)
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_game_type text;
    v_seed text;
    v_end_at timestamptz;
    v_rand float;
BEGIN
    v_rand := random();
    
    -- Equal probability for 7 games ~0.142 each
     IF v_rand < 0.142 THEN
         v_game_type := 'RPS';
     ELSIF v_rand < 0.284 THEN
         v_game_type := 'NUMBER';
     ELSIF v_rand < 0.426 THEN
         v_game_type := 'MATH';
     ELSIF v_rand < 0.568 THEN
         v_game_type := 'TEN';
     ELSIF v_rand < 0.710 THEN
         v_game_type := 'COLOR';
     ELSIF v_rand < 0.852 THEN
         v_game_type := 'MEMORY';
     ELSE
         v_game_type := 'SEQUENCE';
     END IF;
    
    -- Generate Seed
    v_seed := md5(random()::text || clock_timestamp()::text);

    -- Set End Time (30 seconds)
    v_end_at := now() + interval '30 seconds';

    -- Update Session
    UPDATE game_sessions
    SET 
        status = 'playing',
        game_type = v_game_type,
        seed = v_seed,
        start_at = now(),
        end_at = v_end_at,
        player1_score = 0,
        player2_score = 0,
        winner_id = NULL
    WHERE id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
