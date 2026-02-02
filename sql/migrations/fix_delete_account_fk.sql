-- Fix delete_account to clean up FKs referencing auth.users
CREATE OR REPLACE FUNCTION delete_account()
RETURNS void AS $$
BEGIN
  -- Clean up dependent rows that reference auth.users
  DELETE FROM public.friendships WHERE user_id::text = auth.uid()::text OR friend_id::text = auth.uid()::text;
  DELETE FROM public.chat_messages WHERE sender_id::text = auth.uid()::text OR receiver_id::text = auth.uid()::text;
  DELETE FROM public.matchmaking_queue WHERE player_id::text = auth.uid()::text;

  -- Delete profile (cascades to per-game stats/highscores)
  DELETE FROM public.profiles WHERE id::text = auth.uid()::text;

  -- Delete the user from Auth
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
