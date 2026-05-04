-- Item mode foundation:
-- gold currency + item catalog + per-user inventory.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS gold integer NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'profiles_gold_nonnegative'
          AND conrelid = 'public.profiles'::regclass
    ) THEN
        ALTER TABLE public.profiles
        ADD CONSTRAINT profiles_gold_nonnegative CHECK (gold >= 0);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.item_catalog (
    item_code text PRIMARY KEY,
    name_key text NOT NULL,
    description_key text NOT NULL,
    effect_type text NOT NULL,
    target_type text NOT NULL,
    cooldown_seconds integer NOT NULL DEFAULT 6,
    duration_seconds integer NOT NULL DEFAULT 0,
    gold_price integer NOT NULL DEFAULT 0,
    is_enabled boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT item_catalog_effect_type_check CHECK (effect_type IN ('screen_block', 'auto_solve', 'emoji_bomb')),
    CONSTRAINT item_catalog_target_type_check CHECK (target_type IN ('self', 'opponent')),
    CONSTRAINT item_catalog_cooldown_nonnegative CHECK (cooldown_seconds >= 0),
    CONSTRAINT item_catalog_duration_nonnegative CHECK (duration_seconds >= 0),
    CONSTRAINT item_catalog_gold_price_nonnegative CHECK (gold_price >= 0)
);

CREATE TABLE IF NOT EXISTS public.user_items (
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    item_code text NOT NULL REFERENCES public.item_catalog(item_code) ON DELETE RESTRICT,
    quantity integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item_code),
    CONSTRAINT user_items_quantity_nonnegative CHECK (quantity >= 0)
);

CREATE INDEX IF NOT EXISTS idx_item_catalog_enabled_sort
    ON public.item_catalog (is_enabled, sort_order, item_code);

CREATE INDEX IF NOT EXISTS idx_user_items_user_id
    ON public.user_items (user_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'set_item_catalog_updated_at'
          AND tgrelid = 'public.item_catalog'::regclass
    ) THEN
        CREATE TRIGGER set_item_catalog_updated_at
            BEFORE UPDATE ON public.item_catalog
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at_timestamp();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'set_user_items_updated_at'
          AND tgrelid = 'public.user_items'::regclass
    ) THEN
        CREATE TRIGGER set_user_items_updated_at
            BEFORE UPDATE ON public.user_items
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at_timestamp();
    END IF;
END;
$$;

ALTER TABLE public.item_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'item_catalog'
          AND policyname = 'Anyone can read item_catalog'
    ) THEN
        CREATE POLICY "Anyone can read item_catalog"
            ON public.item_catalog
            FOR SELECT
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_items'
          AND policyname = 'Users can view own items'
    ) THEN
        CREATE POLICY "Users can view own items"
            ON public.user_items
            FOR SELECT
            USING (auth.uid() = user_id);
    END IF;
END;
$$;

INSERT INTO public.item_catalog (
    item_code,
    name_key,
    description_key,
    effect_type,
    target_type,
    cooldown_seconds,
    duration_seconds,
    gold_price,
    is_enabled,
    sort_order,
    metadata
)
VALUES
    (
        'SCREEN_BLOCK',
        'items.screenBlock.name',
        'items.screenBlock.description',
        'screen_block',
        'opponent',
        6,
        2,
        100,
        true,
        1,
        jsonb_build_object('overlay_alpha', 0.78)
    ),
    (
        'AUTO_SOLVE',
        'items.autoSolve.name',
        'items.autoSolve.description',
        'auto_solve',
        'self',
        6,
        0,
        120,
        true,
        2,
        '{}'::jsonb
    ),
    (
        'EMOJI_BOMB',
        'items.emojiBomb.name',
        'items.emojiBomb.description',
        'emoji_bomb',
        'opponent',
        6,
        5,
        90,
        true,
        3,
        jsonb_build_object('emoji_count', 14)
    )
ON CONFLICT (item_code)
DO UPDATE SET
    name_key = EXCLUDED.name_key,
    description_key = EXCLUDED.description_key,
    effect_type = EXCLUDED.effect_type,
    target_type = EXCLUDED.target_type,
    cooldown_seconds = EXCLUDED.cooldown_seconds,
    duration_seconds = EXCLUDED.duration_seconds,
    gold_price = EXCLUDED.gold_price,
    is_enabled = EXCLUDED.is_enabled,
    sort_order = EXCLUDED.sort_order,
    metadata = EXCLUDED.metadata,
    updated_at = now();
