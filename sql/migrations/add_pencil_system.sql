-- 1. Add pencils column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS pencils INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS last_recharge_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Create RPC to get profile with auto-recharge logic
-- This function checks if time passed and recharges pencils up to 5
CREATE OR REPLACE FUNCTION get_profile_with_pencils(user_id UUID)
RETURNS TABLE (
    pencils INTEGER,
    last_recharge_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_pencils INTEGER;
    last_time TIMESTAMPTZ;
    time_diff INTERVAL;
    recharge_amount INTEGER;
    new_last_time TIMESTAMPTZ;
BEGIN
    -- Get current state
    SELECT p.pencils, p.last_recharge_at 
    INTO current_pencils, last_time 
    FROM public.profiles p 
    WHERE p.id = user_id;

    -- If null (shouldn't happen for existing users if default applied, but safe check)
    IF current_pencils IS NULL THEN
        current_pencils := 5;
        last_time := NOW();
        UPDATE public.profiles SET pencils = 5, last_recharge_at = NOW() WHERE id = user_id;
    END IF;

    -- Calculate recharge if below 5
    IF current_pencils < 5 THEN
        time_diff := NOW() - last_time;
        -- 1 pencil every 10 minutes
        -- Extract total minutes passed
        recharge_amount := FLOOR(EXTRACT(EPOCH FROM time_diff) / 600); -- 600 sec = 10 min

        IF recharge_amount > 0 THEN
            -- Calculate new count
            current_pencils := LEAST(5, current_pencils + recharge_amount);
            
            -- Update last_recharge_at based on how many intervals passed
            -- Rather than just setting strictly to NOW(), we add the intervals to keep timer accurate?
            -- Or just simplify: set to NOW() if we hit cap, or add (recharge * 10min)
            
            IF current_pencils = 5 THEN
                new_last_time := NOW(); -- Reset timer when full
            ELSE
                -- Advance time by the amount recharged to keep the partial progress
                new_last_time := last_time + (recharge_amount * INTERVAL '10 minutes');
            END IF;

            -- Update DB
            UPDATE public.profiles 
            SET pencils = current_pencils, 
                last_recharge_at = new_last_time 
            WHERE id = user_id;
            
            last_time := new_last_time;
        END IF;
    END IF;

    RETURN QUERY SELECT current_pencils, last_time;
END;
$$;


-- 3. Create RPC to consume pencil
CREATE OR REPLACE FUNCTION consume_pencil(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_pencils INTEGER;
BEGIN
    -- Sync first? Ideally frontend calls sync often, but let's just check current value
    -- We can call the sync logic here too, or trust that client/server sync is close enough.
    -- Better to be strict: Check DB value.
    
    SELECT p.pencils INTO current_pencils FROM public.profiles p WHERE p.id = user_id;

    IF current_pencils > 0 THEN
        UPDATE public.profiles 
        SET pencils = pencils - 1,
            -- If we were at 5 (full), triggering consumption starts the recharge timer NOW.
            last_recharge_at = CASE WHEN pencils = 5 THEN NOW() ELSE last_recharge_at END
        WHERE id = user_id;
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;


-- 4. Create RPC to reward pencils (Ad Watch)
CREATE OR REPLACE FUNCTION reward_ad_pencils(user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_count INTEGER;
BEGIN
    UPDATE public.profiles
    SET pencils = pencils + 2
    WHERE id = user_id
    RETURNING pencils INTO new_count;
    
    RETURN new_count;
END;
$$;
