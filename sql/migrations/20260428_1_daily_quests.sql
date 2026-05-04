-- Daily quest foundation:
-- quest catalog + per-user daily progress + milestone rewards.

CREATE TABLE IF NOT EXISTS public.daily_quest_catalog (
    quest_code text PRIMARY KEY,
    event_type text NOT NULL,
    threshold integer NOT NULL,
    points integer NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    is_enabled boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT daily_quest_catalog_threshold_positive CHECK (threshold > 0),
    CONSTRAINT daily_quest_catalog_points_positive CHECK (points > 0)
);

CREATE TABLE IF NOT EXISTS public.daily_quest_progress (
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    quest_date date NOT NULL,
    quest_code text NOT NULL REFERENCES public.daily_quest_catalog(quest_code) ON DELETE CASCADE,
    progress_count integer NOT NULL DEFAULT 0,
    completed_at timestamptz,
    claimed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, quest_date, quest_code),
    CONSTRAINT daily_quest_progress_count_nonnegative CHECK (progress_count >= 0)
);

CREATE TABLE IF NOT EXISTS public.daily_quest_reward_claims (
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    quest_date date NOT NULL,
    milestone integer NOT NULL,
    reward jsonb NOT NULL DEFAULT '{}'::jsonb,
    claimed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, quest_date, milestone),
    CONSTRAINT daily_quest_reward_milestone_check CHECK (milestone IN (20, 40, 60, 80, 100))
);

CREATE INDEX IF NOT EXISTS idx_daily_quest_catalog_enabled_sort
    ON public.daily_quest_catalog (is_enabled, sort_order, quest_code);

CREATE INDEX IF NOT EXISTS idx_daily_quest_progress_user_date
    ON public.daily_quest_progress (user_id, quest_date);

CREATE INDEX IF NOT EXISTS idx_daily_quest_reward_claims_user_date
    ON public.daily_quest_reward_claims (user_id, quest_date);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'set_daily_quest_catalog_updated_at'
          AND tgrelid = 'public.daily_quest_catalog'::regclass
    ) THEN
        CREATE TRIGGER set_daily_quest_catalog_updated_at
            BEFORE UPDATE ON public.daily_quest_catalog
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at_timestamp();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'set_daily_quest_progress_updated_at'
          AND tgrelid = 'public.daily_quest_progress'::regclass
    ) THEN
        CREATE TRIGGER set_daily_quest_progress_updated_at
            BEFORE UPDATE ON public.daily_quest_progress
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at_timestamp();
    END IF;
END;
$$;

ALTER TABLE public.daily_quest_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quest_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quest_reward_claims ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'daily_quest_catalog'
          AND policyname = 'Anyone can read daily quest catalog'
    ) THEN
        CREATE POLICY "Anyone can read daily quest catalog"
            ON public.daily_quest_catalog
            FOR SELECT
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'daily_quest_progress'
          AND policyname = 'Users can view own daily quest progress'
    ) THEN
        CREATE POLICY "Users can view own daily quest progress"
            ON public.daily_quest_progress
            FOR SELECT
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'daily_quest_reward_claims'
          AND policyname = 'Users can view own daily quest reward claims'
    ) THEN
        CREATE POLICY "Users can view own daily quest reward claims"
            ON public.daily_quest_reward_claims
            FOR SELECT
            USING (auth.uid() = user_id);
    END IF;
END;
$$;

INSERT INTO public.daily_quest_catalog (
    quest_code,
    event_type,
    threshold,
    points,
    sort_order,
    metadata
)
VALUES
    ('DAILY_LOGIN', 'LOGIN', 1, 20, 10, '{"title_key": "dailyQuests.quests.login.title", "description_key": "dailyQuests.quests.login.description"}'::jsonb),
    ('PROFILE_VIEW', 'PROFILE_VIEW', 1, 10, 20, '{"title_key": "dailyQuests.quests.profileView.title", "description_key": "dailyQuests.quests.profileView.description"}'::jsonb),
    ('SHOP_VISIT', 'SHOP_VISIT', 1, 10, 30, '{"title_key": "dailyQuests.quests.shopVisit.title", "description_key": "dailyQuests.quests.shopVisit.description"}'::jsonb),
    ('PENCIL_SPEND_1', 'PENCIL_SPENT', 1, 10, 40, '{"title_key": "dailyQuests.quests.pencilSpend1.title", "description_key": "dailyQuests.quests.pencilSpend1.description"}'::jsonb),
    ('PENCIL_SPEND_3', 'PENCIL_SPENT', 3, 10, 50, '{"title_key": "dailyQuests.quests.pencilSpend3.title", "description_key": "dailyQuests.quests.pencilSpend3.description"}'::jsonb),
    ('PENCIL_SPEND_5', 'PENCIL_SPENT', 5, 20, 60, '{"title_key": "dailyQuests.quests.pencilSpend5.title", "description_key": "dailyQuests.quests.pencilSpend5.description"}'::jsonb),
    ('RANKING_VIEW', 'RANKING_VIEW', 1, 10, 70, '{"title_key": "dailyQuests.quests.rankingView.title", "description_key": "dailyQuests.quests.rankingView.description"}'::jsonb),
    ('GOLD_SPEND_1', 'GOLD_SPENT', 1, 10, 75, '{"title_key": "dailyQuests.quests.goldSpend1.title", "description_key": "dailyQuests.quests.goldSpend1.description"}'::jsonb),
    ('AD_WATCH_1', 'AD_WATCH', 1, 10, 80, '{"title_key": "dailyQuests.quests.adWatch1.title", "description_key": "dailyQuests.quests.adWatch1.description"}'::jsonb),
    ('AD_WATCH_3', 'AD_WATCH', 3, 20, 90, '{"title_key": "dailyQuests.quests.adWatch3.title", "description_key": "dailyQuests.quests.adWatch3.description"}'::jsonb)
ON CONFLICT (quest_code)
DO UPDATE SET
    event_type = EXCLUDED.event_type,
    threshold = EXCLUDED.threshold,
    points = EXCLUDED.points,
    sort_order = EXCLUDED.sort_order,
    metadata = EXCLUDED.metadata,
    is_enabled = true,
    updated_at = now();

UPDATE public.daily_quest_catalog
SET is_enabled = false,
    updated_at = now()
WHERE quest_code = 'PVP_WIN_1';

CREATE OR REPLACE FUNCTION public.get_daily_quest_date(p_user_id uuid)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_timezone text := 'UTC';
BEGIN
    SELECT COALESCE(NULLIF(p.timezone, ''), 'UTC')
    INTO v_timezone
    FROM public.profiles p
    WHERE p.id = p_user_id;

    BEGIN
        RETURN (now() AT TIME ZONE COALESCE(v_timezone, 'UTC'))::date;
    EXCEPTION WHEN OTHERS THEN
        RETURN (now() AT TIME ZONE 'UTC')::date;
    END;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_quest_reward_payload(p_milestone integer)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN CASE p_milestone
        WHEN 20 THEN '{"xp": 15, "gold": 10}'::jsonb
        WHEN 40 THEN '{"gold": 30}'::jsonb
        WHEN 60 THEN '{"pencils": 1}'::jsonb
        WHEN 80 THEN '{"random_item": 1}'::jsonb
        WHEN 100 THEN '{"gold": 50, "xp": 15}'::jsonb
        ELSE '{}'::jsonb
    END;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_daily_quest_event(
    p_user_id uuid,
    p_event_type text,
    p_amount integer DEFAULT 1,
    p_quest_date date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_auth_uid uuid := auth.uid();
    v_event_type text := upper(btrim(COALESCE(p_event_type, '')));
    v_amount integer := COALESCE(p_amount, 1);
    v_quest_date date;
    v_quest record;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User id is required';
    END IF;

    IF v_auth_uid IS NOT NULL AND v_auth_uid <> p_user_id THEN
        RAISE EXCEPTION 'Cannot update daily quests for another user';
    END IF;

    IF v_event_type = '' THEN
        RAISE EXCEPTION 'Event type is required';
    END IF;

    IF v_amount <= 0 OR v_amount > 1000 THEN
        RAISE EXCEPTION 'Invalid quest progress amount';
    END IF;

    v_quest_date := COALESCE(p_quest_date, public.get_daily_quest_date(p_user_id));

    FOR v_quest IN
        SELECT c.quest_code, c.threshold
        FROM public.daily_quest_catalog c
        WHERE c.is_enabled = true
          AND upper(c.event_type) = v_event_type
        ORDER BY c.sort_order, c.quest_code
    LOOP
        INSERT INTO public.daily_quest_progress (
            user_id,
            quest_date,
            quest_code,
            progress_count,
            completed_at
        )
        VALUES (
            p_user_id,
            v_quest_date,
            v_quest.quest_code,
            v_amount,
            CASE WHEN v_amount >= v_quest.threshold THEN now() ELSE NULL END
        )
        ON CONFLICT (user_id, quest_date, quest_code)
        DO UPDATE SET
            progress_count = public.daily_quest_progress.progress_count + EXCLUDED.progress_count,
            completed_at = COALESCE(
                public.daily_quest_progress.completed_at,
                CASE
                    WHEN public.daily_quest_progress.progress_count + EXCLUDED.progress_count >= v_quest.threshold
                    THEN now()
                    ELSE NULL
                END
            ),
            updated_at = now();
    END LOOP;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.record_daily_quest_event(
    p_event_type text,
    p_amount integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    PERFORM public.apply_daily_quest_event(v_uid, p_event_type, p_amount, NULL);
    RETURN public.get_daily_quest_status();
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

GRANT SELECT ON public.daily_quest_catalog TO anon, authenticated;
GRANT SELECT ON public.daily_quest_progress TO authenticated;
GRANT SELECT ON public.daily_quest_reward_claims TO authenticated;

CREATE OR REPLACE FUNCTION public.consume_match_pencil(user_id uuid, p_mode text DEFAULT 'normal')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    current_pencils integer;
BEGIN
    IF auth.uid() IS NULL OR user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot consume pencil of another user';
    END IF;

    IF p_mode = 'rank' AND public.is_rank_burning_time(user_id::text) THEN
        RETURN true;
    END IF;

    SELECT p.pencils
    INTO current_pencils
    FROM public.profiles p
    WHERE p.id = user_id;

    IF current_pencils > 0 THEN
        UPDATE public.profiles
        SET pencils = pencils - 1,
            last_recharge_at = CASE WHEN pencils = 5 THEN now() ELSE last_recharge_at END
        WHERE id = user_id;

        PERFORM public.apply_daily_quest_event(user_id, 'PENCIL_SPENT', 1, NULL);

        RETURN true;
    END IF;

    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.reward_ad_pencils(user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    new_count integer;
    current_count integer;
    current_day date;
BEGIN
    IF auth.uid() IS NULL OR user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot reward pencils for another user';
    END IF;

    SELECT p.ad_reward_count, p.ad_reward_day
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
    SET pencils = pencils + 1,
        ad_reward_count = current_count + 1,
        ad_reward_day = current_day
    WHERE id = user_id
    RETURNING pencils INTO new_count;

    PERFORM public.apply_daily_quest_event(user_id, 'AD_WATCH', 1, NULL);

    RETURN new_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.reward_ad_practice_notes(user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    new_count integer;
    current_count integer;
    current_day date;
BEGIN
    IF auth.uid() IS NULL OR user_id != auth.uid() THEN
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

    PERFORM public.apply_daily_quest_event(user_id, 'AD_WATCH', 1, NULL);

    RETURN new_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_match_pencil(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reward_ad_pencils(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reward_ad_practice_notes(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.consume_match_pencil(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reward_ad_pencils(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reward_ad_practice_notes(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_daily_quest_date(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_daily_quest_reward_payload(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_daily_quest_event(uuid, text, integer, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_daily_quest_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_daily_quest_event(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_daily_quest_points(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_daily_quest_reward(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_daily_quest_date(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_daily_quest_reward_payload(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_daily_quest_event(uuid, text, integer, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_daily_quest_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_daily_quest_event(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_daily_quest_points(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_daily_quest_reward(integer) TO authenticated, service_role;
