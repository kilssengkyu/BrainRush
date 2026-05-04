-- Daily shop freebie: one free pencil per user day from the shop.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS shop_free_pencil_claimed_on date;

CREATE OR REPLACE FUNCTION public.claim_daily_shop_pencil()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_claim_date date;
    v_previous_claim_date date;
    v_new_pencils integer;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    v_claim_date := public.get_daily_quest_date(v_uid);

    SELECT p.shop_free_pencil_claimed_on
    INTO v_previous_claim_date
    FROM public.profiles p
    WHERE p.id = v_uid
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;

    IF v_previous_claim_date = v_claim_date THEN
        SELECT COALESCE(p.pencils, 0)
        INTO v_new_pencils
        FROM public.profiles p
        WHERE p.id = v_uid;

        RETURN jsonb_build_object(
            'claimed', false,
            'already_claimed', true,
            'claim_date', v_claim_date,
            'pencils', v_new_pencils
        );
    END IF;

    UPDATE public.profiles
    SET
        pencils = COALESCE(pencils, 0) + 1,
        shop_free_pencil_claimed_on = v_claim_date
    WHERE id = v_uid
    RETURNING pencils INTO v_new_pencils;

    PERFORM public.apply_daily_quest_event(v_uid, 'SHOP_VISIT', 1, v_claim_date);

    RETURN jsonb_build_object(
        'claimed', true,
        'already_claimed', false,
        'claim_date', v_claim_date,
        'pencils', v_new_pencils
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_daily_shop_pencil() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_daily_shop_pencil() TO authenticated, service_role;
