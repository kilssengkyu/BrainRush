-- Add Ready flags to game_sessions for sync start
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS player1_ready boolean default false;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS player2_ready boolean default false;

-- RPC to signal Ready
create or replace function set_player_ready(p_room_id uuid, p_player_id text)
returns void as $$
declare
  v_p1 text;
  v_p2 text;
begin
  select player1_id, player2_id into v_p1, v_p2 
  from game_sessions where id = p_room_id;

  if p_player_id = v_p1 then
      update game_sessions set player1_ready = true where id = p_room_id;
  elsif p_player_id = v_p2 then
      update game_sessions set player2_ready = true where id = p_room_id;
  end if;
end;
$$ language plpgsql;

-- Not required, but ensuring start_next_round checks readiness could be done here.
-- For now, the client Host logic will check the flags before calling start_next_round.
