-- Daily shop freebies: add free gold and one rewarded-ad bonus claim per reward type.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS shop_free_pencil_ad_claimed_on date,
ADD COLUMN IF NOT EXISTS shop_free_gold_claimed_on date,
ADD COLUMN IF NOT EXISTS shop_free_gold_ad_claimed_on date;

CREATE OR REPLACE FUNCTION public.claim_daily_shop_pencil(p_is_ad boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_claim_date date;
    v_base_claim_date date;
    v_ad_claim_date date;
    v_new_pencils integer;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    v_claim_date := public.get_daily_quest_date(v_uid);

    SELECT p.shop_free_pencil_claimed_on, p.shop_free_pencil_ad_claimed_on
    INTO v_base_claim_date, v_ad_claim_date
    FROM public.profiles p
    WHERE p.id = v_uid
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;

    IF p_is_ad AND v_base_claim_date IS DISTINCT FROM v_claim_date THEN
        SELECT COALESCE(p.pencils, 0)
        INTO v_new_pencils
        FROM public.profiles p
        WHERE p.id = v_uid;

        RETURN jsonb_build_object(
            'claimed', false,
            'already_claimed', false,
            'base_required', true,
            'claim_date', v_claim_date,
            'pencils', v_new_pencils
        );
    END IF;

    IF (NOT p_is_ad AND v_base_claim_date = v_claim_date)
       OR (p_is_ad AND v_ad_claim_date = v_claim_date) THEN
        SELECT COALESCE(p.pencils, 0)
        INTO v_new_pencils
        FROM public.profiles p
        WHERE p.id = v_uid;

        RETURN jsonb_build_object(
            'claimed', false,
            'already_claimed', true,
            'is_ad', p_is_ad,
            'claim_date', v_claim_date,
            'pencils', v_new_pencils
        );
    END IF;

    UPDATE public.profiles
    SET
        pencils = COALESCE(pencils, 0) + 1,
        shop_free_pencil_claimed_on = CASE WHEN p_is_ad THEN shop_free_pencil_claimed_on ELSE v_claim_date END,
        shop_free_pencil_ad_claimed_on = CASE WHEN p_is_ad THEN v_claim_date ELSE shop_free_pencil_ad_claimed_on END
    WHERE id = v_uid
    RETURNING pencils INTO v_new_pencils;

    IF p_is_ad THEN
        PERFORM public.apply_daily_quest_event(v_uid, 'AD_WATCH', 1, v_claim_date);
    ELSE
        PERFORM public.apply_daily_quest_event(v_uid, 'SHOP_VISIT', 1, v_claim_date);
    END IF;

    RETURN jsonb_build_object(
        'claimed', true,
        'already_claimed', false,
        'is_ad', p_is_ad,
        'claim_date', v_claim_date,
        'pencils', v_new_pencils,
        'amount', 1
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_daily_shop_gold(p_is_ad boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_claim_date date;
    v_base_claim_date date;
    v_ad_claim_date date;
    v_new_gold integer;
    v_amount integer := 30;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    v_claim_date := public.get_daily_quest_date(v_uid);

    SELECT p.shop_free_gold_claimed_on, p.shop_free_gold_ad_claimed_on
    INTO v_base_claim_date, v_ad_claim_date
    FROM public.profiles p
    WHERE p.id = v_uid
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;

    IF p_is_ad AND v_base_claim_date IS DISTINCT FROM v_claim_date THEN
        SELECT COALESCE(p.gold, 0)
        INTO v_new_gold
        FROM public.profiles p
        WHERE p.id = v_uid;

        RETURN jsonb_build_object(
            'claimed', false,
            'already_claimed', false,
            'base_required', true,
            'claim_date', v_claim_date,
            'gold', v_new_gold
        );
    END IF;

    IF (NOT p_is_ad AND v_base_claim_date = v_claim_date)
       OR (p_is_ad AND v_ad_claim_date = v_claim_date) THEN
        SELECT COALESCE(p.gold, 0)
        INTO v_new_gold
        FROM public.profiles p
        WHERE p.id = v_uid;

        RETURN jsonb_build_object(
            'claimed', false,
            'already_claimed', true,
            'is_ad', p_is_ad,
            'claim_date', v_claim_date,
            'gold', v_new_gold
        );
    END IF;

    UPDATE public.profiles
    SET
        gold = COALESCE(gold, 0) + v_amount,
        shop_free_gold_claimed_on = CASE WHEN p_is_ad THEN shop_free_gold_claimed_on ELSE v_claim_date END,
        shop_free_gold_ad_claimed_on = CASE WHEN p_is_ad THEN v_claim_date ELSE shop_free_gold_ad_claimed_on END
    WHERE id = v_uid
    RETURNING gold INTO v_new_gold;

    IF p_is_ad THEN
        PERFORM public.apply_daily_quest_event(v_uid, 'AD_WATCH', 1, v_claim_date);
    ELSE
        PERFORM public.apply_daily_quest_event(v_uid, 'SHOP_VISIT', 1, v_claim_date);
    END IF;

    RETURN jsonb_build_object(
        'claimed', true,
        'already_claimed', false,
        'is_ad', p_is_ad,
        'claim_date', v_claim_date,
        'gold', v_new_gold,
        'amount', v_amount
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_daily_shop_pencil(boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_daily_shop_gold(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_daily_shop_pencil(boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_daily_shop_gold(boolean) TO authenticated, service_role;
