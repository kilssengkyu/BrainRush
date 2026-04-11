-- Change resource recharge interval from 30 minutes to 15 minutes
-- Applies to both pencils and practice notes in the authoritative RPC.

CREATE OR REPLACE FUNCTION public.get_profile_with_pencils(user_id uuid)
RETURNS TABLE (
  pencils integer,
  last_recharge_at timestamp with time zone,
  practice_notes integer,
  practice_last_recharge_at timestamp with time zone
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

    -- Pencils: 1 per 15 minutes, max 5
    IF current_pencils < 5 THEN
        time_diff := NOW() - last_time;
        recharge_amount := FLOOR(EXTRACT(EPOCH FROM time_diff) / 900);

        IF recharge_amount > 0 THEN
            current_pencils := LEAST(5, current_pencils + recharge_amount);
            IF current_pencils = 5 THEN
                new_last_time := NOW();
            ELSE
                new_last_time := last_time + (recharge_amount * INTERVAL '15 minutes');
            END IF;

            UPDATE public.profiles
            SET pencils = current_pencils,
                last_recharge_at = new_last_time
            WHERE id = user_id;

            last_time := new_last_time;
        END IF;
    END IF;

    -- Practice Notes: 1 per 15 minutes, max 5
    IF current_notes < 5 THEN
        notes_diff := NOW() - notes_last_time;
        notes_recharge := FLOOR(EXTRACT(EPOCH FROM notes_diff) / 900);

        IF notes_recharge > 0 THEN
            current_notes := LEAST(5, current_notes + notes_recharge);
            IF current_notes = 5 THEN
                new_notes_last_time := NOW();
            ELSE
                new_notes_last_time := notes_last_time + (notes_recharge * INTERVAL '15 minutes');
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
