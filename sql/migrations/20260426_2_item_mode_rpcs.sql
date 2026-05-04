-- Item mode RPCs:
-- gold grant/spend + item grant/purchase/use + in-session item event log.

CREATE TABLE IF NOT EXISTS public.game_session_item_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
    round_number integer NOT NULL,
    used_by text NOT NULL,
    target_player_id text NOT NULL,
    item_code text NOT NULL REFERENCES public.item_catalog(item_code) ON DELETE RESTRICT,
    used_at timestamptz NOT NULL DEFAULT now(),
    effect_ends_at timestamptz,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT game_session_item_events_round_positive CHECK (round_number > 0)
);

CREATE INDEX IF NOT EXISTS idx_game_session_item_events_session_round_used_at
    ON public.game_session_item_events (session_id, round_number, used_at DESC);

CREATE INDEX IF NOT EXISTS idx_game_session_item_events_session_created_at
    ON public.game_session_item_events (session_id, created_at DESC);

ALTER TABLE public.game_session_item_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'game_session_item_events'
          AND policyname = 'Participants can read own session item events'
    ) THEN
        CREATE POLICY "Participants can read own session item events"
            ON public.game_session_item_events
            FOR SELECT
            USING (
                EXISTS (
                    SELECT 1
                    FROM public.game_sessions gs
                    WHERE gs.id = game_session_item_events.session_id
                      AND auth.uid() IS NOT NULL
                      AND (gs.player1_id = auth.uid()::text OR gs.player2_id = auth.uid()::text)
                )
            );
    END IF;
END;
$$;

GRANT SELECT ON public.item_catalog TO anon, authenticated;
GRANT SELECT ON public.user_items TO authenticated;
GRANT SELECT ON public.game_session_item_events TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_gold(user_id uuid, amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_new_gold integer;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF user_id <> auth.uid() THEN
        RAISE EXCEPTION 'Cannot grant gold for another user';
    END IF;

    IF amount IS NULL OR amount <= 0 OR amount > 1000000 THEN
        RAISE EXCEPTION 'Invalid gold amount';
    END IF;

    UPDATE public.profiles
    SET gold = COALESCE(gold, 0) + amount
    WHERE id = user_id
    RETURNING gold INTO v_new_gold;

    IF v_new_gold IS NULL THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;

    RETURN v_new_gold;
END;
$$;

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

    RETURN v_new_gold;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_user_item(
    p_user_id uuid,
    p_item_code text,
    p_quantity integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_item_code text := upper(COALESCE(p_item_code, ''));
    v_new_quantity integer;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_user_id <> auth.uid() THEN
        RAISE EXCEPTION 'Cannot grant items for another user';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity > 1000 THEN
        RAISE EXCEPTION 'Invalid item quantity';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.item_catalog ic
        WHERE ic.item_code = v_item_code
          AND ic.is_enabled = true
    ) THEN
        RAISE EXCEPTION 'Item not available';
    END IF;

    INSERT INTO public.user_items (user_id, item_code, quantity)
    VALUES (p_user_id, v_item_code, p_quantity)
    ON CONFLICT (user_id, item_code)
    DO UPDATE SET
        quantity = public.user_items.quantity + EXCLUDED.quantity,
        updated_at = now()
    RETURNING quantity INTO v_new_quantity;

    RETURN v_new_quantity;
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

    RETURN jsonb_build_object(
        'item_code', v_item_code,
        'purchased_quantity', v_quantity,
        'new_quantity', v_new_quantity,
        'gold_spent', v_total_cost,
        'gold_balance', v_new_gold
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.use_match_item(
    p_room_id uuid,
    p_item_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_item_code text := upper(COALESCE(p_item_code, ''));
    v_session record;
    v_item record;
    v_target_player_id text;
    v_round_number integer;
    v_quantity integer;
    v_effect_ends_at timestamptz;
    v_event_id uuid;
    v_now timestamptz := now();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT *
    INTO v_session
    FROM public.game_sessions gs
    WHERE gs.id = p_room_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found';
    END IF;

    IF v_session.mode <> 'normal' THEN
        RAISE EXCEPTION 'Items can only be used in item mode';
    END IF;

    IF v_session.status <> 'playing' THEN
        RAISE EXCEPTION 'Items can only be used while playing';
    END IF;

    IF v_session.player1_id <> v_uid::text AND v_session.player2_id <> v_uid::text THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT *
    INTO v_item
    FROM public.item_catalog ic
    WHERE ic.item_code = v_item_code
      AND ic.is_enabled = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item not available';
    END IF;

    v_target_player_id := CASE
        WHEN v_item.target_type = 'self' THEN v_uid::text
        WHEN v_session.player1_id = v_uid::text THEN v_session.player2_id
        ELSE v_session.player1_id
    END;

    v_round_number := COALESCE(v_session.current_round_index, 0) + 1;

    SELECT quantity
    INTO v_quantity
    FROM public.user_items ui
    WHERE ui.user_id = v_uid
      AND ui.item_code = v_item_code
    FOR UPDATE;

    IF COALESCE(v_quantity, 0) <= 0 THEN
        RAISE EXCEPTION 'Item not owned';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.game_session_item_events e
        WHERE e.session_id = p_room_id
          AND e.round_number = v_round_number
          AND e.used_by = v_uid::text
          AND e.used_at > (v_now - make_interval(secs => v_item.cooldown_seconds))
    ) THEN
        RAISE EXCEPTION 'Item is on cooldown';
    END IF;

    v_effect_ends_at := CASE
        WHEN COALESCE(v_item.duration_seconds, 0) > 0 THEN v_now + make_interval(secs => v_item.duration_seconds)
        ELSE NULL
    END;

    UPDATE public.user_items
    SET quantity = quantity - 1,
        updated_at = now()
    WHERE user_id = v_uid
      AND item_code = v_item_code;

    INSERT INTO public.game_session_item_events (
        session_id,
        round_number,
        used_by,
        target_player_id,
        item_code,
        used_at,
        effect_ends_at,
        payload
    )
    VALUES (
        p_room_id,
        v_round_number,
        v_uid::text,
        v_target_player_id,
        v_item_code,
        v_now,
        v_effect_ends_at,
        jsonb_build_object(
            'effect_type', v_item.effect_type,
            'target_type', v_item.target_type,
            'cooldown_seconds', v_item.cooldown_seconds,
            'duration_seconds', v_item.duration_seconds,
            'metadata', COALESCE(v_item.metadata, '{}'::jsonb)
        )
    )
    RETURNING id INTO v_event_id;

    RETURN jsonb_build_object(
        'event_id', v_event_id,
        'room_id', p_room_id,
        'round_number', v_round_number,
        'item_code', v_item_code,
        'used_by', v_uid::text,
        'target_player_id', v_target_player_id,
        'used_at', v_now,
        'effect_ends_at', v_effect_ends_at,
        'remaining_quantity', v_quantity - 1,
        'payload', jsonb_build_object(
            'effect_type', v_item.effect_type,
            'target_type', v_item.target_type,
            'cooldown_seconds', v_item.cooldown_seconds,
            'duration_seconds', v_item.duration_seconds,
            'metadata', COALESCE(v_item.metadata, '{}'::jsonb)
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_gold(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.spend_gold(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.grant_user_item(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purchase_item(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.use_match_item(uuid, text) TO authenticated, service_role;
