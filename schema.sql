-- BrainRush V2 Schema (Server-Authoritative)

-- 1. Clean Slate
drop table if exists game_moves cascade;
drop table if exists game_sessions cascade;
drop table if exists public.profiles cascade;

-- [NEW] Authentication & Profiles
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  full_name text,
  avatar_url text,
  nickname text,
  
  -- Stats
  wins int default 0,
  losses int default 0,
  mmr int default 1000,
  
  created_at timestamptz default now()
);

-- RLS: Public can read, User can update own
alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can insert their own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Trigger to create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, nickname)
  values (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'avatar_url',
    'Player_' || floor(random() * 9000 + 1000)::text
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill: Ensure existing users have profiles (Useful after reset)
insert into public.profiles (id, email, full_name, avatar_url, nickname)
select 
  id, 
  email, 
  raw_user_meta_data->>'full_name', 
  raw_user_meta_data->>'avatar_url',
  'Player_' || floor(random() * 9000 + 1000)::text
from auth.users
where id not in (select id from public.profiles);

-- 2. Game Sessions Table
create table game_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  
  -- Players & Scores
  player1_id text not null,
  player2_id text not null,
  player1_score int default 0,
  player2_score int default 0,
  
  -- Game State Machine
  status text not null default 'waiting', -- 'waiting', 'countdown', 'playing', 'round_end', 'finished'
  game_type text, -- 'RPS', 'NUMBER_ASC', 'NUMBER_DESC', etc.
  
  -- Timing & Rounds
  current_round int default 0,
  phase_start_at timestamptz, -- When the current phase started
  phase_end_at timestamptz,   -- When the current phase MUST end (Server Truth)
  
  -- Game Data (Shared state like seed, grids, target)
  game_data jsonb,
  target_move text -- Legacy logic for RPS comparison
);

-- Disable RLS for prototype speed
alter table game_sessions disable row level security;

-- 3. Game Moves Table
create table game_moves (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references game_sessions(id) on delete cascade,
  player_id text not null,
  round int not null,
  move text not null, -- 'rock', 'paper', 'DONE:1234', etc.
  created_at timestamptz default now()
);

alter table game_moves disable row level security;

-- 4. RPC: Create Session
create or replace function create_session(p_player1_id text, p_player2_id text)
returns uuid as $$
declare
  v_id uuid;
begin
  insert into game_sessions (player1_id, player2_id, status, current_round)
  values (p_player1_id, p_player2_id, 'waiting', 0)
  returning id into v_id;
  
  return v_id;
end;
$$ language plpgsql;

-- 5. RPC: Start Next Round (Transition to Countdown)
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
  v_types text[] := ARRAY['RPS', 'NUMBER_ASC', 'NUMBER_DESC'];
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

-- 6. RPC: Trigger Game Start (Transition to Playing)
-- Called by Host when Countdown finishes (or via cron/trigger in real prod)
create or replace function trigger_game_start(p_room_id uuid)
returns void as $$
begin
  update game_sessions
  set status = 'playing',
      phase_start_at = now(),
      phase_end_at = now() + interval '60 seconds' -- Max round time
  where id = p_room_id and status = 'countdown';
end;
$$ language plpgsql;

-- 7. RPC: Submit Move
create or replace function submit_move(p_room_id uuid, p_player_id text, p_move text)
returns void as $$
declare
  v_game_type text;
  v_round int;
  v_p1 text;
  v_p2 text;
  v_target text;
  v_p1_move text;
  v_p2_move text;
  v_p1_time int;
  v_p2_time int;
begin
  -- Get current context
  select game_type, current_round, target_move, player1_id, player2_id
  into v_game_type, v_round, v_target, v_p1, v_p2
  from game_sessions where id = p_room_id;

  -- 1. Log the move
  insert into game_moves (room_id, player_id, round, move)
  values (p_room_id, p_player_id, v_round, p_move);

  -- 2. Evaluate Logic based on Game Type
  
  -- === RPS Logic ===
  if v_game_type = 'RPS' then
      -- Win logic: First to match target wins.
      declare
          v_win_move text;
      begin
          if v_target = 'rock' then v_win_move := 'paper';
          elsif v_target = 'paper' then v_win_move := 'scissors';
          else v_win_move := 'rock';
          end if;

          if p_move = v_win_move then
             -- Immediate Win for this round (First Verified)
             -- Use 'status = playing' constraint to prevent double-wins
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

  -- === NUMBER Logic (Race) ===
  elsif v_game_type like 'NUMBER%' then
      -- Protocol: 'DONE:<duration>'
      
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
          -- One player finished, the other hasn't.
          -- Enable "Sudden Death": End round in 0.5 seconds.
          update game_sessions set phase_end_at = now() + interval '500 milliseconds' where id = p_room_id;
      end if;
  end if;
end;
$$ language plpgsql;

-- 8. RPC: Resolve Round (Called on Timeout)
create or replace function resolve_round(p_room_id uuid)
returns void as $$
declare
  v_game_type text;
  v_round int;
  v_p1 text;
  v_p2 text;
  v_p1_move text;
  v_p2_move text;
begin
  select game_type, current_round, player1_id, player2_id
  into v_game_type, v_round, v_p1, v_p2
  from game_sessions where id = p_room_id and status = 'playing';

  -- If not playing, ignore
  if not found then return; end if;

  -- Logic for NUMBER games (Sudden Death Timeout)
  if v_game_type like 'NUMBER%' then
      -- Check who finished
      select move into v_p1_move from game_moves where room_id = p_room_id and round = v_round and player_id = v_p1 and move like 'DONE:%' limit 1;
      select move into v_p2_move from game_moves where room_id = p_room_id and round = v_round and player_id = v_p2 and move like 'DONE:%' limit 1;
      
      if v_p1_move is not null and v_p2_move is null then
         -- P1 wins by default
         update game_sessions set player1_score = player1_score + 3, status = 'round_end', phase_end_at = now() where id = p_room_id;
      elsif v_p2_move is not null and v_p1_move is null then
         -- P2 wins by default
         update game_sessions set player2_score = player2_score + 3, status = 'round_end', phase_end_at = now() where id = p_room_id;
      else
         -- Neither finished? Timeout -> Draw (0 points) or just end.
         update game_sessions set status = 'round_end', phase_end_at = now() where id = p_room_id;
      end if;
  else
      -- RPS Timeout? Random? Draw? 
      -- Maintain status quo for now (Draw)
       update game_sessions set status = 'round_end', phase_end_at = now() where id = p_room_id;
  end if;
end;
$$ language plpgsql;

-- 9. RPC: Delete Account (Self-Destruct)
create or replace function delete_account()
returns void as $$
begin
  -- 1. Explicitly delete the profile first to satisfy Foreign Key constraints
  delete from public.profiles where id = auth.uid();
  
  -- 2. Delete the user from Auth (Security Definer allows this)
  delete from auth.users where id = auth.uid();
end;
$$ language plpgsql security definer;

-- 10. Matchmaking Queue
create table matchmaking_queue (
  player_id uuid references auth.users not null primary key,
  mmr int not null,
  created_at timestamptz default now()
);

-- 11. RPC: Find Match (Window Expansion Logic)
create or replace function find_match(p_min_mmr int, p_max_mmr int)
returns uuid as $$
declare
  v_my_id uuid := auth.uid();
  v_opponent_id uuid;
  v_room_id uuid;
  v_my_mmr int;
begin
  -- Get my current MMR for the queue record
  select mmr into v_my_mmr from public.profiles where id = v_my_id;

  -- 1. Try to find an opponent
  -- Lock the row to prevent race conditions
  select player_id into v_opponent_id
  from matchmaking_queue
  where mmr >= p_min_mmr 
    and mmr <= p_max_mmr
    and player_id != v_my_id
  order by created_at asc
  limit 1
  for update skip locked;

  if v_opponent_id is not null then
    -- 2. Match Found!
    -- Remove both from queue
    delete from matchmaking_queue where player_id in (v_my_id, v_opponent_id);
    
    -- Create session (I am P1, Opponent is P2 - or random)
    insert into game_sessions (player1_id, player2_id, status, current_round)
    values (v_my_id::text, v_opponent_id::text, 'waiting', 0)
    returning id into v_room_id;
    
    return v_room_id;
  else
    -- 3. No match found, ensure I am in the queue
    insert into matchmaking_queue (player_id, mmr)
    values (v_my_id, v_my_mmr)
    on conflict (player_id) do update
    set mmr = v_my_mmr, created_at = now(); -- Update heartbeat
    
    return null;
  end if;
end;
$$ language plpgsql security definer;

-- 12. RPC: Update MMR (Elo System)
-- Called at the end of the game
create or replace function update_mmr(p_room_id uuid)
returns void as $$
declare
  v_p1 uuid;
  v_p2 uuid;
  v_p1_score int;
  v_p2_score int;
  
  v_p1_mmr int;
  v_p2_mmr int;
  
  v_k_factor int := 32;
  v_expected_p1 float;
  v_expected_p2 float;
  v_actual_p1 float;
  v_new_p1_mmr int;
  v_new_p2_mmr int;
begin
  -- Get Game Info
  select player1_id::uuid, player2_id::uuid, player1_score, player2_score
  into v_p1, v_p2, v_p1_score, v_p2_score
  from game_sessions
  where id = p_room_id;

  -- Check if already processed (optional guard)
  -- For now, relying on this being called once by client or trigger

  -- Get current MMRs
  select mmr into v_p1_mmr from public.profiles where id = v_p1;
  select mmr into v_p2_mmr from public.profiles where id = v_p2;

  -- Calculate Expected Score
  -- Expected_A = 1 / (1 + 10 ^ ((Rating_B - Rating_A) / 400))
  v_expected_p1 := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::float / 400.0));
  v_expected_p2 := 1.0 / (1.0 + power(10.0, (v_p1_mmr - v_p2_mmr)::float / 400.0));

  -- Determine Actual Score (1=Win, 0.5=Draw, 0=Loss)
  if v_p1_score > v_p2_score then
    v_actual_p1 := 1.0;
  elsif v_p2_score > v_p1_score then
    v_actual_p1 := 0.0;
  else
    v_actual_p1 := 0.5;
  end if;

  -- Calculate New Ratings
  v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (v_actual_p1 - v_expected_p1));
  v_new_p2_mmr := round(v_p2_mmr + v_k_factor * ((1.0 - v_actual_p1) - v_expected_p2));

  -- Update Profiles
  update public.profiles set mmr = v_new_p1_mmr, wins = wins + (case when v_actual_p1 = 1.0 then 1 else 0 end), losses = losses + (case when v_actual_p1 = 0.0 then 1 else 0 end) where id = v_p1;
  update public.profiles set mmr = v_new_p2_mmr, wins = wins + (case when v_actual_p1 = 0.0 then 1 else 0 end), losses = losses + (case when v_actual_p1 = 1.0 then 1 else 0 end) where id = v_p2;
end;
$$ language plpgsql security definer;
