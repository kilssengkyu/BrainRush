-- Fix guest cleanup FK violation:
-- public.profiles(id) -> auth.users(id) is not ON DELETE CASCADE,
-- so delete dependent rows first, then auth.users.

CREATE OR REPLACE FUNCTION public.cleanup_stale_guest_accounts(p_inactive_days integer DEFAULT 7)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_deleted_count integer := 0;
    v_stale_ids uuid[];
BEGIN
    IF p_inactive_days < 1 THEN
        RAISE EXCEPTION 'p_inactive_days must be at least 1';
    END IF;

    SELECT COALESCE(array_agg(sg.id), ARRAY[]::uuid[])
    INTO v_stale_ids
    FROM (
        SELECT u.id
        FROM auth.users u
        JOIN public.profiles p ON p.id = u.id
        WHERE u.is_anonymous = true
          AND COALESCE(p.last_seen, p.created_at, u.last_sign_in_at, u.created_at) < (now() - make_interval(days => p_inactive_days))
          AND NOT EXISTS (
              SELECT 1
              FROM auth.identities i
              WHERE i.user_id = u.id
                AND i.provider IN ('google', 'apple')
          )
    ) sg;

    IF array_length(v_stale_ids, 1) IS NULL THEN
        RETURN 0;
    END IF;

    -- Clean dependent rows first for FK-safe deletion
    DELETE FROM public.friendships f
    WHERE f.user_id = ANY(v_stale_ids)
       OR f.friend_id = ANY(v_stale_ids);

    DELETE FROM public.chat_messages c
    WHERE c.sender_id = ANY(v_stale_ids)
       OR c.receiver_id = ANY(v_stale_ids);

    DELETE FROM public.profiles p
    WHERE p.id = ANY(v_stale_ids);

    DELETE FROM auth.users u
    WHERE u.id = ANY(v_stale_ids);

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$;
