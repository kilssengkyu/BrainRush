-- Grant pencils for IAP purchases

CREATE OR REPLACE FUNCTION grant_pencils(user_id UUID, amount INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot grant pencils for another user';
    END IF;

    IF amount IS NULL OR amount <= 0 OR amount > 1000 THEN
        RAISE EXCEPTION 'Invalid pencil amount';
    END IF;

    UPDATE public.profiles
    SET pencils = pencils + amount
    WHERE id = user_id;

    RETURN TRUE;
END;
$$;
