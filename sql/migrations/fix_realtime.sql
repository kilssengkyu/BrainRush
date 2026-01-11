-- Re-connect tables to Realtime Publication
-- This is NECESSARY after dropping and recreating tables.

alter publication supabase_realtime add table game_sessions, game_moves;

-- Verification:
-- If this runs successfully, Realtime events will resume.
-- If it says "relation already in publication", that is fine too.
