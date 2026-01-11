-- Add tables to the realtime publication
-- This is required for clients to receive 'postgres_changes' events.
alter publication supabase_realtime add table game_sessions, game_moves;
