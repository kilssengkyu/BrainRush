-- Add ads_removed flag and RPC for ad removal purchases

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS ads_removed BOOLEAN DEFAULT FALSE;

UPDATE public.profiles
SET ads_removed = FALSE
WHERE ads_removed IS NULL;

CREATE OR REPLACE FUNCTION grant_ads_removal(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot grant ads removal for another user';
    END IF;

    UPDATE public.profiles
    SET ads_removed = TRUE
    WHERE id = user_id;

    RETURN TRUE;
END;
$$;
