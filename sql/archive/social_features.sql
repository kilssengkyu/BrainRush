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
