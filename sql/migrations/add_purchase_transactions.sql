-- Track purchases server-side to prevent duplicate grants
CREATE TABLE IF NOT EXISTS public.purchase_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    original_transaction_id TEXT,
    store_environment TEXT,
    store_payload JSONB,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (platform, transaction_id)
);

ALTER TABLE public.purchase_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'purchase_transactions'
          AND policyname = 'purchase_transactions_select_own'
    ) THEN
        CREATE POLICY "purchase_transactions_select_own"
        ON public.purchase_transactions
        FOR SELECT
        USING (user_id = auth.uid());
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'purchase_transactions'
          AND policyname = 'purchase_transactions_insert_own'
    ) THEN
        CREATE POLICY "purchase_transactions_insert_own"
        ON public.purchase_transactions
        FOR INSERT
        WITH CHECK (user_id = auth.uid());
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'purchase_transactions'
          AND policyname = 'purchase_transactions_update_own'
    ) THEN
        CREATE POLICY "purchase_transactions_update_own"
        ON public.purchase_transactions
        FOR UPDATE
        USING (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid());
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_purchase(
    p_user_id UUID,
    p_product_id TEXT,
    p_platform TEXT,
    p_transaction_id TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    inserted BOOLEAN := FALSE;
BEGIN
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot record purchase for another user';
    END IF;

    INSERT INTO public.purchase_transactions (user_id, product_id, platform, transaction_id)
    VALUES (p_user_id, p_product_id, p_platform, p_transaction_id)
    ON CONFLICT (platform, transaction_id) DO NOTHING;

    GET DIAGNOSTICS inserted = ROW_COUNT;
    RETURN inserted;
END;
$$;
