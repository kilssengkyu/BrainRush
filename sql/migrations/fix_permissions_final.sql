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
