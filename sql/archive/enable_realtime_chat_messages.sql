-- Migration: enable_realtime_chat_messages.sql
-- Ensure chat_messages and friendships are in supabase_realtime publication.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = 'chat_messages'
        ) THEN
            EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = 'friendships'
        ) THEN
            EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships';
        END IF;
    END IF;
END;
$$;
