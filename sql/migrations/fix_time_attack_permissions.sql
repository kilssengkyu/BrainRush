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
