-- Consolidated Schema (Wrapped in Transaction)
BEGIN;

-- Base Schema: schema.sql
-- BrainRush V2 Schema (Server-Authoritative)

-- 1. Clean Slate
drop table if exists game_moves cascade;
drop table if exists game_sessions cascade;
drop table if exists public.profiles cascade;
drop table if exists matchmaking_queue cascade;
drop table if exists public.friendships cascade;
drop table if exists public.chat_messages cascade;

-- Clean up Functions (to avoid parameter mismatch errors)
DROP FUNCTION IF EXISTS find_match(int, int, text, text);
DROP FUNCTION IF EXISTS find_match(int, int, text);
DROP FUNCTION IF EXISTS find_match(int, int);
DROP FUNCTION IF EXISTS start_game(uuid);
DROP FUNCTION IF EXISTS start_next_round(uuid);
DROP FUNCTION IF EXISTS finish_game(uuid);
DROP FUNCTION IF EXISTS update_score(uuid, text, int);
DROP FUNCTION IF EXISTS submit_move(uuid, text, text);
DROP FUNCTION IF EXISTS check_active_session(text);
DROP FUNCTION IF EXISTS create_session(text, text);

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
$$ language plpgsql security definer SET search_path = public;

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
$$ language plpgsql security definer SET search_path = public;

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
$$ language plpgsql security definer SET search_path = public;

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
$$ language plpgsql security definer SET search_path = public;


-- Migrations start below --


-- Migration: enable_realtime.sql
-- Add tables to the realtime publication
-- This is required for clients to receive 'postgres_changes' events.
DO $$ BEGIN alter publication supabase_realtime add table game_sessions, game_moves; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Migration: fix_realtime.sql
-- Re-connect tables to Realtime Publication
-- This is NECESSARY after dropping and recreating tables.

DO $$ BEGIN alter publication supabase_realtime add table game_sessions, game_moves; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Verification:
-- If this runs successfully, Realtime events will resume.
-- If it says "relation already in publication", that is fine too.

-- Migration: guest_migration.sql
-- 1. MATCHMAKING_QUEUE: Allow text IDs and remove FK constraint to auth.users
-- This allows 'guest_xxxxx' IDs to be stored in the queue.
ALTER TABLE matchmaking_queue 
  DROP CONSTRAINT IF EXISTS matchmaking_queue_player_id_fkey;

ALTER TABLE matchmaking_queue 
  ALTER COLUMN player_id TYPE text;

-- 2. UPDATED find_match RPC
-- Now accepts p_player_id explicitly.
create or replace function find_match(p_min_mmr int, p_max_mmr int, p_player_id text)
returns uuid as $$
declare
  -- Use the passed ID. 
  v_my_id text := p_player_id;
  v_opponent_id text;
  v_room_id uuid;
  v_my_mmr int;
begin
  -- Get my current MMR. If I am a guest, default to 1000.
  -- We try to find a profile first.
  select mmr into v_my_mmr from public.profiles where id::text = v_my_id;
  
  if v_my_mmr is null then
    v_my_mmr := 1000; -- Default Guest MMR
  end if;

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
    
    -- Create session
    -- Note: game_sessions player columns are already TEXT type, so this allows guests.
    insert into game_sessions (player1_id, player2_id, status, current_round)
    values (v_my_id, v_opponent_id, 'waiting', 0)
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
$$ language plpgsql security definer SET search_path = public;

-- 3. Allow Guests (Public) to insert/delete from matchmaking_queue
ALTER TABLE matchmaking_queue ENABLE ROW LEVEL SECURITY;

-- Allow anyone (anon) to insert/select/delete their own rows or generally access for matchmaking
-- Since guests don't have auth.uid(), we might need to open this up or use a logic based on IP (hard).
-- For prototype/hybrid: Let's allow public access for now or use the function with security definer (already done).
-- However, we need to allow the `delete` in cancelSearch?
-- Actually, the cancelSearch usually runs a raw delete.
-- Better to wrap cancelSearch in an RPC to keep RLS secure, OR just open the table for this stage.

create policy "Enable all access for matchmaking_queue"
on matchmaking_queue
for all
using (true)
with check (true);

-- Ensure game_sessions allows guests
ALTER TABLE game_sessions DISABLE ROW LEVEL SECURITY; -- Already disabled in schema.sql but good to ensure.

-- Migration: ready_migration.sql
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

-- Migration: mmr_migration.sql
-- 1. UPDATED update_mmr Function (Safe & Robust)
create or replace function update_mmr(p_room_id uuid)
returns void as $$
declare
  v_p1 text;
  v_p2 text;
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
  select player1_id, player2_id, player1_score, player2_score
  into v_p1, v_p2, v_p1_score, v_p2_score
  from game_sessions
  where id = p_room_id;

  -- Try Fetch P1 MMR (Safely)
  begin
      select mmr into v_p1_mmr from public.profiles where id = v_p1::uuid;
  exception when others then v_p1_mmr := null; end;

  -- Try Fetch P2 MMR (Safely)
  begin
      select mmr into v_p2_mmr from public.profiles where id = v_p2::uuid;
  exception when others then v_p2_mmr := null; end;

  -- Only update if BOTH are valid users (Ranked Match)
  if v_p1_mmr is null or v_p2_mmr is null then
      return; 
  end if;

  -- Calculate Expected Score
  v_expected_p1 := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::float / 400.0));
  v_expected_p2 := 1.0 / (1.0 + power(10.0, (v_p1_mmr - v_p2_mmr)::float / 400.0));

  -- Determine Actual Score
  if v_p1_score > v_p2_score then v_actual_p1 := 1.0;
  elsif v_p2_score > v_p1_score then v_actual_p1 := 0.0;
  else v_actual_p1 := 0.5;
  end if;

  -- Calculate New Ratings
  v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (v_actual_p1 - v_expected_p1));
  v_new_p2_mmr := round(v_p2_mmr + v_k_factor * ((1.0 - v_actual_p1) - v_expected_p2));

  -- Update Profiles
  update public.profiles set mmr = v_new_p1_mmr, wins = wins + (case when v_actual_p1 = 1.0 then 1 else 0 end), losses = losses + (case when v_actual_p1 = 0.0 then 1 else 0 end) where id = v_p1::uuid;
  update public.profiles set mmr = v_new_p2_mmr, wins = wins + (case when v_actual_p1 = 0.0 then 1 else 0 end), losses = losses + (case when v_actual_p1 = 1.0 then 1 else 0 end) where id = v_p2::uuid;
end;
$$ language plpgsql security definer SET search_path = public;

-- 2. UPDATED start_next_round Function (Calls update_mmr on finish)
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
      
      -- [NEW] Trigger MMR Update automatically
      perform update_mmr(p_room_id);
      
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

-- Migration: mode_migration.sql
-- 1. Add 'mode' column to Matchmaking Queue
ALTER TABLE matchmaking_queue ADD COLUMN IF NOT EXISTS mode text default 'rank';

-- 2. Add 'mode' column to Game Sessions
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS mode text default 'rank';

-- 3. UPDATED find_match: Enforce Mode Matching (Rank vs Rank, Normal vs Normal)
CREATE OR REPLACE FUNCTION find_match(p_min_mmr int, p_max_mmr int, p_player_id text, p_mode text)
RETURNS uuid AS $$
DECLARE
  v_my_id text := p_player_id;
  v_opponent_id text;
  v_room_id uuid;
  v_my_mmr int;
BEGIN
  -- Get my MMR
  select mmr into v_my_mmr from public.profiles where id::text = v_my_id;
  if v_my_mmr is null then v_my_mmr := 1000; end if;

  -- Search for opponent in SAME MODE
  select player_id into v_opponent_id
  from matchmaking_queue
  where mmr >= p_min_mmr 
    and mmr <= p_max_mmr
    and player_id != v_my_id
    and mode = p_mode  -- Strict Mode Matching
  order by created_at asc
  limit 1
  for update skip locked;

  if v_opponent_id is not null then
    delete from matchmaking_queue where player_id in (v_my_id, v_opponent_id);
    
    -- Insert with Mode
    insert into game_sessions (player1_id, player2_id, status, current_round, mode)
    values (v_my_id, v_opponent_id, 'waiting', 0, p_mode)
    returning id into v_room_id;
    
    return v_room_id;
  else
    insert into matchmaking_queue (player_id, mmr, mode)
    values (v_my_id, v_my_mmr, p_mode)
    on conflict (player_id) do update
    set mmr = v_my_mmr, created_at = now(), mode = p_mode;
    
    return null;
  end if;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. UPDATED update_mmr: Only Run for Rank Mode
CREATE OR REPLACE FUNCTION update_mmr(p_room_id uuid)
RETURNS void AS $$
DECLARE
  v_mode text;
  v_p1 text; v_p2 text;
  v_p1_score int; v_p2_score int;
  v_p1_mmr int; v_p2_mmr int;
  v_k int := 32;
  v_expect_p1 float; v_actual_p1 float;
BEGIN
  -- Get Session Info
  select mode, player1_id, player2_id, player1_score, player2_score
  into v_mode, v_p1, v_p2, v_p1_score, v_p2_score
  from game_sessions
  where id = p_room_id;

  -- [CRITICAL] EXIT IF NOT RANK MODE
  if v_mode != 'rank' then
      return; 
  end if;

  -- Safe MMR fetch
  begin select mmr into v_p1_mmr from public.profiles where id = v_p1::uuid; exception when others then v_p1_mmr := null; end;
  begin select mmr into v_p2_mmr from public.profiles where id = v_p2::uuid; exception when others then v_p2_mmr := null; end;

  if v_p1_mmr is null or v_p2_mmr is null then return; end if;

  -- Elo Calculation
  v_expect_p1 := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::float / 400.0));
  
  if v_p1_score > v_p2_score then v_actual_p1 := 1.0;
  elsif v_p2_score > v_p1_score then v_actual_p1 := 0.0;
  else v_actual_p1 := 0.5;
  end if;

  -- Update
  update public.profiles set mmr = round(v_p1_mmr + v_k * (v_actual_p1 - v_expect_p1)), wins = wins + (case when v_actual_p1 = 1.0 then 1 else 0 end), losses = losses + (case when v_actual_p1 = 0.0 then 1 else 0 end) where id = v_p1::uuid;
  update public.profiles set mmr = round(v_p2_mmr + v_k * ((1.0 - v_actual_p1) - (1.0 - v_expect_p1))), wins = wins + (case when v_actual_p1 = 0.0 then 1 else 0 end), losses = losses + (case when v_actual_p1 = 1.0 then 1 else 0 end) where id = v_p2::uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: mmr_change_migration.sql
-- 1. Add columns to store MMR Change
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS player1_mmr_change int default 0;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS player2_mmr_change int default 0;

-- 2. UPDATED update_mmr Function (Calculates and SAVES change)
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

  -- [CRITICAL] EXIT IF NOT RANK MODE
  if v_mode != 'rank' then
      return; 
  end if;

  -- Safe MMR fetch
  begin select mmr into v_p1_mmr from public.profiles where id = v_p1::uuid; exception when others then v_p1_mmr := null; end;
  begin select mmr into v_p2_mmr from public.profiles where id = v_p2::uuid; exception when others then v_p2_mmr := null; end;

  if v_p1_mmr is null or v_p2_mmr is null then return; end if;

  -- Elo Calculation
  v_expect_p1 := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::float / 400.0));
  
  if v_p1_score > v_p2_score then v_actual_p1 := 1.0;
  elsif v_p2_score > v_p1_score then v_actual_p1 := 0.0;
  else v_actual_p1 := 0.5;
  end if;

  -- Calculate Change
  v_p1_change := round(v_k * (v_actual_p1 - v_expect_p1));
  v_p2_change := round(v_k * ((1.0 - v_actual_p1) - (1.0 - v_expect_p1)));

  -- Update Profiles
  update public.profiles set mmr = mmr + v_p1_change, wins = wins + (case when v_actual_p1 = 1.0 then 1 else 0 end), losses = losses + (case when v_actual_p1 = 0.0 then 1 else 0 end) where id = v_p1::uuid;
  update public.profiles set mmr = mmr + v_p2_change, wins = wins + (case when v_actual_p1 = 0.0 then 1 else 0 end), losses = losses + (case when v_actual_p1 = 1.0 then 1 else 0 end) where id = v_p2::uuid;

  -- [NEW] Save Change to Session
  update game_sessions 
  set player1_mmr_change = v_p1_change, 
      player2_mmr_change = v_p2_change 
  where id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: debug_mmr.sql
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: final_fix.sql
-- [FINAL FIX] Consolidated MMR System Script
-- Run this entire script to ensure everything is linked correctly.

-- 1. Ensure Columns Exist
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS player1_mmr_change int default 0;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS player2_mmr_change int default 0;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS mode text default 'rank';

-- 2. Define update_mmr (The Calculater)
CREATE OR REPLACE FUNCTION update_mmr(p_room_id uuid)
RETURNS void AS $$
DECLARE
  v_mode text;
  v_p1 text; v_p2 text;
  v_p1_score int; v_p2_score int;
  v_p1_mmr int; v_p2_mmr int;
  v_k int := 32;
  v_expect_p1 float; v_actual_p1 float;
  v_p1_chg int; v_p2_chg int;
BEGIN
  -- Get Session Info
  select mode, player1_id, player2_id, player1_score, player2_score
  into v_mode, v_p1, v_p2, v_p1_score, v_p2_score
  from game_sessions where id = p_room_id;

  -- [DEBUG] Force run if mode is null (default fallback)
  if v_mode is null then v_mode := 'rank'; end if;

  -- [DEBUG] Mark as -1 if not rank
  if v_mode != 'rank' then
      update game_sessions set player1_mmr_change = -1, player2_mmr_change = -1 where id = p_room_id;
      return; 
  end if;

  -- Fetch Profiles
  begin select mmr into v_p1_mmr from public.profiles where id = v_p1::uuid; exception when others then v_p1_mmr := null; end;
  begin select mmr into v_p2_mmr from public.profiles where id = v_p2::uuid; exception when others then v_p2_mmr := null; end;

  -- [DEBUG] Mark error codes for missing profiles
  if v_p1_mmr is null and v_p2_mmr is null then
      update game_sessions set player1_mmr_change = -4, player2_mmr_change = -4 where id = p_room_id; return;
  elsif v_p1_mmr is null then
      update game_sessions set player1_mmr_change = -2, player2_mmr_change = 0 where id = p_room_id; return;
  elsif v_p2_mmr is null then
      update game_sessions set player1_mmr_change = 0, player2_mmr_change = -3 where id = p_room_id; return;
  end if;

  -- Elo Calculation
  v_expect_p1 := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::float / 400.0));
  
  if v_p1_score > v_p2_score then v_actual_p1 := 1.0;
  elsif v_p2_score > v_p1_score then v_actual_p1 := 0.0;
  else v_actual_p1 := 0.5;
  end if;

  v_p1_chg := round(v_k * (v_actual_p1 - v_expect_p1));
  v_p2_chg := round(v_k * ((1.0 - v_actual_p1) - (1.0 - v_expect_p1)));

  -- Update DB
  update public.profiles set mmr = mmr + v_p1_chg, wins = wins + (case when v_actual_p1 = 1.0 then 1 else 0 end), losses = losses + (case when v_actual_p1 = 0.0 then 1 else 0 end) where id = v_p1::uuid;
  update public.profiles set mmr = mmr + v_p2_chg, wins = wins + (case when v_actual_p1 = 0.0 then 1 else 0 end), losses = losses + (case when v_actual_p1 = 1.0 then 1 else 0 end) where id = v_p2::uuid;
  
  -- Save Change
  update game_sessions set player1_mmr_change = v_p1_chg, player2_mmr_change = v_p2_chg where id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 3. Define start_next_round (The Trigger)
-- [CRITICAL]: This function MUST call update_mmr via 'perform'
CREATE OR REPLACE FUNCTION start_next_round(p_room_id uuid)
RETURNS void AS $$
DECLARE
  v_status text; v_cur_round int; v_p1_s int; v_p2_s int;
  v_next_type text; v_game_data jsonb; v_target text;
  v_types text[] := ARRAY['RPS', 'NUMBER_ASC', 'NUMBER_DESC'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
BEGIN
  select status, current_round, player1_score, player2_score
  into v_status, v_cur_round, v_p1_s, v_p2_s
  from game_sessions where id = p_room_id;

  -- Check Victory Condition
  if v_p1_s >= 3 or v_p2_s >= 3 then
      update game_sessions set status = 'finished', phase_end_at = now() where id = p_room_id;
      
      -- [!!!] TRIGGER MMR UPDATE HERE [!!!]
      perform update_mmr(p_room_id);
      
      return;
  end if;

  -- Determine Next Game
  v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
  
  if v_next_type = 'RPS' then
      v_target := v_opts[floor(random()*3 + 1)]; v_game_data := '{}';
  else
      v_target := null; v_game_data := jsonb_build_object('seed', floor(random()*10000));
  end if;

  -- Advance Round
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

-- Migration: fix_mmr_display.sql
-- Change default of MMR Change columns to NULL
-- This prevents the UI from showing "MMR +0" before the calculation is finished.

ALTER TABLE game_sessions ALTER COLUMN player1_mmr_change DROP DEFAULT;
ALTER TABLE game_sessions ALTER COLUMN player1_mmr_change SET DEFAULT NULL;

ALTER TABLE game_sessions ALTER COLUMN player2_mmr_change DROP DEFAULT;
ALTER TABLE game_sessions ALTER COLUMN player2_mmr_change SET DEFAULT NULL;

-- Optional: Reset existing waiting/active sessions to NULL (Safe to run)
UPDATE game_sessions SET player1_mmr_change = NULL, player2_mmr_change = NULL 
WHERE status IN ('waiting', 'countdown', 'playing');

-- Migration: victory_safety.sql
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

-- Migration: fix_matchmaking.sql
-- 1. Add ready status columns to game_sessions
ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS player1_ready boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS player2_ready boolean DEFAULT false;

-- 2. Create RPC to set player ready
CREATE OR REPLACE FUNCTION set_player_ready(p_room_id uuid, p_player_id text)
RETURNS void AS $$
DECLARE
    v_p1 text;
    v_p2 text;
BEGIN
    SELECT player1_id, player2_id INTO v_p1, v_p2
    FROM game_sessions
    WHERE id = p_room_id;

    IF v_p1 = p_player_id THEN
        UPDATE game_sessions SET player1_ready = true WHERE id = p_room_id;
    ELSIF v_p2 = p_player_id THEN
        UPDATE game_sessions SET player2_ready = true WHERE id = p_room_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 3. Clean up stale sessions (Optional but recommended)
-- Delete any sessions older than 10 minutes that are not finished
DELETE FROM game_sessions
WHERE status != 'finished'
AND created_at < NOW() - INTERVAL '10 minutes';

-- Migration: fix_game_logic.sql
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

-- Migration: disconnect_logic.sql
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: time_sync.sql
-- RPC to get accurate server time
CREATE OR REPLACE FUNCTION get_server_time()
RETURNS timestamptz AS $$
BEGIN
  RETURN now();
END;
$$ LANGUAGE plpgsql;

-- Migration: final_matchmaking.sql
-- FINAL CONSOLIDATED MATCHMAKING FIX
-- Combines Schema Fixes, Robust Logic, and Guest Support

-- 1. Schema Updates: Ensure tables support Guests and Modes
ALTER TABLE matchmaking_queue 
    DROP CONSTRAINT IF EXISTS matchmaking_queue_player_id_fkey;

ALTER TABLE matchmaking_queue 
    ALTER COLUMN player_id TYPE text;

ALTER TABLE matchmaking_queue 
    ADD COLUMN IF NOT EXISTS mode text DEFAULT 'rank',
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE game_sessions 
    ADD COLUMN IF NOT EXISTS mode text DEFAULT 'rank';

-- 2. Check Active Session RPC (Critical for Guest Logic)
CREATE OR REPLACE FUNCTION check_active_session(p_player_id text)
RETURNS TABLE (
    room_id uuid,
    opponent_id text,
    status text,
    created_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        gs.id as room_id,
        CASE 
            WHEN gs.player1_id = p_player_id THEN gs.player2_id 
            ELSE gs.player1_id 
        END as opponent_id,
        gs.status,
        gs.created_at
    FROM game_sessions gs
    WHERE (gs.player1_id = p_player_id OR gs.player2_id = p_player_id)
      AND gs.status != 'finished'
      AND (
          (gs.status = 'waiting' AND gs.created_at > (now() - interval '60 seconds'))
          OR
          (gs.status != 'waiting' AND gs.created_at > (now() - interval '1 hour'))
      )
    ORDER BY gs.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Robust Find Match RPC (Search First Strategy)
CREATE OR REPLACE FUNCTION find_match(
    p_min_mmr int,
    p_max_mmr int,
    p_player_id text,
    p_mode text DEFAULT 'rank'
)
RETURNS uuid AS $$
DECLARE
    v_opponent_id text;
    v_room_id uuid;
BEGIN
    -- A. Cleanup Stale Entries (Relaxed to 60s)
    DELETE FROM matchmaking_queue 
    WHERE updated_at < (now() - interval '60 seconds');

    -- B. Find Opponent (Search FIRST to avoid self-locking issues)
    SELECT player_id INTO v_opponent_id
    FROM matchmaking_queue
    WHERE player_id != p_player_id
      AND mmr BETWEEN p_min_mmr AND p_max_mmr
      AND mode = p_mode
      AND updated_at > (now() - interval '30 seconds')
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    -- C. Match Found?
    IF v_opponent_id IS NOT NULL THEN
        -- 1. Create Game Session (Include Mode)
        INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode)
        VALUES (p_player_id, v_opponent_id, 'waiting', 0, p_mode)
        RETURNING id INTO v_room_id;

        -- 2. Remove BOTH from queue
        DELETE FROM matchmaking_queue WHERE player_id IN (p_player_id, v_opponent_id);

        RETURN v_room_id;
    END IF;

    -- D. No match -> Upsert Self (Heartbeat)
    INSERT INTO matchmaking_queue (player_id, mmr, mode, updated_at)
    VALUES (p_player_id, (p_min_mmr + p_max_mmr) / 2, p_mode, now())
    ON CONFLICT (player_id) 
    DO UPDATE SET 
        mmr = EXCLUDED.mmr,
        mode = EXCLUDED.mode,
        updated_at = now();

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: optimize_flow.sql
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

-- Migration: split_stats.sql
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: reverse_rps.sql
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

-- Migration: rebuild_time_attack.sql
-- REBUILD FOR TIME ATTACK MODE
-- WARNING: This script drops game_sessions and matchmaking_queue tables!

-- 1. Drop Old Tables
DROP TABLE IF EXISTS game_moves CASCADE;
DROP TABLE IF EXISTS game_sessions CASCADE;
DROP TABLE IF EXISTS matchmaking_queue CASCADE;

-- 2. Create Tables

-- Matchmaking Queue
CREATE TABLE matchmaking_queue (
    player_id TEXT PRIMARY KEY,
    mmr INT DEFAULT 1000,
    mode TEXT DEFAULT 'rank',
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Game Sessions (Simplified)
CREATE TABLE game_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player1_id TEXT NOT NULL,
    player2_id TEXT NOT NULL,
    
    status TEXT DEFAULT 'waiting', -- waiting, playing, finished
    game_type TEXT, -- 'RPS', 'NUMBER', etc.
    seed TEXT, -- Shared random seed for content generation
    
    player1_score INT DEFAULT 0,
    player2_score INT DEFAULT 0,
    
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ, -- Game ends at this time
    
    winner_id TEXT,
    mode TEXT DEFAULT 'rank',
    
    created_at TIMESTAMPTZ DEFAULT now(),
    
    -- [FIX] Restored columns from original schema
    current_round INT DEFAULT 0,
    phase_end_at TIMESTAMPTZ
);

-- [FIX] Recreate game_moves table
CREATE TABLE game_moves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL,
    round INT NOT NULL,
    move TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure public client access and realtime updates after table rebuild
ALTER TABLE game_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE matchmaking_queue DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE game_sessions;
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;

-- 3. Functions (RPCs)

-- Check Active Session (For Reconnection)
DROP FUNCTION IF EXISTS check_active_session(text);
CREATE OR REPLACE FUNCTION check_active_session(p_player_id text)
RETURNS TABLE (
    room_id uuid,
    opponent_id text,
    status text,
    created_at timestamptz,
    game_type text,
    end_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        gs.id,
        CASE 
            WHEN gs.player1_id = p_player_id THEN gs.player2_id 
            ELSE gs.player1_id 
        END,
        gs.status,
        gs.created_at,
        gs.game_type,
        gs.end_at
    FROM game_sessions gs
    WHERE (gs.player1_id = p_player_id OR gs.player2_id = p_player_id)
      AND gs.status != 'finished'
      AND (
          (gs.status = 'waiting' AND gs.created_at > (now() - interval '60 seconds'))
          OR
          (gs.status != 'waiting' AND gs.created_at > (now() - interval '1 hour'))
      )
    ORDER BY gs.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- Find Match (Robust, Same as before but adapted)
DROP FUNCTION IF EXISTS find_match(int, int, text, text);
CREATE OR REPLACE FUNCTION find_match(
    p_min_mmr int,
    p_max_mmr int,
    p_player_id text,
    p_mode text DEFAULT 'rank'
)
RETURNS uuid AS $$
DECLARE
    v_opponent_id text;
    v_room_id uuid;
BEGIN
    -- Cleanup Stale
    DELETE FROM matchmaking_queue 
    WHERE updated_at < (now() - interval '60 seconds');

    -- Search
    SELECT player_id INTO v_opponent_id
    FROM matchmaking_queue
    WHERE player_id != p_player_id
      AND mmr BETWEEN p_min_mmr AND p_max_mmr
      AND mode = p_mode
      AND updated_at > (now() - interval '30 seconds')
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_opponent_id IS NOT NULL THEN
        -- Create Session (No Round, No Target)
        INSERT INTO game_sessions (player1_id, player2_id, status, mode)
        VALUES (p_player_id, v_opponent_id, 'waiting', p_mode)
        RETURNING id INTO v_room_id;

        DELETE FROM matchmaking_queue WHERE player_id IN (p_player_id, v_opponent_id);
        RETURN v_room_id;
    END IF;

    -- Upsert Self
    INSERT INTO matchmaking_queue (player_id, mmr, mode, updated_at)
    VALUES (p_player_id, (p_min_mmr + p_max_mmr) / 2, p_mode, now())
    ON CONFLICT (player_id) 
    DO UPDATE SET mmr = EXCLUDED.mmr, mode = EXCLUDED.mode, updated_at = now();

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- Start Game (Triggered by Host)
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    v_types text[] := ARRAY['RPS', 'NUMBER']; -- Available games
    v_selected_type text;
BEGIN
    v_seed := md5(random()::text);
    v_selected_type := v_types[floor(random()*array_length(v_types, 1) + 1)];

    UPDATE game_sessions
    SET status = 'playing',
        game_type = v_selected_type,
        seed = v_seed,
        start_at = now(),
        end_at = now() + interval '60 seconds' -- 1 Minute Time Attack
    WHERE id = p_room_id AND status = 'waiting';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- Update Score (Called periodically by clients)
CREATE OR REPLACE FUNCTION update_score(p_room_id uuid, p_player_id text, p_score int)
RETURNS void AS $$
DECLARE
    v_p1 text;
    v_p2 text;
BEGIN
    SELECT player1_id, player2_id INTO v_p1, v_p2
    FROM game_sessions WHERE id = p_room_id;

    IF p_player_id = v_p1 THEN
        UPDATE game_sessions SET player1_score = p_score WHERE id = p_room_id;
    ELSIF p_player_id = v_p2 THEN
        UPDATE game_sessions SET player2_score = p_score WHERE id = p_room_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- Finish Game (Check Time & MMR)
CREATE OR REPLACE FUNCTION finish_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_session record;
    v_winner text;
    v_loser text;
    v_is_draw boolean := false;
    v_k_factor int := 32;
    v_p1_mmr int;
    v_p2_mmr int;
    v_p1_exp float;
    v_p2_exp float;
    v_new_p1_mmr int;
    v_new_p2_mmr int;
BEGIN
    SELECT * INTO v_session FROM game_sessions WHERE id = p_room_id;
    
    IF v_session.status = 'finished' THEN RETURN; END IF;

    -- Determine Winner
    IF v_session.player1_score > v_session.player2_score THEN
        v_winner := v_session.player1_id;
        v_loser := v_session.player2_id;
    ELSIF v_session.player2_score > v_session.player1_score THEN
        v_winner := v_session.player2_id;
        v_loser := v_session.player1_id;
    ELSE
        v_is_draw := true;
    END IF;

    UPDATE game_sessions 
    SET status = 'finished', winner_id = v_winner 
    WHERE id = p_room_id;

    -- MMR Logic (Only for Rank Mode & Valid Users)
    IF v_session.mode = 'rank' AND v_winner IS NOT NULL AND NOT v_is_draw THEN
        IF v_winner NOT LIKE 'guest_%' AND v_loser NOT LIKE 'guest_%' THEN
             
             SELECT mmr INTO v_p1_mmr FROM profiles WHERE id = v_session.player1_id;
             SELECT mmr INTO v_p2_mmr FROM profiles WHERE id = v_session.player2_id;
             
             v_p1_exp := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::numeric / 400.0));
             v_p2_exp := 1.0 / (1.0 + power(10.0, (v_p1_mmr - v_p2_mmr)::numeric / 400.0));

             IF v_winner = v_session.player1_id THEN
                -- P1 Wins
                v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (1 - v_p1_exp));
                v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (0 - v_p2_exp));
                
                UPDATE profiles SET mmr = v_new_p1_mmr, wins = wins + 1 WHERE id = v_session.player1_id;
                UPDATE profiles SET mmr = v_new_p2_mmr, losses = losses + 1 WHERE id = v_session.player2_id;
             ELSE
                -- P2 Wins
                v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (0 - v_p1_exp));
                v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (1 - v_p2_exp));
                
                UPDATE profiles SET mmr = v_new_p1_mmr, losses = losses + 1 WHERE id = v_session.player1_id;
                UPDATE profiles SET mmr = v_new_p2_mmr, wins = wins + 1 WHERE id = v_session.player2_id;
             END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: fix_time_attack_permissions.sql
-- Enable Realtime safely
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE game_sessions;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN unique_violation THEN NULL;
    WHEN OTHERS THEN NULL; -- Ignore other errors for publication to ensure we proceed
END $$;

-- Disable RLS
ALTER TABLE game_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE matchmaking_queue DISABLE ROW LEVEL SECURITY;

-- Grants
GRANT ALL ON TABLE game_sessions TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE matchmaking_queue TO postgres, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION start_game TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_score TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION finish_game TO postgres, anon, authenticated, service_role;

-- Migration: reload_schema.sql
-- Refresh the schema cache
NOTIFY pgrst, 'reload schema';

-- Migration: fix_permissions_final.sql
-- Force Refresh Schema Cache (Top Priority)
NOTIFY pgrst, 'reload schema';

-- Schema Access
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- Table Permissions (Force Grant)
GRANT ALL ON TABLE game_sessions TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE matchmaking_queue TO postgres, anon, authenticated, service_role;

-- Disable RLS (Ensure it's off)
ALTER TABLE game_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE matchmaking_queue DISABLE ROW LEVEL SECURITY;

-- If for some reason Disable fails, let's also drop all policies to be clean
DROP POLICY IF EXISTS "Enable access to all users" ON game_sessions;
DROP POLICY IF EXISTS "Enable access to all users" ON matchmaking_queue;

-- Re-create a wide-open policy just in case RLS gets re-enabled
CREATE POLICY "Enable access to all users" ON game_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable access to all users" ON matchmaking_queue FOR ALL USING (true) WITH CHECK (true);

-- Migration: update_game_duration_30s.sql
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    v_types text[] := ARRAY['RPS', 'NUMBER']; -- Available games
    v_selected_type text;
BEGIN
    v_seed := md5(random()::text);
    v_selected_type := v_types[floor(random()*array_length(v_types, 1) + 1)];

    UPDATE game_sessions
    SET status = 'playing',
        game_type = v_selected_type,
        seed = v_seed,
        start_at = now(),
        end_at = now() + interval '30 seconds' -- Changed to 30s
    WHERE id = p_room_id AND status = 'waiting';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: update_score_secure.sql
CREATE OR REPLACE FUNCTION update_score(p_room_id uuid, p_player_id text, p_score int)
RETURNS void AS $$
DECLARE
    v_p1 text;
    v_p2 text;
BEGIN
    -- [SECURE] Caller Check
    IF NOT EXISTS (SELECT 1 FROM game_sessions WHERE id = p_room_id 
        AND (player1_id = auth.uid()::text OR player2_id = auth.uid()::text)) THEN
       RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT player1_id, player2_id INTO v_p1, v_p2
    FROM game_sessions WHERE id = p_room_id;

    IF v_p1 IS NULL THEN
        RAISE EXCEPTION 'Room not found or invalid permissions';
    END IF;

    IF p_player_id = v_p1 THEN
        UPDATE game_sessions SET player1_score = p_score WHERE id = p_room_id;
    ELSIF p_player_id = v_p2 THEN
        UPDATE game_sessions SET player2_score = p_score WHERE id = p_room_id;
    ELSE
        RAISE EXCEPTION 'Player ID % not found in room %', p_player_id, p_room_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: update_start_game_math.sql
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_game_type text;
    v_seed text;
    v_end_at timestamptz;
BEGIN
    -- 1. Random Game Type (RPS, NUMBER, MATH)
    -- random() returns 0.0 to 1.0
    -- < 0.33 : RPS
    -- < 0.66 : NUMBER
    -- else   : MATH
    IF random() < 0.33 THEN
        v_game_type := 'RPS';
    ELSIF random() < 0.66 THEN
        v_game_type := 'NUMBER';
    ELSE
        v_game_type := 'MATH';
    END IF;

    -- 2. Generate Seed
    v_seed := md5(random()::text || clock_timestamp()::text);

    -- 3. Set End Time (30 seconds from now)
    v_end_at := now() + interval '30 seconds';

    -- 4. Update Session
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

    -- 5. Notify (Implicit via Realtime)
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: add_math_constraint.sql
-- Add MATH to game_sessions check constraint
ALTER TABLE game_sessions
DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;

ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_game_type_check 
CHECK (game_type IN ('RPS', 'NUMBER', 'MATH'));

-- Migration: force_fix_constraint.sql
-- Robustly remove any constraint on game_type column and add the correct one
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find checking constraints on the game_type column
    FOR r IN (
        SELECT con.conname
        FROM pg_catalog.pg_constraint con
        INNER JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
        INNER JOIN pg_catalog.pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
        WHERE rel.relname = 'game_sessions'
          AND att.attname = 'game_type'
          AND con.contype = 'c' -- 'c' for check constraint
    ) LOOP
        -- Dynamically drop the constraint
        EXECUTE 'ALTER TABLE game_sessions DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- Add the new inclusive constraint
ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_game_type_check 
CHECK (game_type IN ('RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'LARGEST'));

-- Migration: add_make_ten_game.sql
-- Add TEN to game_sessions check constraint
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT con.conname
        FROM pg_catalog.pg_constraint con
        INNER JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
        INNER JOIN pg_catalog.pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
        WHERE rel.relname = 'game_sessions'
          AND att.attname = 'game_type'
          AND con.contype = 'c'
    ) LOOP
        EXECUTE 'ALTER TABLE game_sessions DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_game_type_check 
CHECK (game_type IN ('RPS', 'NUMBER', 'MATH', 'TEN'));

-- Update start_game function to include TEN
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_game_type text;
    v_seed text;
    v_end_at timestamptz;
    v_rand float;
BEGIN
    v_rand := random();
    
    -- Equal probability for 4 games? 0.25 each
    IF v_rand < 0.25 THEN
        v_game_type := 'RPS';
    ELSIF v_rand < 0.50 THEN
        v_game_type := 'NUMBER';
    ELSIF v_rand < 0.75 THEN
        v_game_type := 'MATH';
    ELSE
        v_game_type := 'TEN';
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: add_color_match_game.sql
-- Add COLOR to game_sessions check constraint
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT con.conname
        FROM pg_catalog.pg_constraint con
        INNER JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
        INNER JOIN pg_catalog.pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
        WHERE rel.relname = 'game_sessions'
          AND att.attname = 'game_type'
          AND con.contype = 'c'
    ) LOOP
        EXECUTE 'ALTER TABLE game_sessions DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_game_type_check 
CHECK (game_type IN ('RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR'));

-- Update start_game function to include COLOR
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_game_type text;
    v_seed text;
    v_end_at timestamptz;
    v_rand float;
BEGIN
    v_rand := random();
    
    -- Equal probability for 5 games? 0.20 each
     IF v_rand < 0.20 THEN
         v_game_type := 'RPS';
     ELSIF v_rand < 0.40 THEN
         v_game_type := 'NUMBER';
     ELSIF v_rand < 0.60 THEN
         v_game_type := 'MATH';
     ELSIF v_rand < 0.80 THEN
         v_game_type := 'TEN';
     ELSE
         v_game_type := 'COLOR';
     END IF;
    
    -- FOR TESTING: Force COLOR
    --v_game_type := 'COLOR';

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: add_warmup_delay.sql
-- Add delay to start_game
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_game_type text;
    v_seed text;
    v_start_at timestamptz;
    v_end_at timestamptz;
    v_rand float;
BEGIN
    v_rand := random();
    
    -- Equal probability for 5 games? 0.20 each
    IF v_rand < 0.20 THEN
        v_game_type := 'RPS';
    ELSIF v_rand < 0.40 THEN
        v_game_type := 'NUMBER';
    ELSIF v_rand < 0.60 THEN
        v_game_type := 'MATH';
    ELSIF v_rand < 0.80 THEN
        v_game_type := 'TEN';
    ELSE
        v_game_type := 'COLOR';
    END IF;
    
    -- UNCOMMENT TO RESTORE RANDOMNESS (Currently Testing Loop)
    -- v_game_type := 'COLOR'; 

    -- Generate Seed
    v_seed := md5(random()::text || clock_timestamp()::text);

    -- Set Start Time (Now + 4 seconds for Warm-up/Tutorial)
    v_start_at := now() + interval '4 seconds';

    -- Set End Time (Start + 30 seconds)
    v_end_at := v_start_at + interval '30 seconds';

    -- Update Session
    UPDATE game_sessions
    SET 
        status = 'playing',
        game_type = v_game_type,
        seed = v_seed,
        start_at = v_start_at,
        end_at = v_end_at,
        player1_score = 0,
        player2_score = 0,
        winner_id = NULL
    WHERE id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: update_finish_game_casual.sql
-- Update finish_game to handle casual_wins and casual_losses
-- Fix: proper casting of text player_ids to uuid for profiles table updates

CREATE OR REPLACE FUNCTION finish_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_session record;
    v_winner text;
    v_loser text;
    v_is_draw boolean := false;
    v_k_factor int := 32;
    v_p1_mmr int;
    v_p2_mmr int;
    v_p1_exp float;
    v_p2_exp float;
    v_new_p1_mmr int;
    v_new_p2_mmr int;
BEGIN
    SELECT * INTO v_session FROM game_sessions WHERE id = p_room_id;
    
    IF v_session.status = 'finished' THEN RETURN; END IF;

    -- Determine Winner
    IF v_session.player1_score > v_session.player2_score THEN
        v_winner := v_session.player1_id;
        v_loser := v_session.player2_id;
    ELSIF v_session.player2_score > v_session.player1_score THEN
        v_winner := v_session.player2_id;
        v_loser := v_session.player1_id;
    ELSE
        v_is_draw := true;
    END IF;

    UPDATE game_sessions 
    SET status = 'finished', winner_id = v_winner 
    WHERE id = p_room_id;

    -- Stats Update (Only for Valid Users, skip guests)
    IF v_winner IS NOT NULL AND NOT v_is_draw THEN
        IF v_winner NOT LIKE 'guest_%' AND v_loser NOT LIKE 'guest_%' THEN
            
            IF v_session.mode = 'rank' THEN
                -- Rank Mode: Update MMR and Rank Wins/Losses
                -- Cast text ID to uuid for profiles table
                SELECT mmr INTO v_p1_mmr FROM profiles WHERE id = v_session.player1_id::uuid;
                SELECT mmr INTO v_p2_mmr FROM profiles WHERE id = v_session.player2_id::uuid;
                
                v_p1_exp := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::numeric / 400.0));
                v_p2_exp := 1.0 / (1.0 + power(10.0, (v_p1_mmr - v_p2_mmr)::numeric / 400.0));

                IF v_winner = v_session.player1_id THEN
                    -- P1 Wins
                    v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (1 - v_p1_exp));
                    v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (0 - v_p2_exp));
                    
                    UPDATE profiles SET mmr = v_new_p1_mmr, wins = wins + 1 WHERE id = v_session.player1_id::uuid;
                    UPDATE profiles SET mmr = v_new_p2_mmr, losses = losses + 1 WHERE id = v_session.player2_id::uuid;
                ELSE
                    -- P2 Wins
                    v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (0 - v_p1_exp));
                    v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (1 - v_p2_exp));
                    
                    UPDATE profiles SET mmr = v_new_p1_mmr, losses = losses + 1 WHERE id = v_session.player1_id::uuid;
                    UPDATE profiles SET mmr = v_new_p2_mmr, wins = wins + 1 WHERE id = v_session.player2_id::uuid;
                END IF;

            ELSE
                -- Casual (or Non-Rank) Mode: Update Casual Wins/Losses
                -- Cast v_winner/v_loser (which are text) to uuid
                UPDATE profiles SET casual_wins = casual_wins + 1 WHERE id = v_winner::uuid;
                UPDATE profiles SET casual_losses = casual_losses + 1 WHERE id = v_loser::uuid;
            END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: add_memory_match_game.sql
-- Add MEMORY to game_sessions check constraint
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT con.conname
        FROM pg_catalog.pg_constraint con
        INNER JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
        INNER JOIN pg_catalog.pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
        WHERE rel.relname = 'game_sessions'
          AND att.attname = 'game_type'
          AND con.contype = 'c'
    ) LOOP
        EXECUTE 'ALTER TABLE game_sessions DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_game_type_check 
CHECK (game_type IN ('RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY'));

-- Update start_game function to include MEMORY (6 games, ~16.6% each)
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_game_type text;
    v_seed text;
    v_end_at timestamptz;
    v_rand float;
BEGIN
    v_rand := random();
    
    -- Equal probability for 6 games? ~0.1666 each
     IF v_rand < 0.16 THEN
         v_game_type := 'RPS';
     ELSIF v_rand < 0.32 THEN
         v_game_type := 'NUMBER';
     ELSIF v_rand < 0.48 THEN
         v_game_type := 'MATH';
     ELSIF v_rand < 0.64 THEN
         v_game_type := 'TEN';
     ELSIF v_rand < 0.80 THEN
         v_game_type := 'COLOR';
     ELSE
         v_game_type := 'MEMORY';
     END IF;
    
    -- FOR TESTING: Force MEMORY
    --v_game_type := 'MEMORY';

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: add_reverse_sequence_game.sql
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: rebuild_game_logic.sql
-- REBUILD GAME LOGIC: 3-Game Set Structure
-- This migration updates the game_sessions table and related functions to support 3-round matches.

-- 1. Alter game_sessions table
-- We add columns to track the set of games and round progress.
ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS game_types text[], -- Array of game types for this match
ADD COLUMN IF NOT EXISTS current_round_index int DEFAULT 0, -- 0, 1, 2
ADD COLUMN IF NOT EXISTS round_scores jsonb DEFAULT '[]'::jsonb; -- History: [{p1: 100, p2: 120}, ...]

-- 2. Update start_game RPC
-- Selects 3 distinct random games and initializes the session.
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    v_all_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE'];
    v_selected_types text[];
    v_first_type text;
BEGIN
    -- Select 2 unique random games, then force LARGEST to appear once
    SELECT ARRAY(
        SELECT x
        FROM unnest(v_all_types) AS x
        ORDER BY random()
        LIMIT 2
    ) || ARRAY['LARGEST'] INTO v_selected_types;

    -- Shuffle so LARGEST isn't always last
    SELECT ARRAY(
        SELECT x
        FROM unnest(v_selected_types) AS x
        ORDER BY random()
    ) INTO v_selected_types;

    v_first_type := v_selected_types[1];
    v_seed := md5(random()::text);

    UPDATE game_sessions
    SET status = 'playing',
        game_types = v_selected_types,
        current_round_index = 0,
        game_type = v_first_type,
        seed = v_seed,
        start_at = now() + interval '4 seconds',
        end_at = now() + interval '34 seconds',
        round_scores = '[]'::jsonb
    WHERE id = p_room_id AND status = 'waiting';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 3. Create/Update start_next_round
-- Logic to handle transitions between rounds.
CREATE OR REPLACE FUNCTION next_round(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_session record;
    v_new_type text;
    v_new_index int;
    v_seed text;
    v_round_record jsonb;
BEGIN
    SELECT * INTO v_session FROM game_sessions WHERE id = p_room_id FOR UPDATE;

    -- Safety check
    IF v_session.status = 'finished' THEN RETURN; END IF;

    -- Record scores from the JUST FINISHED round
    v_round_record := jsonb_build_object(
        'round', v_session.current_round_index + 1,
        'p1_score', v_session.player1_score,
        'p2_score', v_session.player2_score,
        'game_type', v_session.game_type
    );

    UPDATE game_sessions 
    SET round_scores = round_scores || v_round_record,
        player1_score = 0, -- RESET SCORES FOR NEXT ROUND
        player2_score = 0
    WHERE id = p_room_id;

    -- Check if we have more rounds
    -- current_round_index is 0-based. 3 games means indices 0, 1, 2.
    IF v_session.current_round_index < 2 THEN
        -- Setup Next Round
        v_new_index := v_session.current_round_index + 1;
        v_new_type := v_session.game_types[v_new_index + 1]; -- Postgres arrays are 1-based
        v_seed := md5(random()::text);

        UPDATE game_sessions
        SET current_round_index = v_new_index,
            game_type = v_new_type,
            seed = v_seed,
            -- Add 6s delay for "Round Result" + "Next Round Splash"
            start_at = now() + interval '6 seconds',
            end_at = now() + interval '36 seconds' -- 30s + 6s
        WHERE id = p_room_id;
    ELSE
        -- No more rounds => Finish Game
        PERFORM finish_game(p_room_id);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 4. Update finish_game
-- Calculate TOTAL scores from round_scores history + last round
CREATE OR REPLACE FUNCTION finish_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_session record;
    v_winner text;
    v_loser text;
    v_is_draw boolean := false;
    v_k_factor int := 32;
    v_p1_mmr int;
    v_p2_mmr int;
    v_p1_exp float;
    v_p2_exp float;
    v_new_p1_mmr int;
    v_new_p2_mmr int;
    
    -- Totals
    v_p1_total int := 0;
    v_p2_total int := 0;
    v_round jsonb;
    -- v_last_round_record jsonb; -- Removed to prevent duplicate
BEGIN
    SELECT * INTO v_session FROM game_sessions WHERE id = p_room_id;
    
    IF v_session.status = 'finished' THEN RETURN; END IF;

    -- Note: 'next_round' ALREADY pushes the last round's score to 'round_scores' before calling 'finish_game'.
    -- So we just need to sum up what's in 'round_scores'.
    
    -- Reload session to be sure (though 'v_session' above might be stale if next_round updated it in the same transaction context? 
    -- Actually, since next_round calls finish_game, the changes in next_round are visible if we query again or pass it.
    -- But PL/PGSQL variable 'v_session' is a snapshot at SELECT time.
    -- We need to re-fetch round_scores or trust it's there.
    
    SELECT round_scores INTO v_session.round_scores FROM game_sessions WHERE id = p_room_id;

    -- Calculate Totals
    FOR v_round IN SELECT * FROM jsonb_array_elements(v_session.round_scores)
    LOOP
        v_p1_total := v_p1_total + (v_round->>'p1_score')::int;
        v_p2_total := v_p2_total + (v_round->>'p2_score')::int;
    END LOOP;

    -- Determine Winner
    IF v_p1_total > v_p2_total THEN
        v_winner := v_session.player1_id;
        v_loser := v_session.player2_id;
    ELSIF v_p2_total > v_p1_total THEN
        v_winner := v_session.player2_id;
        v_loser := v_session.player1_id;
    ELSE
        v_is_draw := true;
    END IF;

    -- Update Final Status (Store Totals in p1_score/p2_score for simple display if needed, but round_scores has details)
    -- Actually, let's keep p1_score/p2_score as the LAST round score? 
    -- User said "Show result ... 1 round score, 2 round score, 3 round score ... and final total"
    -- It's safer to store TOTAL in p1_score/p2_score at the end, so standard logic (like list views) shows total.
    UPDATE game_sessions 
    SET status = 'finished', 
        winner_id = v_winner, 
        end_at = now(),
        player1_score = v_p1_total,
        player2_score = v_p2_total
    WHERE id = p_room_id;

    -- MMR Logic (Only for Rank Mode & Valid Users)
    IF v_session.mode = 'rank' AND v_winner IS NOT NULL AND NOT v_is_draw THEN
        IF v_winner NOT LIKE 'guest_%' AND v_loser NOT LIKE 'guest_%' THEN
             
             SELECT mmr INTO v_p1_mmr FROM profiles WHERE id = v_session.player1_id;
             SELECT mmr INTO v_p2_mmr FROM profiles WHERE id = v_session.player2_id;
             
             v_p1_exp := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::numeric / 400.0));
             v_p2_exp := 1.0 / (1.0 + power(10.0, (v_p1_mmr - v_p2_mmr)::numeric / 400.0));

             IF v_winner = v_session.player1_id THEN
                -- P1 Wins
                v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (1 - v_p1_exp));
                v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (0 - v_p2_exp));
                
                UPDATE profiles SET mmr = v_new_p1_mmr, wins = wins + 1 WHERE id = v_session.player1_id;
                UPDATE profiles SET mmr = v_new_p2_mmr, losses = losses + 1 WHERE id = v_session.player2_id;
             ELSE
                -- P2 Wins
                v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (0 - v_p1_exp));
                v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (1 - v_p2_exp));
                
                UPDATE profiles SET mmr = v_new_p1_mmr, losses = losses + 1 WHERE id = v_session.player1_id;
                UPDATE profiles SET mmr = v_new_p2_mmr, wins = wins + 1 WHERE id = v_session.player2_id;
             END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: add_country_to_profiles.sql
-- Add country column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS country text DEFAULT NULL;

-- Comment on column
COMMENT ON COLUMN profiles.country IS 'ISO 3166-1 alpha-2 country code (e.g. KR, US)';

-- Migration: fix_rank_mode_crash.sql
-- Fix Rank Mode Crash & MMR Logic

-- 1. Add 'mode' column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'game_sessions' AND column_name = 'mode') THEN
        ALTER TABLE game_sessions ADD COLUMN mode text DEFAULT 'normal';
    END IF;
END $$;

-- 2. Update find_match to set mode = 'rank'
CREATE OR REPLACE FUNCTION find_match(p_min_mmr int, p_max_mmr int)
RETURNS uuid AS $$
DECLARE
  v_my_id uuid := auth.uid();
  v_opponent_id uuid;
  v_room_id uuid;
  v_my_mmr int;
BEGIN
  -- Get my current MMR for the queue record
  SELECT mmr INTO v_my_mmr FROM public.profiles WHERE id = v_my_id;

  -- 1. Try to find an opponent
  SELECT player_id INTO v_opponent_id
  FROM matchmaking_queue
  WHERE mmr >= p_min_mmr 
    AND mmr <= p_max_mmr
    AND player_id != v_my_id
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_opponent_id IS NOT NULL THEN
    -- 2. Match Found!
    DELETE FROM matchmaking_queue WHERE player_id IN (v_my_id, v_opponent_id);
    
    -- Create session (Rank Mode)
    INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode)
    VALUES (v_my_id::text, v_opponent_id::text, 'waiting', 0, 'rank')
    RETURNING id INTO v_room_id;
    
    RETURN v_room_id;
  ELSE
    -- 3. No match found, ensure I am in the queue
    INSERT INTO matchmaking_queue (player_id, mmr)
    VALUES (v_my_id, v_my_mmr)
    ON CONFLICT (player_id) DO UPDATE
    SET mmr = v_my_mmr, created_at = now();
    
    RETURN NULL;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Update finish_game to handle NULL MMRs & Use mode correctly
CREATE OR REPLACE FUNCTION finish_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_session record;
    v_winner text;
    v_loser text;
    v_is_draw boolean := false;
    v_k_factor int := 32;
    v_p1_mmr int;
    v_p2_mmr int;
    v_p1_exp float;
    v_p2_exp float;
    v_new_p1_mmr int;
    v_new_p2_mmr int;
    
    -- Totals
    v_p1_total int := 0;
    v_p2_total int := 0;
    v_round jsonb;
BEGIN
    SELECT * INTO v_session FROM game_sessions WHERE id = p_room_id;
    
    IF v_session.status = 'finished' THEN RETURN; END IF;

    -- Reload session scores just in case
    SELECT round_scores INTO v_session.round_scores FROM game_sessions WHERE id = p_room_id;

    -- Calculate Totals
    FOR v_round IN SELECT * FROM jsonb_array_elements(v_session.round_scores)
    LOOP
        v_p1_total := v_p1_total + (v_round->>'p1_score')::int;
        v_p2_total := v_p2_total + (v_round->>'p2_score')::int;
    END LOOP;

    -- Determine Winner
    IF v_p1_total > v_p2_total THEN
        v_winner := v_session.player1_id;
        v_loser := v_session.player2_id;
    ELSIF v_p2_total > v_p1_total THEN
        v_winner := v_session.player2_id;
        v_loser := v_session.player1_id;
    ELSE
        v_is_draw := true;
    END IF;

    -- Update Final Status
    UPDATE game_sessions 
    SET status = 'finished', 
        winner_id = v_winner, 
        end_at = now(),
        player1_score = v_p1_total,
        player2_score = v_p2_total
    WHERE id = p_room_id;

    -- MMR Logic (Only for Rank Mode & Valid Users)
    -- Check if mode exists and is 'rank'
    IF v_session.mode = 'rank' AND v_winner IS NOT NULL AND NOT v_is_draw THEN
        IF v_winner NOT LIKE 'guest_%' AND v_loser NOT LIKE 'guest_%' THEN
             
             -- Safe Fetch with Coalesce
             SELECT COALESCE(mmr, 1000) INTO v_p1_mmr FROM profiles WHERE id = v_session.player1_id::uuid;
             SELECT COALESCE(mmr, 1000) INTO v_p2_mmr FROM profiles WHERE id = v_session.player2_id::uuid;
             
             -- Null check safety (redundant with coalesce but good practice)
             IF v_p1_mmr IS NULL THEN v_p1_mmr := 1000; END IF;
             IF v_p2_mmr IS NULL THEN v_p2_mmr := 1000; END IF;

             -- Elo Calculation
             v_p1_exp := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::numeric / 400.0));
             v_p2_exp := 1.0 / (1.0 + power(10.0, (v_p1_mmr - v_p2_mmr)::numeric / 400.0));

             IF v_winner = v_session.player1_id THEN
                -- P1 Wins
                v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (1 - v_p1_exp));
                v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (0 - v_p2_exp));
                
                UPDATE profiles SET mmr = v_new_p1_mmr, wins = wins + 1 WHERE id = v_session.player1_id::uuid;
                UPDATE profiles SET mmr = v_new_p2_mmr, losses = losses + 1 WHERE id = v_session.player2_id::uuid;
             ELSE
                -- P2 Wins
                v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (0 - v_p1_exp));
                v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (1 - v_p2_exp));
                
                UPDATE profiles SET mmr = v_new_p1_mmr, losses = losses + 1 WHERE id = v_session.player1_id::uuid;
                UPDATE profiles SET mmr = v_new_p2_mmr, wins = wins + 1 WHERE id = v_session.player2_id::uuid;
             END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: fix_missing_mode_column.sql
-- FIX: Add missing 'mode' column to game_sessions

ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS mode text DEFAULT 'normal';

-- Ensure existing rows have a value (optional, but good for safety)
UPDATE game_sessions SET mode = 'normal' WHERE mode IS NULL;

-- If you have a separate function to create rooms, ensure it sets this column.
-- For matchmaking (find_match logic), it usually inserts 'rank' or 'normal'.
-- Make sure the RPCs are aware of this column if they do exact INSERTs.

-- Migration: fix_rpc_and_mode.sql
-- FIX: Consolidated fix for RPCs and Mode column.

-- 1. Ensure mode column exists
ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS mode text DEFAULT 'rank';

ALTER TABLE matchmaking_queue 
ADD COLUMN IF NOT EXISTS mode text DEFAULT 'rank';

-- 2. Recreate check_active_session (Fixes potential 400 error)
DROP FUNCTION IF EXISTS check_active_session(text);

CREATE OR REPLACE FUNCTION check_active_session(p_player_id text)
RETURNS TABLE (
    room_id uuid,
    opponent_id text,
    status text,
    created_at timestamptz
) AS $$
BEGIN
    -- [SECURE] Verify ownership if UUID
    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
         IF p_player_id != auth.uid()::text THEN RAISE EXCEPTION 'Not authorized'; END IF;
    END IF;

    RETURN QUERY
    SELECT 
        gs.id as room_id,
        CASE 
            WHEN gs.player1_id = p_player_id THEN gs.player2_id 
            ELSE gs.player1_id 
        END as opponent_id,
        gs.status,
        gs.created_at
    FROM game_sessions gs
    WHERE (gs.player1_id = p_player_id OR gs.player2_id = p_player_id)
      AND gs.status != 'finished'
      AND (
          (gs.status = 'waiting' AND gs.created_at > (now() - interval '60 seconds'))
          OR
          (gs.status != 'waiting' AND gs.created_at > (now() - interval '1 hour'))
      )
    ORDER BY gs.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 3. Recreate find_match (Updates to use mode column)
DROP FUNCTION IF EXISTS find_match(int, int, text, text);

CREATE OR REPLACE FUNCTION find_match(
    p_min_mmr int,
    p_max_mmr int,
    p_player_id text,
    p_mode text DEFAULT 'rank'
)
RETURNS uuid AS $$
DECLARE
    v_opponent_id text;
    v_room_id uuid;
BEGIN
    -- [SECURE] Verify ownership if UUID
    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
         IF p_player_id != auth.uid()::text THEN RAISE EXCEPTION 'Not authorized'; END IF;
    END IF;

    -- A. Cleanup Stale Entries
    DELETE FROM matchmaking_queue 
    WHERE updated_at < (now() - interval '60 seconds');

    -- B. Find Opponent
    SELECT player_id INTO v_opponent_id
    FROM matchmaking_queue
    WHERE player_id != p_player_id
      AND mmr BETWEEN p_min_mmr AND p_max_mmr
      AND mode = p_mode
      AND updated_at > (now() - interval '30 seconds')
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    -- C. Match Found?
    IF v_opponent_id IS NOT NULL THEN
        INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode)
        VALUES (p_player_id, v_opponent_id, 'waiting', 0, p_mode)
        RETURNING id INTO v_room_id;

        DELETE FROM matchmaking_queue WHERE player_id IN (p_player_id, v_opponent_id);
        RETURN v_room_id;
    END IF;

    -- D. No match -> Upsert Self
    INSERT INTO matchmaking_queue (player_id, mmr, mode, updated_at)
    VALUES (p_player_id, (p_min_mmr + p_max_mmr) / 2, p_mode, now())
    ON CONFLICT (player_id) 
    DO UPDATE SET 
        mmr = EXCLUDED.mmr,
        mode = EXCLUDED.mode,
        updated_at = now();

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: fix_start_game_logic.sql
-- FIX: Ensure Start Game Logic and Schema are correct

-- 1. Ensure columns for 3-game set exist
ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS game_types text[],
ADD COLUMN IF NOT EXISTS current_round_index int DEFAULT 0,
ADD COLUMN IF NOT EXISTS round_scores jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS mode text DEFAULT 'rank';

-- 2. Recreate start_game function
DROP FUNCTION IF EXISTS start_game(uuid);

CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    -- Ensure all game types are listed
    v_all_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'LARGEST'];
    v_selected_types text[];
    v_first_type text;
BEGIN
    -- Select 3 unique random games
    -- Use a CTE or subquery to randomize
    SELECT ARRAY(
        SELECT x 
        FROM unnest(v_all_types) AS x 
        ORDER BY random() 
        LIMIT 3
    ) INTO v_selected_types;

    v_first_type := v_selected_types[1];
    v_seed := md5(random()::text);

    -- Update the session to start playing
    UPDATE game_sessions
    SET status = 'playing',
        game_types = v_selected_types,
        current_round_index = 0,
        game_type = v_first_type,
        seed = v_seed,
        start_at = now() + interval '4 seconds',
        end_at = now() + interval '34 seconds',
        round_scores = '[]'::jsonb
    WHERE id = p_room_id AND status = 'waiting';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: fix_missing_seed_column.sql
-- FIX: Add missing 'seed' and time columns to game_sessions

ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS seed text,
ADD COLUMN IF NOT EXISTS start_at timestamptz,
ADD COLUMN IF NOT EXISTS end_at timestamptz;

-- Ensure consistency
UPDATE game_sessions SET seed = md5(random()::text) WHERE seed IS NULL;

-- Migration: fix_missing_winner_column.sql
-- FIX: Add missing 'winner_id' and score columns to game_sessions

ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS winner_id text,
ADD COLUMN IF NOT EXISTS player1_score int DEFAULT 0,
ADD COLUMN IF NOT EXISTS player2_score int DEFAULT 0;

-- Migration: add_find_pair_game.sql
-- Add PAIR to game_sessions check constraint
ALTER TABLE game_sessions
DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;

ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_game_type_check
CHECK (game_type IN ('RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR'));

-- Update start_game function to include PAIR
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    -- Ensure all game types are listed including PAIR
    v_all_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR'];
    v_selected_types text[];
    v_first_type text;
BEGIN
    -- For testing: Always start with PAIR, then pick 2 random others
    SELECT ARRAY_CAT(
        ARRAY['PAIR'],
        ARRAY(
            SELECT x 
            FROM unnest(v_all_types) AS x 
            WHERE x != 'PAIR'
            ORDER BY random() 
            LIMIT 2
        )
    ) INTO v_selected_types;

    v_first_type := v_selected_types[1];
    v_seed := md5(random()::text);

    -- Update the session to start playing
    UPDATE game_sessions
    SET status = 'playing',
    game_types = v_selected_types,
    current_round_index = 0,
    game_type = v_first_type,
    seed = v_seed,
    start_at = now() + interval '4 seconds',
    end_at = now() + interval '34 seconds',
    round_scores = '[]'::jsonb
    WHERE id = p_room_id AND status = 'waiting';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: add_number_up_down_game.sql
-- Add UPDOWN to game_sessions check constraint
ALTER TABLE game_sessions
DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;

ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_game_type_check
CHECK (game_type IN ('RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR', 'UPDOWN'));

-- Update start_game function to include UPDOWN
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    -- Ensure all game types are listed including UPDOWN
    v_all_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR', 'UPDOWN'];
    v_selected_types text[];
    v_first_type text;
BEGIN
    -- For testing: Always start with UPDOWN, then pick 2 random others
    SELECT ARRAY_CAT(
        ARRAY['UPDOWN'],
        ARRAY(
            SELECT x 
            FROM unnest(v_all_types) AS x 
            WHERE x != 'UPDOWN'
            ORDER BY random() 
            LIMIT 2
        )
    ) INTO v_selected_types;

    v_first_type := v_selected_types[1];
    v_seed := md5(random()::text);

    -- Update the session to start playing
    UPDATE game_sessions
    SET status = 'playing',
    game_types = v_selected_types,
    current_round_index = 0,
    game_type = v_first_type,
    seed = v_seed,
    start_at = now() + interval '4 seconds',
    end_at = now() + interval '34 seconds',
    round_scores = '[]'::jsonb
    WHERE id = p_room_id AND status = 'waiting';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: add_normal_sequence_game.sql
-- Add SEQUENCE_NORMAL to game_sessions check constraint
ALTER TABLE game_sessions
DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;

ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_game_type_check
CHECK (game_type IN ('RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN'));

-- Update start_game function to include SEQUENCE_NORMAL
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    -- Ensure all game types are listed including SEQUENCE_NORMAL
    v_all_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN'];
    v_selected_types text[];
    v_first_type text;
BEGIN
    -- For testing: Always start with SEQUENCE_NORMAL, then pick 2 random others
    SELECT ARRAY_CAT(
        ARRAY['SEQUENCE_NORMAL'],
        ARRAY(
            SELECT x 
            FROM unnest(v_all_types) AS x 
            WHERE x != 'SEQUENCE_NORMAL'
            ORDER BY random() 
            LIMIT 2
        )
    ) INTO v_selected_types;

    v_first_type := v_selected_types[1];
    v_seed := md5(random()::text);

    -- Update the session to start playing
    UPDATE game_sessions
    SET status = 'playing',
    game_types = v_selected_types,
    current_round_index = 0,
    game_type = v_first_type,
    seed = v_seed,
    start_at = now() + interval '4 seconds',
    end_at = now() + interval '34 seconds',
    round_scores = '[]'::jsonb
    WHERE id = p_room_id AND status = 'waiting';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: add_number_desc_game.sql
-- Add NUMBER_DESC to game_sessions check constraint
ALTER TABLE game_sessions
DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;

ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_game_type_check
CHECK (game_type IN ('RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'NUMBER_DESC'));

-- Update start_game function to include NUMBER_DESC
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    -- Ensure all game types are listed including NUMBER_DESC
    v_all_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'NUMBER_DESC'];
    v_selected_types text[];
    v_first_type text;
BEGIN
    -- Select 3 unique random games from the full list
    SELECT array_agg(x) INTO v_selected_types
    FROM (
        SELECT x FROM unnest(v_all_types) AS x ORDER BY random() LIMIT 3
    ) t;

    v_first_type := v_selected_types[1];
    v_seed := md5(random()::text);

    -- Update the session to start playing
    UPDATE game_sessions
    SET status = 'playing',
    game_types = v_selected_types,
    current_round_index = 0,
    game_type = v_first_type,
    seed = v_seed,
    start_at = now() + interval '4 seconds',
    end_at = now() + interval '34 seconds',
    round_scores = '[]'::jsonb
    WHERE id = p_room_id AND status = 'waiting';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: fix_score_secure.sql
-- Secure update_score: Block updates if game is finished
CREATE OR REPLACE FUNCTION update_score(p_room_id uuid, p_player_id text, p_score int)
RETURNS void AS $$
DECLARE
    v_p1 text;
    v_p2 text;
    v_status text;
BEGIN
    SELECT player1_id, player2_id, status 
    INTO v_p1, v_p2, v_status
    FROM game_sessions WHERE id = p_room_id;

    IF v_p1 IS NULL THEN
        RAISE EXCEPTION 'Room not found';
    END IF;

    -- CRITICAL CHECK: Do not allow score updates if game is finished
    -- This prevents race conditions where a late packet overwrites the Total Score
    IF v_status = 'finished' THEN
        RETURN;
    END IF;

    IF p_player_id = v_p1 THEN
        UPDATE game_sessions SET player1_score = p_score WHERE id = p_room_id;
    ELSIF p_player_id = v_p2 THEN
        UPDATE game_sessions SET player2_score = p_score WHERE id = p_room_id;
    ELSE
        -- Allow silent fail or raise exception. Exception is better for debugging.
        RAISE EXCEPTION 'Player ID % not found in room %', p_player_id, p_room_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: fix_stats_logic.sql
-- RESTORE CASUAL STATS & COUNTRY
-- 1. Ensure columns exist (Idempotent)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS country text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS casual_wins int DEFAULT 0,
ADD COLUMN IF NOT EXISTS casual_losses int DEFAULT 0;

-- 2. Update finish_game to handle BOTH Rank and Casual stats
CREATE OR REPLACE FUNCTION finish_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_session record;
    v_winner text;
    v_loser text;
    v_is_draw boolean := false;
    v_k_factor int := 32;
    v_p1_mmr int;
    v_p2_mmr int;
    v_p1_exp float;
    v_p2_exp float;
    v_new_p1_mmr int;
    v_new_p2_mmr int;
    
    v_p1_total int := 0;
    v_p2_total int := 0;
    v_round jsonb;
BEGIN
    SELECT * INTO v_session FROM game_sessions WHERE id = p_room_id;
    
    -- Status check (allow if 'playing' or if we want to re-run? Better strict)
    IF v_session.status = 'finished' THEN RETURN; END IF;

    -- Calculate Totals (Use round_scores)
    -- Reload round_scores just in case
    SELECT round_scores INTO v_session.round_scores FROM game_sessions WHERE id = p_room_id;

    FOR v_round IN SELECT * FROM jsonb_array_elements(v_session.round_scores)
    LOOP
        v_p1_total := v_p1_total + (v_round->>'p1_score')::int;
        v_p2_total := v_p2_total + (v_round->>'p2_score')::int;
    END LOOP;

    -- Determine Winner
    IF v_p1_total > v_p2_total THEN
        v_winner := v_session.player1_id;
        v_loser := v_session.player2_id;
    ELSIF v_p2_total > v_p1_total THEN
        v_winner := v_session.player2_id;
        v_loser := v_session.player1_id;
    ELSE
        v_is_draw := true;
    END IF;

    -- Update Session
    UPDATE game_sessions 
    SET status = 'finished', 
        winner_id = v_winner, 
        end_at = now(),
        player1_score = v_p1_total,
        player2_score = v_p2_total
    WHERE id = p_room_id;

    -- STATS UPDATE LOGIC
    IF v_winner IS NOT NULL AND NOT v_is_draw THEN
        IF v_session.mode = 'rank' THEN
             -- RANK MODE: Update MMR + Standard Wins/Losses
             -- Use ::text for comparison to avoid uuid = text error
             IF v_winner NOT LIKE 'guest_%' AND v_loser NOT LIKE 'guest_%' THEN
                 SELECT mmr INTO v_p1_mmr FROM profiles WHERE id = v_session.player1_id::uuid;
                 SELECT mmr INTO v_p2_mmr FROM profiles WHERE id = v_session.player2_id::uuid;
                 
                 v_p1_exp := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::numeric / 400.0));
                 v_p2_exp := 1.0 / (1.0 + power(10.0, (v_p1_mmr - v_p2_mmr)::numeric / 400.0));

                 -- v_winner is TEXT, v_session.player1_id might be UUID or TEXT depending on table def.
                 -- Safe to cast both to text for comparison.
                 IF v_winner = v_session.player1_id::text THEN
                    -- P1 Wins
                    v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (1 - v_p1_exp));
                    v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (0 - v_p2_exp));
                    
                    UPDATE profiles SET mmr = v_new_p1_mmr, wins = wins + 1 WHERE id = v_session.player1_id::uuid;
                    UPDATE profiles SET mmr = v_new_p2_mmr, losses = losses + 1 WHERE id = v_session.player2_id::uuid;
                 ELSE
                    -- P2 Wins
                    v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (0 - v_p1_exp));
                    v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (1 - v_p2_exp));
                    
                    UPDATE profiles SET mmr = v_new_p1_mmr, losses = losses + 1 WHERE id = v_session.player1_id::uuid;
                    UPDATE profiles SET mmr = v_new_p2_mmr, wins = wins + 1 WHERE id = v_session.player2_id::uuid;
                 END IF;
             END IF;
        ELSE 
             -- NORMAL / FRIENDLY MODE: Update Casual Wins/Losses (No MMR)
             -- Only for real users
             IF v_winner NOT LIKE 'guest_%' THEN
                 UPDATE profiles SET casual_wins = casual_wins + 1 WHERE id = v_winner::uuid;
             END IF;
             IF v_loser NOT LIKE 'guest_%' THEN
                 UPDATE profiles SET casual_losses = casual_losses + 1 WHERE id = v_loser::uuid;
             END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: add_slider_game.sql
-- Migration to add 'SLIDER' game type by updating constraint
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find checking constraints on the game_type column
    FOR r IN (
        SELECT con.conname
        FROM pg_catalog.pg_constraint con
        INNER JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
        INNER JOIN pg_catalog.pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
        WHERE rel.relname = 'game_sessions'
          AND att.attname = 'game_type'
          AND con.contype = 'c' -- 'c' for check constraint
    ) LOOP
        -- Dynamically drop the constraint
        EXECUTE 'ALTER TABLE game_sessions DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- Add the new inclusive constraint including SLIDER, SEQUENCE_NORMAL, NUMBER_DESC, UPDOWN, PAIR
ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_game_type_check 
CHECK (game_type IN ('RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR', 'UPDOWN', 'SEQUENCE_NORMAL', 'NUMBER_DESC', 'SLIDER'));

-- We also need to update the start_game function to include 'SLIDER' in the randomization pool
-- Update the v_all_types array in start_game function
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    v_all_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'PAIR', 'UPDOWN', 'SEQUENCE_NORMAL', 'NUMBER_DESC', 'SLIDER'];
    v_selected_types text[];
    v_first_type text;
BEGIN
    -- TEST MODE: Force SLIDER first, then 2 random games
    v_selected_types := ARRAY['SLIDER'];

    SELECT v_selected_types || ARRAY(
        SELECT x
        FROM unnest(v_all_types) AS x
        WHERE x != 'SLIDER'
        ORDER BY random()
        LIMIT 2
    ) INTO v_selected_types;

    -- Skip shuffling to ensure SLIDER is first
    -- SELECT ARRAY(
    --     SELECT x
    --     FROM unnest(v_selected_types) AS x
    --     ORDER BY random()
    -- ) INTO v_selected_types;

    v_first_type := v_selected_types[1];
    v_seed := md5(random()::text);

    UPDATE game_sessions
    SET status = 'playing',
        game_types = v_selected_types,
        current_round_index = 0,
        game_type = v_first_type,
        seed = v_seed,
        start_at = now() + interval '4 seconds',
        end_at = now() + interval '34 seconds',
        round_scores = '[]'::jsonb
    WHERE id = p_room_id AND status = 'waiting';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: add_arrow_game.sql
-- Migration to add 'ARROW' game type by updating constraint
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find checking constraints on the game_type column
    FOR r IN (
        SELECT con.conname
        FROM pg_catalog.pg_constraint con
        INNER JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
        INNER JOIN pg_catalog.pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
        WHERE rel.relname = 'game_sessions'
          AND att.attname = 'game_type'
          AND con.contype = 'c' -- 'c' for check constraint
    ) LOOP
        -- Dynamically drop the constraint
        EXECUTE 'ALTER TABLE game_sessions DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- Add the new inclusive constraint including ARROW
ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_game_type_check 
CHECK (game_type IN ('RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR', 'UPDOWN', 'SEQUENCE_NORMAL', 'NUMBER_DESC', 'SLIDER', 'ARROW'));

-- Update start_game function to include ARROW in the pool
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    v_all_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'PAIR', 'UPDOWN', 'SEQUENCE_NORMAL', 'NUMBER_DESC', 'SLIDER', 'ARROW'];
    v_selected_types text[];
    v_first_type text;
BEGIN
    -- TEST MODE: Force ARROW first, then 2 random games
    v_selected_types := ARRAY['ARROW'];

    SELECT v_selected_types || ARRAY(
        SELECT x
        FROM unnest(v_all_types) AS x
        WHERE x != 'ARROW'
        ORDER BY random()
        LIMIT 2
    ) INTO v_selected_types;

    v_first_type := v_selected_types[1];
    v_seed := md5(random()::text);

    UPDATE game_sessions
    SET status = 'playing',
        game_types = v_selected_types,
        current_round_index = 0,
        game_type = v_first_type,
        seed = v_seed,
        start_at = now() + interval '4 seconds',
        end_at = now() + interval '34 seconds',
        round_scores = '[]'::jsonb
    WHERE id = p_room_id AND status = 'waiting';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: restore_random_logic.sql
-- Restore random game selection logic
-- Removes the forced "Arrow/Slider First" test logic
-- Now selects 3 unique random games from the full pool

CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    v_all_types text[] := ARRAY[
        'RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 
        'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR', 
        'UPDOWN', 'SEQUENCE_NORMAL', 'NUMBER_DESC', 
        'SLIDER', 'ARROW'
    ];
    v_selected_types text[];
    v_first_type text;
BEGIN
    -- Select 3 unique random games
    SELECT ARRAY(
        SELECT x
        FROM unnest(v_all_types) AS x
        ORDER BY random()
        LIMIT 3
    ) INTO v_selected_types;

    v_first_type := v_selected_types[1];
    v_seed := md5(random()::text);

    UPDATE game_sessions
    SET status = 'playing',
        game_types = v_selected_types,
        current_round_index = 0,
        game_type = v_first_type,
        seed = v_seed,
        start_at = now() + interval '4 seconds',
        end_at = now() + interval '34 seconds',
        round_scores = '[]'::jsonb
    WHERE id = p_room_id AND status = 'waiting';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: social_features.sql
-- Social Features Schema (Friendships & Chat)

-- 1. Friendships Table
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  friend_id uuid references auth.users(id) not null,
  status text not null check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  -- Prevent duplicate friendship records (composite unique key)
  -- We'll enforce that user_id < friend_id for the unique constraint to treat (A, B) same as (B, A) 
  -- OR we can just allow two records (A->B, B->A). 
  -- For simplicity in querying "my friends", two records approach is often easier 
  -- but 'pending' state usually implies direction (Requester -> Target).
  -- Let's stick to: Record exists = Relationship exists.
  -- user_id is Requester, friend_id is Target.
  unique(user_id, friend_id)
);

-- 2. Chat Messages Table
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users(id) not null,
  receiver_id uuid references auth.users(id) not null,
  content text not null,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- 3. RLS Policies

-- Enable RLS
alter table public.friendships enable row level security;
alter table public.chat_messages enable row level security;

-- Friendships Policies
create policy "Users can view their own friendships"
  on public.friendships for select
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Users can insert friendship requests"
  on public.friendships for insert
  with check (auth.uid() = user_id);

create policy "Users can update their received requests or own friendships"
  on public.friendships for update
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- Chat Messages Policies
create policy "Users can view their own messages"
  on public.chat_messages for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can send messages"
  on public.chat_messages for insert
  with check (auth.uid() = sender_id);

create policy "Users can update (mark read) received messages"
  on public.chat_messages for update
  using (auth.uid() = receiver_id);

-- 4. Realtime
-- Enable Realtime for chat_messages to receive new messages instantly
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.friendships;

-- Migration: friend_delete_policy.sql
-- Allow users to delete their own friendships
create policy "Users can delete their own friendships"
  on public.friendships for delete
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- Migration: exclude_friendly_stats.sql
-- Exclude 'friendly' mode from updating stats (wins/losses/mmr)
-- Only 'rank' updates MMR/Wins/Losses
-- only 'normal' updates casual_wins/casual_losses

CREATE OR REPLACE FUNCTION finish_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_session record;
    v_winner text;
    v_loser text;
    v_is_draw boolean := false;
    v_k_factor int := 32;
    v_p1_mmr int;
    v_p2_mmr int;
    v_p1_exp float;
    v_p2_exp float;
    v_new_p1_mmr int;
    v_new_p2_mmr int;
    
    v_p1_total int := 0;
    v_p2_total int := 0;
    v_round jsonb;
BEGIN
    -- [SECURE] Caller Check
    IF NOT EXISTS (SELECT 1 FROM game_sessions WHERE id = p_room_id 
        AND (player1_id = auth.uid()::text OR player2_id = auth.uid()::text)) THEN
       RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT * INTO v_session FROM game_sessions WHERE id = p_room_id;
    
    -- Status check
    IF v_session.status = 'finished' THEN RETURN; END IF;

    -- Calculate Totals
    SELECT round_scores INTO v_session.round_scores FROM game_sessions WHERE id = p_room_id;

    FOR v_round IN SELECT * FROM jsonb_array_elements(v_session.round_scores)
    LOOP
        v_p1_total := v_p1_total + (v_round->>'p1_score')::int;
        v_p2_total := v_p2_total + (v_round->>'p2_score')::int;
    END LOOP;

    -- Determine Winner
    IF v_p1_total > v_p2_total THEN
        v_winner := v_session.player1_id;
        v_loser := v_session.player2_id;
    ELSIF v_p2_total > v_p1_total THEN
        v_winner := v_session.player2_id;
        v_loser := v_session.player1_id;
    ELSE
        v_is_draw := true;
    END IF;

    -- Update Session
    UPDATE game_sessions 
    SET status = 'finished', 
        winner_id = v_winner, 
        end_at = now(),
        player1_score = v_p1_total,
        player2_score = v_p2_total
    WHERE id = p_room_id;

    -- STATS UPDATE LOGIC
    IF v_winner IS NOT NULL AND NOT v_is_draw THEN
        IF v_session.mode = 'rank' THEN
             -- RANK MODE: Update MMR + Standard Wins/Losses
             IF v_winner NOT LIKE 'guest_%' AND v_loser NOT LIKE 'guest_%' THEN
                 SELECT mmr INTO v_p1_mmr FROM profiles WHERE id = v_session.player1_id::uuid;
                 SELECT mmr INTO v_p2_mmr FROM profiles WHERE id = v_session.player2_id::uuid;
                 
                 v_p1_exp := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::numeric / 400.0));
                 v_p2_exp := 1.0 / (1.0 + power(10.0, (v_p1_mmr - v_p2_mmr)::numeric / 400.0));

                 IF v_winner = v_session.player1_id::text THEN
                    v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (1 - v_p1_exp));
                    v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (0 - v_p2_exp));
                    
                    UPDATE profiles SET mmr = v_new_p1_mmr, wins = wins + 1 WHERE id = v_session.player1_id::uuid;
                    UPDATE profiles SET mmr = v_new_p2_mmr, losses = losses + 1 WHERE id = v_session.player2_id::uuid;
                 ELSE
                    v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (0 - v_p1_exp));
                    v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (1 - v_p2_exp));
                    
                    UPDATE profiles SET mmr = v_new_p1_mmr, losses = losses + 1 WHERE id = v_session.player1_id::uuid;
                    UPDATE profiles SET mmr = v_new_p2_mmr, wins = wins + 1 WHERE id = v_session.player2_id::uuid;
                 END IF;
             END IF;
        ELSIF v_session.mode = 'normal' THEN
             -- NORMAL MODE: Update Casual Wins/Losses (No MMR)
             -- Only for real users
             IF v_winner NOT LIKE 'guest_%' THEN
                 UPDATE profiles SET casual_wins = casual_wins + 1 WHERE id = v_winner::uuid;
             END IF;
             IF v_loser NOT LIKE 'guest_%' THEN
                 UPDATE profiles SET casual_losses = casual_losses + 1 WHERE id = v_loser::uuid;
             END IF;
        ELSE
            -- FRIENDLY or PRACTICE MODE: Do NOT update any stats
            -- Just finish the session (already done above)
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: practice_mode_rpc.sql
-- Practice Mode Logic (Solo)

-- 1. Create Practice Session RPC
CREATE OR REPLACE FUNCTION create_practice_session(p_player_id text, p_game_type text)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Insert session with mode='practice' and player2='practice_solo'
  -- Single round logic will be handled in start_next_round (First to 1?)
  INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode, game_type)
  VALUES (p_player_id, 'practice_solo', 'waiting', 0, 'practice', p_game_type)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 2. Update start_next_round
-- For Practice: Just start the chosen game type.
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
  v_mode text;
  v_types text[] := ARRAY['RPS', 'NUMBER_ASC', 'NUMBER_DESC', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
BEGIN
  -- Get current state
  SELECT game_type, status, current_round, player1_score, player2_score, mode
  INTO v_current_type, v_status, v_current_round, v_p1_score, v_p2_score, v_mode
  FROM game_sessions WHERE id = p_room_id;

  -- PRACTICE MODE: Single Round Limit
  IF v_mode = 'practice' AND v_current_round >= 1 THEN
      -- Already played 1 round? End it.
      UPDATE game_sessions SET status = 'finished', end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  -- 0. Check Victory Condition (Standard)
  IF v_p1_score >= 3 or v_p2_score >= 3 THEN
      UPDATE game_sessions SET status = 'finished', end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  -- 1. Pick Game Type
  IF v_mode = 'practice' THEN
      v_next_type := v_current_type; -- Keep same game type (as set in create)
  ELSE
      v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
  END IF;
  
  -- 2. Setup Game Data
  IF v_next_type = 'RPS' THEN
      v_target := v_opts[floor(random()*3 + 1)];
      v_game_data := '{}';
  ELSE
      v_target := null;
      v_game_data := jsonb_build_object('seed', floor(random()*10000));
  END IF;

  -- 3. Calculate Next Round
  IF v_status = 'waiting' THEN
      v_next_round := 1;
  ELSE
      v_next_round := v_current_round + 1;
  END IF;

  -- 4. Update Session -> COUNTDOWN State (3 Seconds)
  UPDATE game_sessions
  SET status = 'countdown',
      current_round = v_next_round,
      game_type = v_next_type,
      game_data = v_game_data,
      target_move = v_target,
      phase_start_at = now(),
      phase_end_at = now() + interval '3 seconds'
  WHERE id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 3. Update submit_move (Solo Logic)
CREATE OR REPLACE FUNCTION submit_move(p_room_id uuid, p_player_id text, p_move text)
RETURNS void AS $$
DECLARE
  v_game_type text;
  v_round int;
  v_target text;
  v_mode text;
  
  -- Solo vars
  v_p1_move text;
  
  v_opts text[] := ARRAY['rock','paper','scissors'];
BEGIN
  -- Get current context
  SELECT game_type, current_round, target_move, mode
  INTO v_game_type, v_round, v_target, v_mode
  FROM game_sessions WHERE id = p_room_id;

  -- 1. Log the move
  INSERT INTO game_moves (room_id, player_id, round, move)
  VALUES (p_room_id, p_player_id, v_round, p_move);
  
  -- PRACTICE SOLO LOGIC
  IF v_mode = 'practice' THEN
      -- If RPS, we still need target matching logic
      IF v_game_type = 'RPS' THEN
          DECLARE
              v_win_move text;
          BEGIN
              IF v_target = 'rock' THEN v_win_move := 'paper';
              ELSIF v_target = 'paper' THEN v_win_move := 'scissors';
              ELSE v_win_move := 'rock';
              END IF;

              IF p_move = v_win_move THEN
                 -- Player Won (Solved)
                 UPDATE game_sessions 
                 SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
                 WHERE id = p_room_id;
              ELSE
                 -- Wrong move? In practice, maybe allow retry or fail?
                 -- Standard RPS logic: wrong move = nothing happens or lost?
                 -- In 'race' games, wrong move isn't usually sent.
                 -- In RPS, 'p_move' is the choice.
                 -- If wrong choice, instant Loss? Or Draw?
                 -- Let's say: Practice RPS is "Win only". If lose, just finish with 0 score.
                 UPDATE game_sessions 
                 SET status = 'finished', end_at = now()
                 WHERE id = p_room_id AND status = 'playing';
              END IF;
          END;
          RETURN;

      ELSE
          -- NUMBER / PUZZLE GAMES (Solo)
          -- Move is "DONE:<time>"
          IF p_move LIKE 'DONE:%' THEN
              -- Extract Score/Time?
              -- For Solo, we just finish the game immediately.
              UPDATE game_sessions 
              SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
              WHERE id = p_room_id;
              
              RETURN;
          END IF;
      END IF;
  END IF;

  -- STANDARD MULTIPLAYER LOGIC (Existing code for non-practice)
  -- (We need to keep this for Normal/Rank modes)
  
  -- 2. Evaluate Logic based on Game Type (Standard Logic)
  DECLARE
      v_p1 text;
      v_p2 text;
      v_p1_move_standard text;
      v_p2_move_standard text;
      v_p1_time int;
      v_p2_time int;
  BEGIN
      SELECT player1_id, player2_id INTO v_p1, v_p2 FROM game_sessions WHERE id = p_room_id;

      -- Use separate vars to avoid confusion with solo logic
      
      -- === RPS Logic ===
      IF v_game_type = 'RPS' THEN
          DECLARE
              v_win_move_std text;
          BEGIN
              IF v_target = 'rock' THEN v_win_move_std := 'paper';
              ELSIF v_target = 'paper' THEN v_win_move_std := 'scissors';
              ELSE v_win_move_std := 'rock';
              END IF;

              IF p_move = v_win_move_std THEN
                 IF p_player_id = v_p1 THEN
                    UPDATE game_sessions 
                    SET player1_score = player1_score + 1, status = 'round_end', phase_end_at = now() 
                    WHERE id = p_room_id AND status = 'playing';
                 ELSE
                    UPDATE game_sessions 
                    SET player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() 
                    WHERE id = p_room_id AND status = 'playing';
                 END IF;
              END IF;
          END;

      -- === NUMBER/PUZZLE Logic (Race) ===
      ELSIF v_game_type LIKE 'NUMBER%' OR v_game_type IN ('MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW') THEN
          
          SELECT move INTO v_p1_move_standard FROM game_moves WHERE room_id = p_room_id AND round = v_round AND player_id = v_p1 AND move LIKE 'DONE:%' LIMIT 1;
          SELECT move INTO v_p2_move_standard FROM game_moves WHERE room_id = p_room_id AND round = v_round AND player_id = v_p2 AND move LIKE 'DONE:%' LIMIT 1;

          IF v_p1_move_standard IS NOT NULL AND v_p2_move_standard IS NOT NULL THEN
              v_p1_time := cast(split_part(v_p1_move_standard, ':', 2) AS int);
              v_p2_time := cast(split_part(v_p2_move_standard, ':', 2) AS int);

              IF v_p1_time < v_p2_time THEN
                 UPDATE game_sessions SET player1_score = player1_score + 3, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
              ELSIF v_p2_time < v_p1_time THEN
                 UPDATE game_sessions SET player2_score = player2_score + 3, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
              ELSE
                 UPDATE game_sessions SET player1_score = player1_score + 1, player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
              END IF;
           ELSE
              UPDATE game_sessions SET phase_end_at = now() + interval '500 milliseconds' WHERE id = p_room_id;
          END IF;
      END IF;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: fix_start_game_practice.sql
-- Fix start_game to respect Practice Mode (Single Game, No Randomization)
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    v_mode text;
    v_current_type text;
    v_all_types text[] := ARRAY[
        'RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 
        'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR', 
        'UPDOWN', 'SEQUENCE_NORMAL', 'NUMBER_DESC', 
        'SLIDER', 'ARROW'
    ];
    v_selected_types text[];
    v_first_type text;
BEGIN
    -- Check Mode first
    SELECT mode, game_type INTO v_mode, v_current_type FROM game_sessions WHERE id = p_room_id;

    v_seed := md5(random()::text);

    IF v_mode = 'practice' THEN
        UPDATE game_sessions
        SET status = 'playing',
            game_types = ARRAY[v_current_type], -- Just one game
            current_round_index = 0,
            current_round = 1, -- Fix: Explicitly set to Round 1
            seed = v_seed,
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '34 seconds', -- 30s game + 4s delay
            round_scores = '[]'::jsonb
        WHERE id = p_room_id;
    ELSE
        -- NORMAL / RANK / FRIENDLY: Select 3 unique random games
        SELECT ARRAY(
            SELECT x
            FROM unnest(v_all_types) AS x
            ORDER BY random()
            LIMIT 3
        ) INTO v_selected_types;

        v_first_type := v_selected_types[1];

        UPDATE game_sessions
        SET status = 'playing',
            game_types = v_selected_types,
            current_round_index = 0,
            current_round = 1, -- Fix: Explicitly set to Round 1
            game_type = v_first_type,
            seed = v_seed,
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '34 seconds',
            round_scores = '[]'::jsonb
        WHERE id = p_room_id AND status = 'waiting';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: force_practice_logic_final.sql
-- FORCE OVERWRITE of all Game Logic to ensure Practice Mode works
-- combine all logic into one consistent set of functions.

-- 1. Create Practice Session
CREATE OR REPLACE FUNCTION create_practice_session(p_player_id text, p_game_type text)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Insert with mode='practice'
  INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode, game_type)
  VALUES (p_player_id, 'practice_solo', 'waiting', 0, 'practice', p_game_type)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 2. Start Game (Updated with Current Round = 1)
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    v_mode text;
    v_current_type text;
    v_all_types text[] := ARRAY[
        'RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 
        'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR', 
        'UPDOWN', 'SEQUENCE_NORMAL', 'NUMBER_DESC', 
        'SLIDER', 'ARROW'
    ];
    v_selected_types text[];
    v_first_type text;
BEGIN
    SELECT mode, game_type INTO v_mode, v_current_type FROM game_sessions WHERE id = p_room_id;
    v_seed := md5(random()::text);

    IF v_mode = 'practice' THEN
        -- PRACTICE: Start immediately, Round 1 (will finish after this round)
        UPDATE game_sessions
        SET status = 'playing',
            game_types = ARRAY[v_current_type], 
            current_round_index = 0,
            current_round = 1, -- Explicitly set to 1
            seed = v_seed,
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '34 seconds',
            round_scores = '[]'::jsonb
        WHERE id = p_room_id;
    ELSE
        -- NORMAL/RANK: Random 3 games
        SELECT ARRAY(
            SELECT x
            FROM unnest(v_all_types) AS x
            ORDER BY random()
            LIMIT 3
        ) INTO v_selected_types;

        v_first_type := v_selected_types[1];

        UPDATE game_sessions
        SET status = 'playing',
            game_types = v_selected_types,
            current_round_index = 0,
            current_round = 1,
            game_type = v_first_type,
            seed = v_seed,
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '34 seconds',
            round_scores = '[]'::jsonb
        WHERE id = p_room_id AND status = 'waiting';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 3. Start Next Round (The CRITICAL Fix)
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
  v_mode text;
  v_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
BEGIN
  -- Get current state
  SELECT game_type, status, current_round, player1_score, player2_score, mode
  INTO v_current_type, v_status, v_current_round, v_p1_score, v_p2_score, v_mode
  FROM game_sessions WHERE id = p_room_id;

  -- CRITICAL: Check Practice Mode Termination
  IF v_mode = 'practice' THEN
      -- In Practice, if we are in Round 1 (or more), we FINISH immediately.
      -- We do NOT start a next round.
      UPDATE game_sessions SET status = 'finished', end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  -- Normal Victory Check
  IF v_p1_score >= 3 or v_p2_score >= 3 THEN
      UPDATE game_sessions SET status = 'finished', end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  -- Pick Next Game Type (Random for normal)
  v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
  
  -- Setup Game Data
  IF v_next_type = 'RPS' THEN
      v_target := v_opts[floor(random()*3 + 1)];
      v_game_data := '{}';
  ELSE
      v_target := null;
      v_game_data := jsonb_build_object('seed', floor(random()*10000));
  END IF;

  -- Increment Round
  v_next_round := v_current_round + 1;

  -- Update Session
  UPDATE game_sessions
  SET status = 'countdown',
      current_round = v_next_round,
      game_type = v_next_type,
      game_data = v_game_data,
      target_move = v_target,
      phase_start_at = now(),
      phase_end_at = now() + interval '3 seconds'
  WHERE id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 3.5. Next Round (Practice Guard for 3-Game Set Logic)
-- NOTE: The client calls next_round (not start_next_round), so we must guard practice here.
CREATE OR REPLACE FUNCTION next_round(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_session record;
    v_new_type text;
    v_new_index int;
    v_seed text;
    v_round_record jsonb;
BEGIN
    SELECT * INTO v_session FROM game_sessions WHERE id = p_room_id FOR UPDATE;

    -- Practice Mode: finish immediately after Round 1 (or on timeout)
    IF v_session.mode = 'practice' THEN
        UPDATE game_sessions
        SET status = 'finished',
            end_at = now()
        WHERE id = p_room_id;
        RETURN;
    END IF;

    -- Safety check
    IF v_session.status = 'finished' THEN RETURN; END IF;

    -- Record scores from the JUST FINISHED round
    v_round_record := jsonb_build_object(
        'round', v_session.current_round_index + 1,
        'p1_score', v_session.player1_score,
        'p2_score', v_session.player2_score,
        'game_type', v_session.game_type
    );

    UPDATE game_sessions 
    SET round_scores = round_scores || v_round_record,
        player1_score = 0,
        player2_score = 0
    WHERE id = p_room_id;

    -- Check if we have more rounds
    IF v_session.current_round_index < 2 THEN
        v_new_index := v_session.current_round_index + 1;
        v_new_type := v_session.game_types[v_new_index + 1];
        v_seed := md5(random()::text);

        UPDATE game_sessions
        SET current_round_index = v_new_index,
            game_type = v_new_type,
            seed = v_seed,
            start_at = now() + interval '6 seconds',
            end_at = now() + interval '36 seconds'
        WHERE id = p_room_id;
    ELSE
        PERFORM finish_game(p_room_id);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 4. Submit Move (Practice Logic)
CREATE OR REPLACE FUNCTION submit_move(p_room_id uuid, p_player_id text, p_move text)
RETURNS void AS $$
DECLARE
  v_game_type text;
  v_round int;
  v_target text;
  v_mode text;
  v_opts text[] := ARRAY['rock','paper','scissors'];
  -- Standard vars
  v_p1 text;
  v_p2 text;
  v_p1_move_standard text;
  v_p2_move_standard text;
  v_p1_time int;
  v_p2_time int;
BEGIN
  SELECT game_type, current_round, target_move, mode
  INTO v_game_type, v_round, v_target, v_mode
  FROM game_sessions WHERE id = p_room_id;

  INSERT INTO game_moves (room_id, player_id, round, move)
  VALUES (p_room_id, p_player_id, v_round, p_move);
  
  -- PRACTICE LOGIC
  IF v_mode = 'practice' THEN
      -- Immediate Finish on Success
      IF v_game_type = 'RPS' THEN
          DECLARE
              v_win_move text;
          BEGIN
              IF v_target = 'rock' THEN v_win_move := 'paper';
              ELSIF v_target = 'paper' THEN v_win_move := 'scissors';
              ELSE v_win_move := 'rock';
              END IF;

              IF p_move = v_win_move THEN
                 -- WIN: Finish immediately
                 UPDATE game_sessions 
                 SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
                 WHERE id = p_room_id;
              ELSE
                 -- LOSE: Finish immediately (or retry? decided on finish)
                 UPDATE game_sessions 
                 SET status = 'finished', end_at = now() 
                 WHERE id = p_room_id;
              END IF;
          END;
          RETURN;
      ELSE
          -- Time Attack Games: "DONE:xxx"
          IF p_move LIKE 'DONE:%' THEN
              UPDATE game_sessions 
              SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
              WHERE id = p_room_id;
              RETURN;
          END IF;
      END IF;
      RETURN;
  END IF;

  -- STANDARD LOGIC (For Normal/Rank)
  SELECT player1_id, player2_id INTO v_p1, v_p2 FROM game_sessions WHERE id = p_room_id;

  IF v_game_type = 'RPS' THEN
      DECLARE
          v_win_move_std text;
      BEGIN
          IF v_target = 'rock' THEN v_win_move_std := 'paper';
          ELSIF v_target = 'paper' THEN v_win_move_std := 'scissors';
          ELSE v_win_move_std := 'rock';
          END IF;

          IF p_move = v_win_move_std THEN
             IF p_player_id = v_p1 THEN
                UPDATE game_sessions SET player1_score = player1_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
             ELSE
                UPDATE game_sessions SET player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
             END IF;
          END IF;
      END;
  ELSIF v_game_type LIKE 'NUMBER%' OR v_game_type IN ('MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW') THEN
      SELECT move INTO v_p1_move_standard FROM game_moves WHERE room_id = p_room_id AND round = v_round AND player_id = v_p1 AND move LIKE 'DONE:%' LIMIT 1;
      SELECT move INTO v_p2_move_standard FROM game_moves WHERE room_id = p_room_id AND round = v_round AND player_id = v_p2 AND move LIKE 'DONE:%' LIMIT 1;

      IF v_p1_move_standard IS NOT NULL AND v_p2_move_standard IS NOT NULL THEN
          v_p1_time := cast(split_part(v_p1_move_standard, ':', 2) AS int);
          v_p2_time := cast(split_part(v_p2_move_standard, ':', 2) AS int);
          IF v_p1_time < v_p2_time THEN
             UPDATE game_sessions SET player1_score = player1_score + 3, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          ELSIF v_p2_time < v_p1_time THEN
             UPDATE game_sessions SET player2_score = player2_score + 3, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          ELSE
             UPDATE game_sessions SET player1_score = player1_score + 1, player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          END IF;
       ELSE
          UPDATE game_sessions SET phase_end_at = now() + interval '500 milliseconds' WHERE id = p_room_id;
      END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: add_last_seen.sql
-- Add last_seen column to profiles table
ALTER TABLE profiles ADD COLUMN last_seen TIMESTAMPTZ DEFAULT NOW();

-- Create a function to update the last_seen timestamp
CREATE OR REPLACE FUNCTION update_last_seen()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if the user initiated the change (e.g., via a heartbeat call)
  -- or we could blindly update it on any profile change, but a specific RPC is better.
  NEW.last_seen = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Actually, a simpler approach is to exposing an RPC to update it
-- or just update it directly from the client when the user interacts.
-- Let's stick to client-side update for "heartbeat" or on-load.
-- So we just need the column and RLS.

-- Allow users to update their own last_seen
CREATE POLICY "Users can update their own last_seen"
ON profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Migration: match_history_rpc.sql
-- Drop valid function if it exists to ensure clean state
DROP FUNCTION IF EXISTS get_player_match_history(UUID, TEXT, INT, INT);

-- Recreate Function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION get_player_match_history(
    p_user_id UUID,
    p_mode TEXT DEFAULT 'all',  -- 'all', 'rank', 'normal', 'friendly'
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    session_id UUID,
    game_mode TEXT,
    created_at TIMESTAMPTZ,
    result TEXT, -- 'WIN', 'LOSE', 'DRAW'
    opponent_id TEXT, -- Changed to TEXT to support guest IDs
    opponent_nickname TEXT,
    opponent_avatar_url TEXT,
    opponent_country TEXT,
    is_friend BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        gs.id AS session_id,
        gs.mode AS game_mode,
        gs.created_at,
        CASE
            WHEN gs.winner_id::text = p_user_id::text THEN 'WIN'
            WHEN gs.winner_id IS NULL AND gs.status IN ('completed', 'finished') THEN 'DRAW'
            ELSE 'LOSE'
        END AS result,
        -- Determine opponent ID
        (CASE
            WHEN gs.player1_id::text = p_user_id::text THEN gs.player2_id::text
            ELSE gs.player1_id::text
        END) AS opponent_id,
        p.nickname AS opponent_nickname,
        p.avatar_url AS opponent_avatar_url,
        p.country AS opponent_country,
        -- Check both directions of friendship
        (EXISTS (
            SELECT 1 FROM friendships f
            WHERE (f.user_id = p_user_id AND f.friend_id::text = (CASE WHEN gs.player1_id::text = p_user_id::text THEN gs.player2_id::text ELSE gs.player1_id::text END))
               OR (f.user_id::text = (CASE WHEN gs.player1_id::text = p_user_id::text THEN gs.player2_id::text ELSE gs.player1_id::text END) AND f.friend_id = p_user_id)
            AND f.status = 'accepted'
        )) AS is_friend
    FROM
        game_sessions gs
    LEFT JOIN
        profiles p ON p.id::text = (CASE WHEN gs.player1_id::text = p_user_id::text THEN gs.player2_id::text ELSE gs.player1_id::text END)
    WHERE
        (gs.player1_id::text = p_user_id::text OR gs.player2_id::text = p_user_id::text)
        AND gs.status IN ('finished', 'forfeited', 'completed') -- Only finished games
        AND gs.mode NOT ILIKE '%practice%' -- Exclude practice mode
        AND (p_mode = 'all' OR gs.mode = p_mode)
    ORDER BY
        gs.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant permissions explicitly
GRANT EXECUTE ON FUNCTION get_player_match_history TO authenticated;
GRANT EXECUTE ON FUNCTION get_player_match_history TO service_role;
GRANT EXECUTE ON FUNCTION get_player_match_history TO anon;

-- Force schema cache reload
NOTIFY pgrst, 'reload schema';

-- Migration: add_fill_blanks_game_v2.sql
-- Add FILL BLANKS game to the game rotation
-- Updating start_game and start_next_round functions

-- 1. Update Start Game
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    v_mode text;
    v_current_type text;
    v_all_types text[] := ARRAY[
        'RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 
        'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR', 
        'UPDOWN', 'SEQUENCE_NORMAL', 'NUMBER_DESC', 
        'SLIDER', 'ARROW', 'BLANK'
    ];
    v_selected_types text[];
    v_first_type text;
BEGIN
    SELECT mode, game_type INTO v_mode, v_current_type FROM game_sessions WHERE id = p_room_id;
    v_seed := md5(random()::text);

    IF v_mode = 'practice' THEN
        -- PRACTICE: Start immediately, Round 1 (will finish after this round)
        UPDATE game_sessions
        SET status = 'playing',
            game_types = ARRAY[v_current_type], 
            current_round_index = 0,
            current_round = 1, -- Explicitly set to 1
            seed = v_seed,
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '34 seconds',
            round_scores = '[]'::jsonb
        WHERE id = p_room_id;
    ELSE
        -- NORMAL/RANK: Random 3 games
        SELECT ARRAY(
            SELECT x
            FROM unnest(v_all_types) AS x
            ORDER BY random()
            LIMIT 3
        ) INTO v_selected_types;

        v_first_type := v_selected_types[1];

        UPDATE game_sessions
        SET status = 'playing',
            game_types = v_selected_types,
            current_round_index = 0,
            current_round = 1,
            game_type = v_first_type,
            seed = v_seed,
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '34 seconds',
            round_scores = '[]'::jsonb
        WHERE id = p_room_id AND status = 'waiting';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 2. Update Start Next Round
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
  v_mode text;
  -- Added 'BLANK' here
  v_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW', 'BLANK'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
BEGIN
  -- Get current state
  SELECT game_type, status, current_round, player1_score, player2_score, mode
  INTO v_current_type, v_status, v_current_round, v_p1_score, v_p2_score, v_mode
  FROM game_sessions WHERE id = p_room_id;

  -- CRITICAL: Check Practice Mode Termination
  IF v_mode = 'practice' THEN
      -- In Practice, if we are in Round 1 (or more), we FINISH immediately.
      -- We do NOT start a next round.
      UPDATE game_sessions SET status = 'finished', end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  -- Normal Victory Check
  IF v_p1_score >= 3 or v_p2_score >= 3 THEN
      UPDATE game_sessions SET status = 'finished', end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  -- Pick Next Game Type (Random for normal)
  v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
  
  -- Setup Game Data
  IF v_next_type = 'RPS' THEN
      v_target := v_opts[floor(random()*3 + 1)];
      v_game_data := '{}';
  ELSE
      v_target := null;
      v_game_data := jsonb_build_object('seed', floor(random()*10000));
  END IF;

  -- Increment Round
  v_next_round := v_current_round + 1;

  -- Update Session
  UPDATE game_sessions
  SET status = 'countdown',
      current_round = v_next_round,
      game_type = v_next_type,
      game_data = v_game_data,
      target_move = v_target,
      phase_start_at = now(),
      phase_end_at = now() + interval '3 seconds'
  WHERE id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Update Submit Move (to prevent errors if BLANK somehow calls it, though it shouldn't)
CREATE OR REPLACE FUNCTION submit_move(p_room_id uuid, p_player_id text, p_move text)
RETURNS void AS $$
DECLARE
  v_game_type text;
  v_round int;
  v_target text;
  v_mode text;
  v_opts text[] := ARRAY['rock','paper','scissors'];
  -- Standard vars
  v_p1 text;
  v_p2 text;
  v_p1_move_standard text;
  v_p2_move_standard text;
  v_p1_time int;
  v_p2_time int;
BEGIN
  SELECT game_type, current_round, target_move, mode
  INTO v_game_type, v_round, v_target, v_mode
  FROM game_sessions WHERE id = p_room_id;

  INSERT INTO game_moves (room_id, player_id, round, move)
  VALUES (p_room_id, p_player_id, v_round, p_move);
  
  -- PRACTICE LOGIC
  IF v_mode = 'practice' THEN
      -- Immediate Finish on Success
      IF v_game_type = 'RPS' THEN
          DECLARE
              v_win_move text;
          BEGIN
              IF v_target = 'rock' THEN v_win_move := 'paper';
              ELSIF v_target = 'paper' THEN v_win_move := 'scissors';
              ELSE v_win_move := 'rock';
              END IF;

              IF p_move = v_win_move THEN
                 -- WIN: Finish immediately
                 UPDATE game_sessions 
                 SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
                 WHERE id = p_room_id;
              ELSE
                 -- LOSE: Finish immediately (or retry? decided on finish)
                 UPDATE game_sessions 
                 SET status = 'finished', end_at = now() 
                 WHERE id = p_room_id;
              END IF;
          END;
          RETURN;
      ELSE
          -- Time Attack Games: "DONE:xxx"
          IF p_move LIKE 'DONE:%' THEN
              UPDATE game_sessions 
              SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
              WHERE id = p_room_id;
              RETURN;
          END IF;
      END IF;
      RETURN;
  END IF;

  -- STANDARD LOGIC (For Normal/Rank)
  SELECT player1_id, player2_id INTO v_p1, v_p2 FROM game_sessions WHERE id = p_room_id;

  IF v_game_type = 'RPS' THEN
      DECLARE
          v_win_move_std text;
      BEGIN
          IF v_target = 'rock' THEN v_win_move_std := 'paper';
          ELSIF v_target = 'paper' THEN v_win_move_std := 'scissors';
          ELSE v_win_move_std := 'rock';
          END IF;

          IF p_move = v_win_move_std THEN
             IF p_player_id = v_p1 THEN
                UPDATE game_sessions SET player1_score = player1_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
             ELSE
                UPDATE game_sessions SET player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
             END IF;
          END IF;
      END;
  -- Added BLANK to the list
  ELSIF v_game_type LIKE 'NUMBER%' OR v_game_type IN ('MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW', 'BLANK') THEN
      SELECT move INTO v_p1_move_standard FROM game_moves WHERE room_id = p_room_id AND round = v_round AND player_id = v_p1 AND move LIKE 'DONE:%' LIMIT 1;
      SELECT move INTO v_p2_move_standard FROM game_moves WHERE room_id = p_room_id AND round = v_round AND player_id = v_p2 AND move LIKE 'DONE:%' LIMIT 1;

      IF v_p1_move_standard IS NOT NULL AND v_p2_move_standard IS NOT NULL THEN
          v_p1_time := cast(split_part(v_p1_move_standard, ':', 2) AS int);
          v_p2_time := cast(split_part(v_p2_move_standard, ':', 2) AS int);
          IF v_p1_time < v_p2_time THEN
             UPDATE game_sessions SET player1_score = player1_score + 3, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          ELSIF v_p2_time < v_p1_time THEN
             UPDATE game_sessions SET player2_score = player2_score + 3, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          ELSE
             UPDATE game_sessions SET player1_score = player1_score + 1, player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          END IF;
       ELSE
          UPDATE game_sessions SET phase_end_at = now() + interval '500 milliseconds' WHERE id = p_room_id;
      END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: update_game_type_constraint.sql
-- Remove the old constraint that restricts game_type values
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;

-- Add the new constraint with 'BLANK' included
ALTER TABLE game_sessions 
ADD CONSTRAINT game_sessions_game_type_check 
CHECK (game_type IN (
    'RPS', 
    'NUMBER', 
    'MATH', 
    'TEN', 
    'COLOR', 
    'MEMORY', 
    'SEQUENCE', 
    'SEQUENCE_NORMAL', 
    'LARGEST', 
    'PAIR', 
    'UPDOWN', 
    'SLIDER', 
    'ARROW', 
    'NUMBER_DESC',
    'BLANK'  -- Added new game type
));

-- Migration: add_find_operator_game.sql
-- Add FIND OPERATOR game to the game rotation
-- Updating start_game and start_next_round functions and constraints

-- 1. Update Game Type Constraint
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;

ALTER TABLE game_sessions 
ADD CONSTRAINT game_sessions_game_type_check 
CHECK (game_type IN (
    'RPS', 
    'NUMBER', 
    'MATH', 
    'TEN', 
    'COLOR', 
    'MEMORY', 
    'SEQUENCE', 
    'SEQUENCE_NORMAL', 
    'LARGEST', 
    'PAIR', 
    'UPDOWN', 
    'SLIDER', 
    'ARROW', 
    'NUMBER_DESC',
    'BLANK',
    'OPERATOR'  -- Added OPERATOR
));

-- 2. Update Start Game
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    v_mode text;
    v_current_type text;
    v_all_types text[] := ARRAY[
        'RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 
        'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR', 
        'UPDOWN', 'SEQUENCE_NORMAL', 'NUMBER_DESC', 
        'SLIDER', 'ARROW', 'BLANK', 'OPERATOR'
    ];
    v_selected_types text[];
    v_first_type text;
BEGIN
    SELECT mode, game_type INTO v_mode, v_current_type FROM game_sessions WHERE id = p_room_id;
    v_seed := md5(random()::text);

    IF v_mode = 'practice' THEN
        -- PRACTICE: Start immediately, Round 1 (will finish after this round)
        UPDATE game_sessions
        SET status = 'playing',
            game_types = ARRAY[v_current_type], 
            current_round_index = 0,
            current_round = 1, -- Explicitly set to 1
            seed = v_seed,
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '34 seconds',
            round_scores = '[]'::jsonb
        WHERE id = p_room_id;
    ELSE
        -- NORMAL/RANK: Random 3 games
        SELECT ARRAY(
            SELECT x
            FROM unnest(v_all_types) AS x
            ORDER BY random()
            LIMIT 3
        ) INTO v_selected_types;

        v_first_type := v_selected_types[1];

        UPDATE game_sessions
        SET status = 'playing',
            game_types = v_selected_types,
            current_round_index = 0,
            current_round = 1,
            game_type = v_first_type,
            seed = v_seed,
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '34 seconds',
            round_scores = '[]'::jsonb
        WHERE id = p_room_id AND status = 'waiting';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 3. Update Start Next Round
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
  v_mode text;
  -- Added 'OPERATOR' here
  v_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW', 'BLANK', 'OPERATOR'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
BEGIN
  -- Get current state
  SELECT game_type, status, current_round, player1_score, player2_score, mode
  INTO v_current_type, v_status, v_current_round, v_p1_score, v_p2_score, v_mode
  FROM game_sessions WHERE id = p_room_id;

  -- CRITICAL: Check Practice Mode Termination
  IF v_mode = 'practice' THEN
      -- In Practice, if we are in Round 1 (or more), we FINISH immediately.
      -- We do NOT start a next round.
      UPDATE game_sessions SET status = 'finished', end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  -- Normal Victory Check
  IF v_p1_score >= 3 or v_p2_score >= 3 THEN
      UPDATE game_sessions SET status = 'finished', end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  -- Pick Next Game Type (Random for normal)
  v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
  
  -- Setup Game Data
  IF v_next_type = 'RPS' THEN
      v_target := v_opts[floor(random()*3 + 1)];
      v_game_data := '{}';
  ELSE
      v_target := null;
      v_game_data := jsonb_build_object('seed', floor(random()*10000));
  END IF;

  -- Increment Round
  v_next_round := v_current_round + 1;

  -- Update Session
  UPDATE game_sessions
  SET status = 'countdown',
      current_round = v_next_round,
      game_type = v_next_type,
      game_data = v_game_data,
      target_move = v_target,
      phase_start_at = now(),
      phase_end_at = now() + interval '3 seconds'
  WHERE id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Update Submit Move (to prevent errors)
CREATE OR REPLACE FUNCTION submit_move(p_room_id uuid, p_player_id text, p_move text)
RETURNS void AS $$
DECLARE
  v_game_type text;
  v_round int;
  v_target text;
  v_mode text;
  v_opts text[] := ARRAY['rock','paper','scissors'];
  -- Standard vars
  v_p1 text;
  v_p2 text;
  v_p1_move_standard text;
  v_p2_move_standard text;
  v_p1_time int;
  v_p2_time int;
BEGIN
  SELECT game_type, current_round, target_move, mode
  INTO v_game_type, v_round, v_target, v_mode
  FROM game_sessions WHERE id = p_room_id;

  INSERT INTO game_moves (room_id, player_id, round, move)
  VALUES (p_room_id, p_player_id, v_round, p_move);
  
  -- PRACTICE LOGIC
  IF v_mode = 'practice' THEN
      -- Immediate Finish on Success
      IF v_game_type = 'RPS' THEN
          DECLARE
              v_win_move text;
          BEGIN
              IF v_target = 'rock' THEN v_win_move := 'paper';
              ELSIF v_target = 'paper' THEN v_win_move := 'scissors';
              ELSE v_win_move := 'rock';
              END IF;

              IF p_move = v_win_move THEN
                 -- WIN: Finish immediately
                 UPDATE game_sessions 
                 SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
                 WHERE id = p_room_id;
              ELSE
                 -- LOSE: Finish immediately (or retry? decided on finish)
                 UPDATE game_sessions 
                 SET status = 'finished', end_at = now() 
                 WHERE id = p_room_id;
              END IF;
          END;
          RETURN;
      ELSE
          -- Time Attack Games: "DONE:xxx"
          IF p_move LIKE 'DONE:%' THEN
              UPDATE game_sessions 
              SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
              WHERE id = p_room_id;
              RETURN;
          END IF;
      END IF;
      RETURN;
  END IF;

  -- STANDARD LOGIC (For Normal/Rank)
  SELECT player1_id, player2_id INTO v_p1, v_p2 FROM game_sessions WHERE id = p_room_id;

  IF v_game_type = 'RPS' THEN
      DECLARE
          v_win_move_std text;
      BEGIN
          IF v_target = 'rock' THEN v_win_move_std := 'paper';
          ELSIF v_target = 'paper' THEN v_win_move_std := 'scissors';
          ELSE v_win_move_std := 'rock';
          END IF;

          IF p_move = v_win_move_std THEN
             IF p_player_id = v_p1 THEN
                UPDATE game_sessions SET player1_score = player1_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
             ELSE
                UPDATE game_sessions SET player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
             END IF;
          END IF;
      END;
  -- Added OPERATOR to the list
  ELSIF v_game_type LIKE 'NUMBER%' OR v_game_type IN ('MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW', 'BLANK', 'OPERATOR') THEN
      SELECT move INTO v_p1_move_standard FROM game_moves WHERE room_id = p_room_id AND round = v_round AND player_id = v_p1 AND move LIKE 'DONE:%' LIMIT 1;
      SELECT move INTO v_p2_move_standard FROM game_moves WHERE room_id = p_room_id AND round = v_round AND player_id = v_p2 AND move LIKE 'DONE:%' LIMIT 1;

      IF v_p1_move_standard IS NOT NULL AND v_p2_move_standard IS NOT NULL THEN
          v_p1_time := cast(split_part(v_p1_move_standard, ':', 2) AS int);
          v_p2_time := cast(split_part(v_p2_move_standard, ':', 2) AS int);
          IF v_p1_time < v_p2_time THEN
             UPDATE game_sessions SET player1_score = player1_score + 3, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          ELSIF v_p2_time < v_p1_time THEN
             UPDATE game_sessions SET player2_score = player2_score + 3, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          ELSE
             UPDATE game_sessions SET player1_score = player1_score + 1, player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          END IF;
       ELSE
          UPDATE game_sessions SET phase_end_at = now() + interval '500 milliseconds' WHERE id = p_room_id;
      END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: add_ladder_game.sql
-- Add LADDER game to the game rotation
-- Updating start_game and start_next_round functions and constraints

-- 1. Update Game Type Constraint
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;

ALTER TABLE game_sessions 
ADD CONSTRAINT game_sessions_game_type_check 
CHECK (game_type IN (
    'RPS', 
    'NUMBER', 
    'MATH', 
    'TEN', 
    'COLOR', 
    'MEMORY', 
    'SEQUENCE', 
    'SEQUENCE_NORMAL', 
    'LARGEST', 
    'PAIR', 
    'UPDOWN', 
    'SLIDER', 
    'ARROW', 
    'NUMBER_DESC',
    'BLANK',
    'OPERATOR',
    'LADDER'  -- Added LADDER
));

-- 2. Update Start Game
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    v_mode text;
    v_current_type text;
    v_all_types text[] := ARRAY[
        'RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 
        'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR', 
        'UPDOWN', 'SEQUENCE_NORMAL', 'NUMBER_DESC', 
        'SLIDER', 'ARROW', 'BLANK', 'OPERATOR', 'LADDER'
    ];
    v_selected_types text[];
    v_first_type text;
BEGIN
    SELECT mode, game_type INTO v_mode, v_current_type FROM game_sessions WHERE id = p_room_id;
    v_seed := md5(random()::text);

    IF v_mode = 'practice' THEN
        -- PRACTICE: Start immediately, Round 1 (will finish after this round)
        UPDATE game_sessions
        SET status = 'playing',
            game_types = ARRAY[v_current_type], 
            current_round_index = 0,
            current_round = 1, -- Explicitly set to 1
            seed = v_seed,
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '34 seconds',
            round_scores = '[]'::jsonb
        WHERE id = p_room_id;
    ELSE
        -- NORMAL/RANK: Random 3 games
        SELECT ARRAY(
            SELECT x
            FROM unnest(v_all_types) AS x
            ORDER BY random()
            LIMIT 3
        ) INTO v_selected_types;

        v_first_type := v_selected_types[1];

        UPDATE game_sessions
        SET status = 'playing',
            game_types = v_selected_types,
            current_round_index = 0,
            current_round = 1,
            game_type = v_first_type,
            seed = v_seed,
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '34 seconds',
            round_scores = '[]'::jsonb
        WHERE id = p_room_id AND status = 'waiting';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 3. Update Start Next Round
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
  v_mode text;
  -- Added 'LADDER' here
  v_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW', 'BLANK', 'OPERATOR', 'LADDER'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
BEGIN
  -- Get current state
  SELECT game_type, status, current_round, player1_score, player2_score, mode
  INTO v_current_type, v_status, v_current_round, v_p1_score, v_p2_score, v_mode
  FROM game_sessions WHERE id = p_room_id;

  -- CRITICAL: Check Practice Mode Termination
  IF v_mode = 'practice' THEN
      -- In Practice, if we are in Round 1 (or more), we FINISH immediately.
      -- We do NOT start a next round.
      UPDATE game_sessions SET status = 'finished', end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  -- Normal Victory Check
  IF v_p1_score >= 3 or v_p2_score >= 3 THEN
      UPDATE game_sessions SET status = 'finished', end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  -- Pick Next Game Type (Random for normal)
  v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
  
  -- Setup Game Data
  IF v_next_type = 'RPS' THEN
      v_target := v_opts[floor(random()*3 + 1)];
      v_game_data := '{}';
  ELSE
      v_target := null;
      v_game_data := jsonb_build_object('seed', floor(random()*10000));
  END IF;

  -- Increment Round
  v_next_round := v_current_round + 1;

  -- Update Session
  UPDATE game_sessions
  SET status = 'countdown',
      current_round = v_next_round,
      game_type = v_next_type,
      game_data = v_game_data,
      target_move = v_target,
      phase_start_at = now(),
      phase_end_at = now() + interval '3 seconds'
  WHERE id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Update Submit Move (to prevent errors)
CREATE OR REPLACE FUNCTION submit_move(p_room_id uuid, p_player_id text, p_move text)
RETURNS void AS $$
DECLARE
  v_game_type text;
  v_round int;
  v_target text;
  v_mode text;
  v_opts text[] := ARRAY['rock','paper','scissors'];
  -- Standard vars
  v_p1 text;
  v_p2 text;
  v_p1_move_standard text;
  v_p2_move_standard text;
  v_p1_time int;
  v_p2_time int;
BEGIN
  SELECT game_type, current_round, target_move, mode
  INTO v_game_type, v_round, v_target, v_mode
  FROM game_sessions WHERE id = p_room_id;

  INSERT INTO game_moves (room_id, player_id, round, move)
  VALUES (p_room_id, p_player_id, v_round, p_move);
  
  -- PRACTICE LOGIC
  IF v_mode = 'practice' THEN
      -- Immediate Finish on Success
      IF v_game_type = 'RPS' THEN
          DECLARE
              v_win_move text;
          BEGIN
              IF v_target = 'rock' THEN v_win_move := 'paper';
              ELSIF v_target = 'paper' THEN v_win_move := 'scissors';
              ELSE v_win_move := 'rock';
              END IF;

              IF p_move = v_win_move THEN
                 -- WIN: Finish immediately
                 UPDATE game_sessions 
                 SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
                 WHERE id = p_room_id;
              ELSE
                 -- LOSE: Finish immediately (or retry? decided on finish)
                 UPDATE game_sessions 
                 SET status = 'finished', end_at = now() 
                 WHERE id = p_room_id;
              END IF;
          END;
          RETURN;
      ELSE
          -- Time Attack Games: "DONE:xxx"
          IF p_move LIKE 'DONE:%' THEN
              UPDATE game_sessions 
              SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
              WHERE id = p_room_id;
              RETURN;
          END IF;
      END IF;
      RETURN;
  END IF;

  -- STANDARD LOGIC (For Normal/Rank)
  SELECT player1_id, player2_id INTO v_p1, v_p2 FROM game_sessions WHERE id = p_room_id;

  IF v_game_type = 'RPS' THEN
      DECLARE
          v_win_move_std text;
      BEGIN
          IF v_target = 'rock' THEN v_win_move_std := 'paper';
          ELSIF v_target = 'paper' THEN v_win_move_std := 'scissors';
          ELSE v_win_move_std := 'rock';
          END IF;

          IF p_move = v_win_move_std THEN
             IF p_player_id = v_p1 THEN
                UPDATE game_sessions SET player1_score = player1_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
             ELSE
                UPDATE game_sessions SET player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
             END IF;
          END IF;
      END;
  -- Added LADDER to the list
  ELSIF v_game_type LIKE 'NUMBER%' OR v_game_type IN ('MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW', 'BLANK', 'OPERATOR', 'LADDER') THEN
      SELECT move INTO v_p1_move_standard FROM game_moves WHERE room_id = p_room_id AND round = v_round AND player_id = v_p1 AND move LIKE 'DONE:%' LIMIT 1;
      SELECT move INTO v_p2_move_standard FROM game_moves WHERE room_id = p_room_id AND round = v_round AND player_id = v_p2 AND move LIKE 'DONE:%' LIMIT 1;

      IF v_p1_move_standard IS NOT NULL AND v_p2_move_standard IS NOT NULL THEN
          v_p1_time := cast(split_part(v_p1_move_standard, ':', 2) AS int);
          v_p2_time := cast(split_part(v_p2_move_standard, ':', 2) AS int);
          IF v_p1_time < v_p2_time THEN
             UPDATE game_sessions SET player1_score = player1_score + 3, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          ELSIF v_p2_time < v_p1_time THEN
             UPDATE game_sessions SET player2_score = player2_score + 3, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          ELSE
             UPDATE game_sessions SET player1_score = player1_score + 1, player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          END IF;
       ELSE
          UPDATE game_sessions SET phase_end_at = now() + interval '500 milliseconds' WHERE id = p_room_id;
      END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: add_tap_color_game.sql
-- Add TAP_COLOR game to the game rotation
-- Updating start_game and start_next_round functions and constraints

-- 1. Update Game Type Constraint
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;

ALTER TABLE game_sessions 
ADD CONSTRAINT game_sessions_game_type_check 
CHECK (game_type IN (
    'RPS', 
    'NUMBER', 
    'MATH', 
    'TEN', 
    'COLOR', 
    'MEMORY', 
    'SEQUENCE', 
    'SEQUENCE_NORMAL', 
    'LARGEST', 
    'PAIR', 
    'UPDOWN', 
    'SLIDER', 
    'ARROW', 
    'NUMBER_DESC',
    'BLANK',
    'OPERATOR',
    'LADDER',
    'TAP_COLOR'  -- Added TAP_COLOR
));

-- 2. Update Start Game
CREATE OR REPLACE FUNCTION start_game(p_room_id uuid)
RETURNS void AS $$
DECLARE
    v_seed text;
    v_mode text;
    v_current_type text;
    v_all_types text[] := ARRAY[
        'RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 
        'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR', 
        'UPDOWN', 'SEQUENCE_NORMAL', 'NUMBER_DESC', 
        'SLIDER', 'ARROW', 'BLANK', 'OPERATOR', 'LADDER', 'TAP_COLOR'
    ];
    v_selected_types text[];
    v_first_type text;
BEGIN
    -- [SECURE] Caller Check
    IF NOT EXISTS (SELECT 1 FROM game_sessions WHERE id = p_room_id 
        AND (player1_id = auth.uid()::text OR player2_id = auth.uid()::text)) THEN
       RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT mode, game_type INTO v_mode, v_current_type FROM game_sessions WHERE id = p_room_id;
    v_seed := md5(random()::text);

    IF v_mode = 'practice' THEN
        -- PRACTICE: Start immediately, Round 1 (will finish after this round)
        UPDATE game_sessions
        SET status = 'playing',
            game_types = ARRAY[v_current_type], 
            current_round_index = 0,
            current_round = 1, -- Explicitly set to 1
            seed = v_seed,
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '34 seconds',
            round_scores = '[]'::jsonb
        WHERE id = p_room_id;
    ELSE
        -- NORMAL/RANK: Random 3 games
        SELECT ARRAY(
            SELECT x
            FROM unnest(v_all_types) AS x
            ORDER BY random()
            LIMIT 3
        ) INTO v_selected_types;

        v_first_type := v_selected_types[1];

        UPDATE game_sessions
        SET status = 'playing',
            game_types = v_selected_types,
            current_round_index = 0,
            current_round = 1,
            game_type = v_first_type,
            seed = v_seed,
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '34 seconds',
            round_scores = '[]'::jsonb
        WHERE id = p_room_id AND status = 'waiting';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 3. Update Start Next Round
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
  v_mode text;
  -- Added 'TAP_COLOR' here
  v_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW', 'BLANK', 'OPERATOR', 'LADDER', 'TAP_COLOR'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
BEGIN
  -- [SECURE] Caller Check
  IF NOT EXISTS (SELECT 1 FROM game_sessions WHERE id = p_room_id 
      AND (player1_id = auth.uid()::text OR player2_id = auth.uid()::text)) THEN
     RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Get current state
  SELECT game_type, status, current_round, player1_score, player2_score, mode
  INTO v_current_type, v_status, v_current_round, v_p1_score, v_p2_score, v_mode
  FROM game_sessions WHERE id = p_room_id;

  -- CRITICAL: Check Practice Mode Termination
  IF v_mode = 'practice' THEN
      -- In Practice, if we are in Round 1 (or more), we FINISH immediately.
      -- We do NOT start a next round.
      UPDATE game_sessions SET status = 'finished', end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  -- Normal Victory Check
  IF v_p1_score >= 3 or v_p2_score >= 3 THEN
      UPDATE game_sessions SET status = 'finished', end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  -- Pick Next Game Type (Random for normal)
  v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
  
  -- Setup Game Data
  IF v_next_type = 'RPS' THEN
      v_target := v_opts[floor(random()*3 + 1)];
      v_game_data := '{}';
  ELSE
      v_target := null;
      v_game_data := jsonb_build_object('seed', floor(random()*10000));
  END IF;

  -- Increment Round
  v_next_round := v_current_round + 1;

  -- Update Session
  UPDATE game_sessions
  SET status = 'countdown',
      current_round = v_next_round,
      game_type = v_next_type,
      game_data = v_game_data,
      target_move = v_target,
      phase_start_at = now(),
      phase_end_at = now() + interval '3 seconds'
  WHERE id = p_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Update Submit Move (to prevent errors)
CREATE OR REPLACE FUNCTION submit_move(p_room_id uuid, p_player_id text, p_move text)
RETURNS void AS $$
DECLARE
  v_game_type text;
  v_round int;
  v_target text;
  v_mode text;
  v_opts text[] := ARRAY['rock','paper','scissors'];
  -- Standard vars
  v_p1 text;
  v_p2 text;
  v_p1_move_standard text;
  v_p2_move_standard text;
  v_p1_time int;
  v_p2_time int;
BEGIN
  SELECT game_type, current_round, target_move, mode
  INTO v_game_type, v_round, v_target, v_mode
  FROM game_sessions WHERE id = p_room_id;

  INSERT INTO game_moves (room_id, player_id, round, move)
  VALUES (p_room_id, p_player_id, v_round, p_move);
  
  -- PRACTICE LOGIC
  IF v_mode = 'practice' THEN
      -- Immediate Finish on Success
      IF v_game_type = 'RPS' THEN
          DECLARE
              v_win_move text;
          BEGIN
              IF v_target = 'rock' THEN v_win_move := 'paper';
              ELSIF v_target = 'paper' THEN v_win_move := 'scissors';
              ELSE v_win_move := 'rock';
              END IF;

              IF p_move = v_win_move THEN
                 -- WIN: Finish immediately
                 UPDATE game_sessions 
                 SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
                 WHERE id = p_room_id;
              ELSE
                 -- LOSE: Finish immediately (or retry? decided on finish)
                 UPDATE game_sessions 
                 SET status = 'finished', end_at = now() 
                 WHERE id = p_room_id;
              END IF;
          END;
          RETURN;
      ELSE
          -- Time Attack Games: "DONE:xxx"
          IF p_move LIKE 'DONE:%' THEN
              UPDATE game_sessions 
              SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
              WHERE id = p_room_id;
              RETURN;
          END IF;
      END IF;
      RETURN;
  END IF;

  -- STANDARD LOGIC (For Normal/Rank)
  SELECT player1_id, player2_id INTO v_p1, v_p2 FROM game_sessions WHERE id = p_room_id;

  IF v_game_type = 'RPS' THEN
      DECLARE
          v_win_move_std text;
      BEGIN
          IF v_target = 'rock' THEN v_win_move_std := 'paper';
          ELSIF v_target = 'paper' THEN v_win_move_std := 'scissors';
          ELSE v_win_move_std := 'rock';
          END IF;

          IF p_move = v_win_move_std THEN
             IF p_player_id = v_p1 THEN
                UPDATE game_sessions SET player1_score = player1_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
             ELSE
                UPDATE game_sessions SET player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
             END IF;
          END IF;
      END;
  -- Added TAP_COLOR to the list
  ELSIF v_game_type LIKE 'NUMBER%' OR v_game_type IN ('MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW', 'BLANK', 'OPERATOR', 'LADDER', 'TAP_COLOR') THEN
      SELECT move INTO v_p1_move_standard FROM game_moves WHERE room_id = p_room_id AND round = v_round AND player_id = v_p1 AND move LIKE 'DONE:%' LIMIT 1;
      SELECT move INTO v_p2_move_standard FROM game_moves WHERE room_id = p_room_id AND round = v_round AND player_id = v_p2 AND move LIKE 'DONE:%' LIMIT 1;

      IF v_p1_move_standard IS NOT NULL AND v_p2_move_standard IS NOT NULL THEN
          v_p1_time := cast(split_part(v_p1_move_standard, ':', 2) AS int);
          v_p2_time := cast(split_part(v_p2_move_standard, ':', 2) AS int);
          IF v_p1_time < v_p2_time THEN
             UPDATE game_sessions SET player1_score = player1_score + 3, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          ELSIF v_p2_time < v_p1_time THEN
             UPDATE game_sessions SET player2_score = player2_score + 3, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          ELSE
             UPDATE game_sessions SET player1_score = player1_score + 1, player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          END IF;
       ELSE
          UPDATE game_sessions SET phase_end_at = now() + interval '500 milliseconds' WHERE id = p_room_id;
      END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Migration: add_pencil_system.sql
-- 1. Add pencils column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS pencils INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS last_recharge_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS ad_reward_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ad_reward_day DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS ads_removed BOOLEAN DEFAULT FALSE;

-- 2. Create RPC to get profile with auto-recharge logic
-- This function checks if time passed and recharges pencils up to 5
CREATE OR REPLACE FUNCTION get_profile_with_pencils(user_id UUID)
RETURNS TABLE (
    pencils INTEGER,
    last_recharge_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_pencils INTEGER;
    last_time TIMESTAMPTZ;
    time_diff INTERVAL;
    recharge_amount INTEGER;
    new_last_time TIMESTAMPTZ;
BEGIN
    -- [SECURE] Caller Check
    IF NOT EXISTS (SELECT 1 FROM game_sessions WHERE id = p_room_id 
        AND (player1_id = auth.uid()::text OR player2_id = auth.uid()::text)) THEN
       RAISE EXCEPTION 'Not authorized';
    END IF;

    -- Get current state
    SELECT p.pencils, p.last_recharge_at 
    INTO current_pencils, last_time 
    FROM public.profiles p 
    WHERE p.id = user_id;

    -- If null (shouldn't happen for existing users if default applied, but safe check)
    IF current_pencils IS NULL THEN
        current_pencils := 5;
        last_time := NOW();
        UPDATE public.profiles SET pencils = 5, last_recharge_at = NOW() WHERE id = user_id;
    END IF;

    -- Calculate recharge if below 5
    IF current_pencils < 5 THEN
        time_diff := NOW() - last_time;
        -- 1 pencil every 10 minutes
        -- Extract total minutes passed
        recharge_amount := FLOOR(EXTRACT(EPOCH FROM time_diff) / 600); -- 600 sec = 10 min

        IF recharge_amount > 0 THEN
            -- Calculate new count
            current_pencils := LEAST(5, current_pencils + recharge_amount);
            
            -- Update last_recharge_at based on how many intervals passed
            -- Rather than just setting strictly to NOW(), we add the intervals to keep timer accurate?
            -- Or just simplify: set to NOW() if we hit cap, or add (recharge * 10min)
            
            IF current_pencils = 5 THEN
                new_last_time := NOW(); -- Reset timer when full
            ELSE
                -- Advance time by the amount recharged to keep the partial progress
                new_last_time := last_time + (recharge_amount * INTERVAL '10 minutes');
            END IF;

            -- Update DB
            UPDATE public.profiles 
            SET pencils = current_pencils, 
                last_recharge_at = new_last_time 
            WHERE id = user_id;
            
            last_time := new_last_time;
        END IF;
    END IF;

    RETURN QUERY SELECT current_pencils, last_time;
END;
$$;


-- 3. Create RPC to consume pencil
CREATE OR REPLACE FUNCTION consume_pencil(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_pencils INTEGER;
BEGIN
    -- Sync first? Ideally frontend calls sync often, but let's just check current value
    -- We can call the sync logic here too, or trust that client/server sync is close enough.
    -- Better to be strict: Check DB value.
    
    SELECT p.pencils INTO current_pencils FROM public.profiles p WHERE p.id = user_id;

    IF current_pencils > 0 THEN
        UPDATE public.profiles 
        SET pencils = pencils - 1,
            -- If we were at 5 (full), triggering consumption starts the recharge timer NOW.
            last_recharge_at = CASE WHEN pencils = 5 THEN NOW() ELSE last_recharge_at END
        WHERE id = user_id;
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;


-- 4. Create RPC to reward pencils (Ad Watch)
CREATE OR REPLACE FUNCTION reward_ad_pencils(user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_count INTEGER;
    current_count INTEGER;
    current_day DATE;
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot reward pencils for another user';
    END IF;

    SELECT p.ad_reward_count, p.ad_reward_day
    INTO current_count, current_day
    FROM public.profiles p
    WHERE p.id = user_id
    FOR UPDATE;

    IF current_count IS NULL THEN
        current_count := 0;
    END IF;

    IF current_day IS NULL OR current_day <> CURRENT_DATE THEN
        current_count := 0;
        current_day := CURRENT_DATE;
    END IF;

    IF current_count >= 5 THEN
        RAISE EXCEPTION 'Daily ad reward limit reached';
    END IF;

    UPDATE public.profiles
    SET pencils = pencils + 2,
        ad_reward_count = current_count + 1,
        ad_reward_day = current_day
    WHERE id = user_id
    RETURNING pencils INTO new_count;
    
    RETURN new_count;
END;
$$;

-- 5. Create RPC to grant ad removal
CREATE OR REPLACE FUNCTION grant_ads_removal(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot grant ads removal for another user';
    END IF;

    UPDATE public.profiles
    SET ads_removed = TRUE
    WHERE id = user_id;

    RETURN TRUE;
END;
$$;

-- 6. Create RPC to grant pencils for purchases
CREATE OR REPLACE FUNCTION grant_pencils(user_id UUID, amount INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot grant pencils for another user';
    END IF;

    IF amount IS NULL OR amount <= 0 OR amount > 1000 THEN
        RAISE EXCEPTION 'Invalid pencil amount';
    END IF;

    UPDATE public.profiles
    SET pencils = pencils + amount
    WHERE id = user_id;

    RETURN TRUE;
END;
$$;

-- Migration: add_leaderboard_system.sql
-- 1. Create Index for fast leaderboard queries
CREATE INDEX IF NOT EXISTS idx_profiles_mmr ON profiles (mmr DESC);

-- 2. Helper Function to calculate Tier from MMR
CREATE OR REPLACE FUNCTION get_tier_name(p_mmr INT)
RETURNS TEXT AS $$
BEGIN
    IF p_mmr >= 2500 THEN RETURN 'Diamond';
    ELSIF p_mmr >= 2000 THEN RETURN 'Platinum';
    ELSIF p_mmr >= 1500 THEN RETURN 'Gold';
    ELSIF p_mmr >= 1200 THEN RETURN 'Silver';
    ELSE RETURN 'Bronze';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Leaderboard RPC
-- Returns top 100 players + the requesting user's rank/info
CREATE OR REPLACE FUNCTION get_leaderboard(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
    v_top_players JSON;
    v_user_rank JSON;
BEGIN
    -- Get Top 100 Players
    SELECT json_agg(t) INTO v_top_players
    FROM (
        SELECT 
            ROW_NUMBER() OVER (ORDER BY mmr DESC) as rank,
            id,
            nickname,
            avatar_url,
            country,
            mmr,
            get_tier_name(mmr) as tier
        FROM profiles
        LIMIT 100
    ) t;

    -- Get Requesting User's Specific Rank (if logged in)
    IF p_user_id IS NOT NULL THEN
        SELECT json_build_object(
            'rank', rank,
            'id', id,
            'nickname', nickname,
            'avatar_url', avatar_url,
            'country', country,
            'mmr', mmr,
            'tier', get_tier_name(mmr)
        ) INTO v_user_rank
        FROM (
            SELECT 
                id, nickname, avatar_url, country, mmr,
                RANK() OVER (ORDER BY mmr DESC) as rank
            FROM profiles
        ) sub
        WHERE id = p_user_id;
    END IF;

    -- Return combined result
    RETURN json_build_object(
        'top_players', COALESCE(v_top_players, '[]'::json),
        'user_rank', v_user_rank
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- Security Patch 2026-01-25
-- Enabling RLS and Hardening RPCs without full schema reset

-- 1. Enable RLS on Tables
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchmaking_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Create Safety Policies
-- Game Sessions: Participants can view
DROP POLICY IF EXISTS "Participants can view sessions" ON game_sessions;
CREATE POLICY "Participants can view sessions" ON game_sessions
    FOR SELECT
    USING (auth.uid()::text = player1_id OR auth.uid()::text = player2_id);

-- Game Sessions: Creation (if client creates directly) - allow if player1 is self
DROP POLICY IF EXISTS "Users can create their own sessions" ON game_sessions;
CREATE POLICY "Users can create their own sessions" ON game_sessions
    FOR INSERT
    WITH CHECK (auth.uid()::text = player1_id);

-- Game Moves: Participants can view moves in their room
DROP POLICY IF EXISTS "Participants can view moves" ON game_moves;
CREATE POLICY "Participants can view moves" ON game_moves
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM game_sessions s 
            WHERE s.id = room_id 
            AND (s.player1_id = auth.uid()::text OR s.player2_id = auth.uid()::text)
        )
    );

-- Game Moves: Insert own moves
DROP POLICY IF EXISTS "Players can insert own moves" ON game_moves;
CREATE POLICY "Players can insert own moves" ON game_moves
    FOR INSERT
    WITH CHECK (auth.uid()::text = player_id AND EXISTS (
        SELECT 1 FROM game_sessions s 
        WHERE s.id = room_id 
        AND (s.player1_id = auth.uid()::text OR s.player2_id = auth.uid()::text)
    ));

-- Matchmaking Queue: Manage own entry
DROP POLICY IF EXISTS "Manage own queue entry" ON matchmaking_queue;
CREATE POLICY "Manage own queue entry" ON matchmaking_queue
    FOR ALL
    USING (auth.uid()::text = player_id);

-- [FIX] DROP OLD OPEN POLICIES to ensure RLS works
DROP POLICY IF EXISTS "Enable access to all users" ON game_sessions;
DROP POLICY IF EXISTS "Enable access to all users" ON matchmaking_queue;

-- Profiles: Public Read (already exists usually, but reinforcing)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);

-- Profiles: Update Own
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);


-- 3. Harden RPCs (Override with Security Checks)

-- create_session (Enforce player1 = auth.uid)
CREATE OR REPLACE FUNCTION create_session(p_player1_id text, p_player2_id text)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Security Check
  IF p_player1_id != auth.uid()::text THEN
    RAISE EXCEPTION 'Not authorized to create session for another user';
  END IF;

  INSERT INTO game_sessions (player1_id, player2_id, status, current_round)
  VALUES (auth.uid()::text, p_player2_id, 'waiting', 0)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- submit_move (Enforce player_id = auth.uid)
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
  -- Security Check
  IF p_player_id != auth.uid()::text THEN
     RAISE EXCEPTION 'Not authorized to submit move for another user';
  END IF;

  -- Get current context
  SELECT game_type, current_round, target_move, player1_id, player2_id
  into v_game_type, v_round, v_target, v_p1, v_p2
  from game_sessions where id = p_room_id;

  -- Validation: Verify user is in the room
  IF v_p1 != auth.uid()::text AND v_p2 != auth.uid()::text THEN
     RAISE EXCEPTION 'User is not in this game room';
  END IF;

  -- 1. Log the move
  INSERT INTO game_moves (room_id, player_id, round, move)
  VALUES (p_room_id, auth.uid()::text, v_round, p_move);

  -- [Original Logic Preserved Below] --
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
             if auth.uid()::text = v_p1 then
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- trigger_game_start (Validate caller)
CREATE OR REPLACE FUNCTION trigger_game_start(p_room_id uuid)
RETURNS void AS $$
BEGIN
  -- Security Check
  IF NOT EXISTS (
     SELECT 1 FROM game_sessions 
     WHERE id = p_room_id 
     AND (player1_id = auth.uid()::text OR player2_id = auth.uid()::text)
  ) THEN
     RAISE EXCEPTION 'Not authorized to start this game';
  END IF;

  UPDATE game_sessions
  SET status = 'playing',
      phase_start_at = now(),
      phase_end_at = now() + interval '60 seconds' -- Max round time
  WHERE id = p_room_id AND status = 'countdown';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- get_profile_with_pencils (Check owner)
CREATE OR REPLACE FUNCTION get_profile_with_pencils(user_id UUID)
RETURNS TABLE (
    pencils INTEGER,
    last_recharge_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    current_pencils INTEGER;
    last_time TIMESTAMPTZ;
    time_diff INTERVAL;
    recharge_amount INTEGER;
    new_last_time TIMESTAMPTZ;
BEGIN
    -- Security Check
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot access pencil data of another user';
    END IF;

    -- Get current state
    SELECT p.pencils, p.last_recharge_at 
    INTO current_pencils, last_time 
    FROM public.profiles p 
    WHERE p.id = user_id;

    -- If null (shouldn't happen for existing users if default applied, but safe check)
    IF current_pencils IS NULL THEN
        current_pencils := 5;
        last_time := NOW();
        UPDATE public.profiles SET pencils = 5, last_recharge_at = NOW() WHERE id = user_id;
    END IF;

    -- Calculate recharge if below 5
    IF current_pencils < 5 THEN
        time_diff := NOW() - last_time;
        -- 1 pencil every 10 minutes
        recharge_amount := FLOOR(EXTRACT(EPOCH FROM time_diff) / 600); -- 600 sec = 10 min

        IF recharge_amount > 0 THEN
            current_pencils := LEAST(5, current_pencils + recharge_amount);
            
            IF current_pencils = 5 THEN
                new_last_time := NOW(); 
            ELSE
                new_last_time := last_time + (recharge_amount * INTERVAL '10 minutes');
            END IF;

            -- Update DB
            UPDATE public.profiles 
            SET pencils = current_pencils, 
                last_recharge_at = new_last_time 
            WHERE id = user_id;
            
            last_time := new_last_time;
        END IF;
    END IF;

    RETURN QUERY SELECT current_pencils, last_time;
END;
$$;


-- consume_pencil (Check owner)
CREATE OR REPLACE FUNCTION consume_pencil(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    current_pencils INTEGER;
BEGIN
    -- Security Check
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot consume pencil of another user';
    END IF;

    SELECT p.pencils INTO current_pencils FROM public.profiles p WHERE p.id = user_id;

    IF current_pencils > 0 THEN
        UPDATE public.profiles 
        SET pencils = pencils - 1,
            last_recharge_at = CASE WHEN pencils = 5 THEN NOW() ELSE last_recharge_at END
        WHERE id = user_id;
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;


-- get_player_match_history (Restrict to self or friends - simplified to self only for security first)
CREATE OR REPLACE FUNCTION get_player_match_history(
    p_user_id UUID,
    p_mode TEXT DEFAULT 'all',
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    session_id UUID,
    game_mode TEXT,
    created_at TIMESTAMPTZ,
    result TEXT,
    opponent_id TEXT,
    opponent_nickname TEXT,
    opponent_avatar_url TEXT,
    opponent_country TEXT,
    is_friend BOOLEAN
) AS $$
BEGIN
    -- Security Check: Only allow viewing own history
    IF p_user_id != auth.uid() THEN
        -- Optionally allow viewing friends? For now, strict: only own.
        -- If needed, we can check friendship table here.
        RAISE EXCEPTION 'Permission denied';
    END IF;

    RETURN QUERY
    SELECT
        gs.id AS session_id,
        gs.mode AS game_mode,
        gs.created_at,
        CASE
            WHEN gs.winner_id::text = p_user_id::text THEN 'WIN'
            WHEN gs.winner_id IS NULL AND gs.status IN ('completed', 'finished') THEN 'DRAW'
            ELSE 'LOSE'
        END AS result,
        (CASE
            WHEN gs.player1_id::text = p_user_id::text THEN gs.player2_id::text
            ELSE gs.player1_id::text
        END) AS opponent_id,
        p.nickname AS opponent_nickname,
        p.avatar_url AS opponent_avatar_url,
        p.country AS opponent_country,
        (EXISTS (
            SELECT 1 FROM friendships f
            WHERE (f.user_id = p_user_id AND f.friend_id::text = (CASE WHEN gs.player1_id::text = p_user_id::text THEN gs.player2_id::text ELSE gs.player1_id::text END))
               OR (f.user_id::text = (CASE WHEN gs.player1_id::text = p_user_id::text THEN gs.player2_id::text ELSE gs.player1_id::text END) AND f.friend_id = p_user_id)
            AND f.status = 'accepted'
        )) AS is_friend
    FROM
        game_sessions gs
    LEFT JOIN
        profiles p ON p.id::text = (CASE WHEN gs.player1_id::text = p_user_id::text THEN gs.player2_id::text ELSE gs.player1_id::text END)
    WHERE
        (gs.player1_id::text = p_user_id::text OR gs.player2_id::text = p_user_id::text)
        AND gs.status IN ('finished', 'forfeited', 'completed')
        AND gs.mode NOT ILIKE '%practice%'
        AND (p_mode = 'all' OR gs.mode = p_mode)
    ORDER BY
        gs.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


COMMIT;
