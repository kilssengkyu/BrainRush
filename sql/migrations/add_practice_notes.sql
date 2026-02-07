-- Add Practice Notes resource with auto-recharge and ad rewards

-- 1. Profile columns for Practice Notes
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS practice_notes INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS practice_last_recharge_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS practice_ad_reward_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS practice_ad_reward_day DATE DEFAULT CURRENT_DATE;

UPDATE public.profiles
SET practice_notes = 5
WHERE practice_notes IS NULL;

UPDATE public.profiles
SET practice_last_recharge_at = NOW()
WHERE practice_last_recharge_at IS NULL;

UPDATE public.profiles
SET practice_ad_reward_count = 0
WHERE practice_ad_reward_count IS NULL;

UPDATE public.profiles
SET practice_ad_reward_day = CURRENT_DATE
WHERE practice_ad_reward_day IS NULL;

-- 2. Extend get_profile_with_pencils to also recharge Practice Notes
DROP FUNCTION IF EXISTS get_profile_with_pencils(UUID);
CREATE OR REPLACE FUNCTION get_profile_with_pencils(user_id UUID)
RETURNS TABLE (
    pencils INTEGER,
    last_recharge_at TIMESTAMPTZ,
    practice_notes INTEGER,
    practice_last_recharge_at TIMESTAMPTZ
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
    current_notes INTEGER;
    notes_last_time TIMESTAMPTZ;
    notes_diff INTERVAL;
    notes_recharge INTEGER;
    new_notes_last_time TIMESTAMPTZ;
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot access resources of another user';
    END IF;

    SELECT p.pencils, p.last_recharge_at, p.practice_notes, p.practice_last_recharge_at
    INTO current_pencils, last_time, current_notes, notes_last_time
    FROM public.profiles p
    WHERE p.id = user_id;

    IF current_pencils IS NULL THEN
        current_pencils := 5;
        last_time := NOW();
        UPDATE public.profiles SET pencils = 5, last_recharge_at = NOW() WHERE id = user_id;
    END IF;

    IF current_notes IS NULL THEN
        current_notes := 5;
        notes_last_time := NOW();
        UPDATE public.profiles SET practice_notes = 5, practice_last_recharge_at = NOW() WHERE id = user_id;
    END IF;

    -- Pencils: 1 per 30 minutes, max 5
    IF current_pencils < 5 THEN
        time_diff := NOW() - last_time;
        recharge_amount := FLOOR(EXTRACT(EPOCH FROM time_diff) / 1800);

        IF recharge_amount > 0 THEN
            current_pencils := LEAST(5, current_pencils + recharge_amount);
            IF current_pencils = 5 THEN
                new_last_time := NOW();
            ELSE
                new_last_time := last_time + (recharge_amount * INTERVAL '30 minutes');
            END IF;

            UPDATE public.profiles
            SET pencils = current_pencils,
                last_recharge_at = new_last_time
            WHERE id = user_id;

            last_time := new_last_time;
        END IF;
    END IF;

    -- Practice Notes: 1 per 30 minutes, max 5
    IF current_notes < 5 THEN
        notes_diff := NOW() - notes_last_time;
        notes_recharge := FLOOR(EXTRACT(EPOCH FROM notes_diff) / 1800);

        IF notes_recharge > 0 THEN
            current_notes := LEAST(5, current_notes + notes_recharge);
            IF current_notes = 5 THEN
                new_notes_last_time := NOW();
            ELSE
                new_notes_last_time := notes_last_time + (notes_recharge * INTERVAL '30 minutes');
            END IF;

            UPDATE public.profiles
            SET practice_notes = current_notes,
                practice_last_recharge_at = new_notes_last_time
            WHERE id = user_id;

            notes_last_time := new_notes_last_time;
        END IF;
    END IF;

    RETURN QUERY SELECT current_pencils, last_time, current_notes, notes_last_time;
END;
$$;

-- 3. Consume Practice Note
CREATE OR REPLACE FUNCTION consume_practice_note(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_notes INTEGER;
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot consume practice notes of another user';
    END IF;

    SELECT p.practice_notes INTO current_notes FROM public.profiles p WHERE p.id = user_id;

    IF current_notes > 0 THEN
        UPDATE public.profiles
        SET practice_notes = practice_notes - 1,
            practice_last_recharge_at = CASE WHEN practice_notes = 5 THEN NOW() ELSE practice_last_recharge_at END
        WHERE id = user_id;
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;

-- 4. Reward Practice Notes (Ad Watch) - Daily limit 10
CREATE OR REPLACE FUNCTION reward_ad_practice_notes(user_id UUID)
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
        RAISE EXCEPTION 'Cannot reward practice notes for another user';
    END IF;

    SELECT p.practice_ad_reward_count, p.practice_ad_reward_day
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
    SET practice_notes = practice_notes + 2,
        practice_ad_reward_count = current_count + 1,
        practice_ad_reward_day = current_day
    WHERE id = user_id
    RETURNING practice_notes INTO new_count;

    RETURN new_count;
END;
$$;

-- 5. Consume Practice Note in create_practice_session
CREATE OR REPLACE FUNCTION create_practice_session(p_player_id text, p_game_type text)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
  consumed boolean;
BEGIN
  IF p_player_id <> auth.uid()::text THEN
      RAISE EXCEPTION 'Not authorized';
  END IF;

  consumed := consume_practice_note(auth.uid());
  IF NOT consumed THEN
      RAISE EXCEPTION 'Not enough practice notes';
  END IF;

  INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode, game_type)
  VALUES (p_player_id, 'practice_solo', 'waiting', 0, 'practice', p_game_type)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
