-- Ensure item event inserts are delivered through Supabase Realtime.

DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.game_session_item_events;
    EXCEPTION
        WHEN duplicate_object THEN
            NULL;
    END;
END;
$$;
