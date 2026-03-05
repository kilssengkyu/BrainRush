-- Add daily ad reward limit tracking and enforcement

-- 1. Profile columns for daily ad reward counts
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS ad_reward_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ad_reward_day DATE DEFAULT CURRENT_DATE;

-- Optional backfill for existing rows
UPDATE public.profiles
SET ad_reward_count = 0
WHERE ad_reward_count IS NULL;

UPDATE public.profiles
SET ad_reward_day = CURRENT_DATE
WHERE ad_reward_day IS NULL;

-- 2. Enforce daily limit (5) in reward RPC
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

    IF current_count >= 5 THEN
        RAISE EXCEPTION 'Daily ad reward limit reached';
    END IF;

    UPDATE public.profiles
    SET pencils = pencils + 2,
        ad_reward_count = current_count + 1,
        ad_reward_day = current_day
    WHERE id = user_id
    RETURNING pencils INTO new_count;

    RETURN new_count;
END;
$$;
