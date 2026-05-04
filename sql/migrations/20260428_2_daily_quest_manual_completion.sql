-- Daily quest manual completion:
-- completed_at means the condition is ready, claimed_at means the player tapped complete and earned points.

ALTER TABLE public.daily_quest_progress
ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE OR REPLACE FUNCTION public.get_daily_quest_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_quest_date date;
    v_total_points integer := 0;
    v_quests jsonb := '[]'::jsonb;
    v_rewards jsonb := '[]'::jsonb;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    v_quest_date := public.get_daily_quest_date(v_uid);
    PERFORM public.apply_daily_quest_event(v_uid, 'LOGIN', 1, v_quest_date);

    SELECT COALESCE(SUM(c.points), 0)
    INTO v_total_points
    FROM public.daily_quest_catalog c
    JOIN public.daily_quest_progress p
      ON p.quest_code = c.quest_code
     AND p.user_id = v_uid
     AND p.quest_date = v_quest_date
    WHERE c.is_enabled = true
      AND p.claimed_at IS NOT NULL;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'quest_code', c.quest_code,
                'event_type', c.event_type,
                'threshold', c.threshold,
                'points', c.points,
                'sort_order', c.sort_order,
                'progress_count', LEAST(COALESCE(p.progress_count, 0), c.threshold),
                'completed', p.completed_at IS NOT NULL,
                'completed_at', p.completed_at,
                'claimed', p.claimed_at IS NOT NULL,
                'claimed_at', p.claimed_at,
                'can_claim_points', p.completed_at IS NOT NULL AND p.claimed_at IS NULL,
                'metadata', c.metadata
            )
            ORDER BY c.sort_order, c.quest_code
        ),
        '[]'::jsonb
    )
    INTO v_quests
    FROM public.daily_quest_catalog c
    LEFT JOIN public.daily_quest_progress p
      ON p.quest_code = c.quest_code
     AND p.user_id = v_uid
     AND p.quest_date = v_quest_date
    WHERE c.is_enabled = true;

    WITH reward_milestones(milestone) AS (
        VALUES (20), (40), (60), (80), (100)
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'milestone', rm.milestone,
                'reward', public.get_daily_quest_reward_payload(rm.milestone),
                'claimed', rc.claimed_at IS NOT NULL,
                'claimed_at', rc.claimed_at,
                'can_claim', v_total_points >= rm.milestone AND rc.claimed_at IS NULL
            )
            ORDER BY rm.milestone
        ),
        '[]'::jsonb
    )
    INTO v_rewards
    FROM reward_milestones rm
    LEFT JOIN public.daily_quest_reward_claims rc
      ON rc.user_id = v_uid
     AND rc.quest_date = v_quest_date
     AND rc.milestone = rm.milestone;

    RETURN jsonb_build_object(
        'quest_date', v_quest_date,
        'total_points', v_total_points,
        'quests', v_quests,
        'rewards', v_rewards
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_daily_quest_points(p_quest_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_quest_code text := upper(btrim(COALESCE(p_quest_code, '')));
    v_quest_date date;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF v_quest_code = '' THEN
        RAISE EXCEPTION 'Quest code is required';
    END IF;

    v_quest_date := public.get_daily_quest_date(v_uid);

    UPDATE public.daily_quest_progress p
    SET claimed_at = now(),
        updated_at = now()
    FROM public.daily_quest_catalog c
    WHERE p.quest_code = c.quest_code
      AND p.user_id = v_uid
      AND p.quest_date = v_quest_date
      AND p.quest_code = v_quest_code
      AND c.is_enabled = true
      AND p.completed_at IS NOT NULL
      AND p.claimed_at IS NULL;

    IF NOT FOUND THEN
        IF EXISTS (
            SELECT 1
            FROM public.daily_quest_progress p
            WHERE p.user_id = v_uid
              AND p.quest_date = v_quest_date
              AND p.quest_code = v_quest_code
              AND p.claimed_at IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'Daily quest already claimed';
        END IF;

        RAISE EXCEPTION 'Daily quest is not ready';
    END IF;

    RETURN public.get_daily_quest_status();
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_daily_quest_reward(p_milestone integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_quest_date date;
    v_total_points integer := 0;
    v_reward jsonb;
    v_xp integer := 0;
    v_gold integer := 0;
    v_pencils integer := 0;
    v_random_items integer := 0;
    v_item_code text;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_milestone NOT IN (20, 40, 60, 80, 100) THEN
        RAISE EXCEPTION 'Invalid daily quest milestone';
    END IF;

    v_quest_date := public.get_daily_quest_date(v_uid);
    PERFORM public.apply_daily_quest_event(v_uid, 'LOGIN', 1, v_quest_date);

    SELECT COALESCE(SUM(c.points), 0)
    INTO v_total_points
    FROM public.daily_quest_catalog c
    JOIN public.daily_quest_progress p
      ON p.quest_code = c.quest_code
     AND p.user_id = v_uid
     AND p.quest_date = v_quest_date
    WHERE c.is_enabled = true
      AND p.claimed_at IS NOT NULL;

    IF v_total_points < p_milestone THEN
        RAISE EXCEPTION 'Daily quest milestone is not ready';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.daily_quest_reward_claims rc
        WHERE rc.user_id = v_uid
          AND rc.quest_date = v_quest_date
          AND rc.milestone = p_milestone
    ) THEN
        RAISE EXCEPTION 'Daily quest reward already claimed';
    END IF;

    v_reward := public.get_daily_quest_reward_payload(p_milestone);
    v_xp := COALESCE((v_reward->>'xp')::integer, 0);
    v_gold := COALESCE((v_reward->>'gold')::integer, 0);
    v_pencils := COALESCE((v_reward->>'pencils')::integer, 0);
    v_random_items := COALESCE((v_reward->>'random_item')::integer, 0);

    PERFORM 1
    FROM public.profiles p
    WHERE p.id = v_uid
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;

    IF v_xp > 0 OR v_gold > 0 OR v_pencils > 0 THEN
        UPDATE public.profiles
        SET xp = COALESCE(xp, 0) + v_xp,
            level = CASE
                WHEN v_xp > 0 THEN floor((-(45)::numeric + sqrt((45 * 45) + (40 * (COALESCE(xp, 0) + v_xp)))) / 10) + 1
                ELSE level
            END,
            gold = COALESCE(gold, 0) + v_gold,
            pencils = COALESCE(pencils, 0) + v_pencils
        WHERE id = v_uid;
    END IF;

    IF v_random_items > 0 THEN
        SELECT ic.item_code
        INTO v_item_code
        FROM public.item_catalog ic
        WHERE ic.is_enabled = true
        ORDER BY random()
        LIMIT 1;

        IF v_item_code IS NOT NULL THEN
            INSERT INTO public.user_items (user_id, item_code, quantity)
            VALUES (v_uid, v_item_code, v_random_items)
            ON CONFLICT (user_id, item_code)
            DO UPDATE SET
                quantity = public.user_items.quantity + EXCLUDED.quantity,
                updated_at = now();

            v_reward := v_reward || jsonb_build_object('item_code', v_item_code);
        END IF;
    END IF;

    INSERT INTO public.daily_quest_reward_claims (user_id, quest_date, milestone, reward)
    VALUES (v_uid, v_quest_date, p_milestone, v_reward);

    RETURN jsonb_build_object(
        'milestone', p_milestone,
        'reward', v_reward,
        'status', public.get_daily_quest_status()
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_daily_quest_points(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_daily_quest_points(text) TO authenticated, service_role;
