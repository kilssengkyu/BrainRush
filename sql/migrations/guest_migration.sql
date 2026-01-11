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
$$ language plpgsql security definer;

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
