CREATE OR REPLACE FUNCTION public.get_profile_with_pencils(user_id uuid)
RETURNS TABLE (
  pencils integer,
  last_recharge_at timestamptz,
  practice_notes integer,
  practice_last_recharge_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
#variable_conflict use_column
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
    IF $1 != auth.uid() THEN
        RAISE EXCEPTION 'Cannot access resources of another user';
    END IF;

    INSERT INTO public.user_daily_activity (user_id, activity_date, first_seen_at, last_seen_at, session_count, updated_at)
    VALUES ($1, CURRENT_DATE, now(), now(), 1, now())
    ON CONFLICT (user_id, activity_date)
    DO UPDATE SET
      last_seen_at = now(),
      session_count = user_daily_activity.session_count + 1,
      updated_at = now();

    SELECT p.pencils, p.last_recharge_at, p.practice_notes, p.practice_last_recharge_at
    INTO current_pencils, last_time, current_notes, notes_last_time
    FROM public.profiles p
    WHERE p.id = $1;

    IF current_pencils IS NULL THEN
        current_pencils := 5;
        last_time := NOW();
        UPDATE public.profiles SET pencils = 5, last_recharge_at = NOW() WHERE id = $1;
    END IF;

    IF current_notes IS NULL THEN
        current_notes := 5;
        notes_last_time := NOW();
        UPDATE public.profiles SET practice_notes = 5, practice_last_recharge_at = NOW() WHERE id = $1;
    END IF;

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
            WHERE id = $1;

            last_time := new_last_time;
        END IF;
    END IF;

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
            WHERE id = $1;

            notes_last_time := new_notes_last_time;
        END IF;
    END IF;

    RETURN QUERY SELECT current_pencils, last_time, current_notes, notes_last_time;
END;
$$;
