-- Update pencil ad rewards: +1 per ad, daily limit 10

CREATE OR REPLACE FUNCTION reward_ad_pencils(user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_count INTEGER;
    current_count INTEGER;
    current_day DATE;
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot reward pencils for another user';
    END IF;

    SELECT p.ad_reward_count, p.ad_reward_day
    INTO current_count, current_day
    FROM public.profiles p
    WHERE p.id = user_id
    FOR UPDATE;

    IF current_count IS NULL THEN
        current_count := 0;
    END IF;

    IF current_day IS NULL OR current_day <> CURRENT_DATE THEN
        current_count := 0;
        current_day := CURRENT_DATE;
    END IF;

    IF current_count >= 10 THEN
        RAISE EXCEPTION 'Daily ad reward limit reached';
    END IF;

    UPDATE public.profiles
    SET pencils = pencils + 1,
        ad_reward_count = current_count + 1,
        ad_reward_day = current_day
    WHERE id = user_id
    RETURNING pencils INTO new_count;

    RETURN new_count;
END;
$$;
