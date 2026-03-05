-- Add function to grant pencils securely
CREATE OR REPLACE FUNCTION grant_pencils(user_id UUID, amount INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot grant pencils to another user';
    END IF;

    UPDATE public.profiles
    SET pencils = COALESCE(pencils, 0) + amount
    WHERE id = user_id;

    RETURN TRUE;
END;
$$;
