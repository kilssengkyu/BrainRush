-- Add function to grant practice notes securely
CREATE OR REPLACE FUNCTION grant_practice_notes(user_id UUID, amount INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot grant practice notes to another user';
    END IF;

    UPDATE public.profiles
    SET practice_notes = COALESCE(practice_notes, 0) + amount
    WHERE id = user_id;

    RETURN TRUE;
END;
$$;
