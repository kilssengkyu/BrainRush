-- Daily quest: reward one gold-spending action, and record gold spend events from gold purchases.

INSERT INTO public.daily_quest_catalog (
    quest_code,
    event_type,
    threshold,
    points,
    sort_order,
    metadata
)
VALUES (
    'GOLD_SPEND_1',
    'GOLD_SPENT',
    1,
    10,
    75,
    '{"title_key": "dailyQuests.quests.goldSpend1.title", "description_key": "dailyQuests.quests.goldSpend1.description"}'::jsonb
)
ON CONFLICT (quest_code)
DO UPDATE SET
    event_type = EXCLUDED.event_type,
    threshold = EXCLUDED.threshold,
    points = EXCLUDED.points,
    sort_order = EXCLUDED.sort_order,
    metadata = EXCLUDED.metadata,
    is_enabled = true,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.spend_gold(amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_current_gold integer;
    v_new_gold integer;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF amount IS NULL OR amount <= 0 OR amount > 1000000 THEN
        RAISE EXCEPTION 'Invalid gold amount';
    END IF;

    SELECT COALESCE(gold, 0)
    INTO v_current_gold
    FROM public.profiles
    WHERE id = v_uid
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;

    IF v_current_gold < amount THEN
        RAISE EXCEPTION 'Not enough gold';
    END IF;

    UPDATE public.profiles
    SET gold = gold - amount
    WHERE id = v_uid
    RETURNING gold INTO v_new_gold;

    PERFORM public.apply_daily_quest_event(v_uid, 'GOLD_SPENT', 1, NULL);

    RETURN v_new_gold;
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_item(
    p_item_code text,
    p_quantity integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_item_code text := upper(COALESCE(p_item_code, ''));
    v_quantity integer := COALESCE(p_quantity, 1);
    v_price integer;
    v_total_cost integer;
    v_current_gold integer;
    v_new_gold integer;
    v_new_quantity integer;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF v_quantity <= 0 OR v_quantity > 1000 THEN
        RAISE EXCEPTION 'Invalid item quantity';
    END IF;

    SELECT ic.gold_price
    INTO v_price
    FROM public.item_catalog ic
    WHERE ic.item_code = v_item_code
      AND ic.is_enabled = true
    FOR UPDATE;

    IF v_price IS NULL THEN
        RAISE EXCEPTION 'Item not available';
    END IF;

    v_total_cost := v_price * v_quantity;

    SELECT COALESCE(gold, 0)
    INTO v_current_gold
    FROM public.profiles
    WHERE id = v_uid
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;

    IF v_current_gold < v_total_cost THEN
        RAISE EXCEPTION 'Not enough gold';
    END IF;

    UPDATE public.profiles
    SET gold = gold - v_total_cost
    WHERE id = v_uid
    RETURNING gold INTO v_new_gold;

    INSERT INTO public.user_items (user_id, item_code, quantity)
    VALUES (v_uid, v_item_code, v_quantity)
    ON CONFLICT (user_id, item_code)
    DO UPDATE SET
        quantity = public.user_items.quantity + EXCLUDED.quantity,
        updated_at = now()
    RETURNING quantity INTO v_new_quantity;

    PERFORM public.apply_daily_quest_event(v_uid, 'GOLD_SPENT', 1, NULL);

    RETURN jsonb_build_object(
        'item_code', v_item_code,
        'purchased_quantity', v_quantity,
        'new_quantity', v_new_quantity,
        'gold_spent', v_total_cost,
        'gold_balance', v_new_gold
    );
END;
$$;

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

    PERFORM public.apply_daily_quest_event(v_uid, 'GOLD_SPENT', 1, NULL);

    RETURN jsonb_build_object(
        'purchased_quantity', v_quantity,
        'gold_spent', v_price,
        'gold_balance', v_new_gold,
        'pencils', v_new_pencils
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.spend_gold(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purchase_item(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purchase_pencils_with_gold(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spend_gold(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purchase_item(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purchase_pencils_with_gold(integer) TO authenticated, service_role;
