-- Ensure account deletion also removes user avatar files in Storage.
CREATE OR REPLACE FUNCTION public.delete_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Clean up dependent rows that reference auth.users
  DELETE FROM public.friendships WHERE user_id::text = auth.uid()::text OR friend_id::text = auth.uid()::text;
  DELETE FROM public.chat_messages WHERE sender_id::text = auth.uid()::text OR receiver_id::text = auth.uid()::text;
  DELETE FROM public.matchmaking_queue WHERE player_id::text = auth.uid()::text;

  -- Delete user's uploaded avatars from Storage
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects
  WHERE bucket_id = 'avatars'
    AND (
      owner = auth.uid()
      OR owner_id = auth.uid()::text
      OR (storage.foldername(name))[1] = auth.uid()::text
    );

  -- Delete profile (cascades to per-game stats/highscores)
  DELETE FROM public.profiles WHERE id::text = auth.uid()::text;

  -- Delete the user from Auth
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
