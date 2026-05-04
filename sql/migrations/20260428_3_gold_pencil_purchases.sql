-- Gold shop RPC: exchange gold for pencils through a server-validated purchase.

CREATE OR REPLACE FUNCTION public.purchase_pencils_with_gold(p_quantity integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_quantity integer := COALESCE(p_quantity, 0);
    v_price integer;
    v_current_gold integer;
    v_new_gold integer;
    v_new_pencils integer;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    v_price := CASE v_quantity
        WHEN 1 THEN 100
        WHEN 5 THEN 450
        ELSE NULL
    END;

    IF v_price IS NULL THEN
        RAISE EXCEPTION 'Invalid pencil package';
    END IF;

    SELECT COALESCE(gold, 0)
    INTO v_current_gold
    FROM public.profiles
    WHERE id = v_uid
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;

    IF v_current_gold < v_price THEN
        RAISE EXCEPTION 'Not enough gold';
    END IF;

    UPDATE public.profiles
    SET
        gold = COALESCE(gold, 0) - v_price,
        pencils = COALESCE(pencils, 0) + v_quantity
    WHERE id = v_uid
    RETURNING gold, pencils INTO v_new_gold, v_new_pencils;

    RETURN jsonb_build_object(
        'purchased_quantity', v_quantity,
        'gold_spent', v_price,
        'gold_balance', v_new_gold,
        'pencils', v_new_pencils
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_pencils_with_gold(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_pencils_with_gold(integer) TO authenticated, service_role;
