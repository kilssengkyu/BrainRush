-- Shop catalog for runtime visibility controls.
CREATE TABLE IF NOT EXISTS public.shop_catalog (
  product_id text PRIMARY KEY,
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_catalog ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shop_catalog'
      AND policyname = 'Anyone can read shop_catalog'
  ) THEN
    CREATE POLICY "Anyone can read shop_catalog"
      ON public.shop_catalog
      FOR SELECT
      USING (true);
  END IF;
END $$;

WITH default_items(product_id, is_enabled, sort_order) AS (
  VALUES
    ('remove_ads', true, 10),
    ('nickname_change_ticket', true, 20),
    ('nickname_ticket', false, 21),
    ('pencils_5', true, 30),
    ('pencils_20', true, 40),
    ('pencil_20', true, 41),
    ('pencils_100', true, 50),
    ('pencil_100', true, 51),
    ('practice_notes_10', true, 60),
    ('practice_note_10', true, 61),
    ('practice_notes_20', true, 70),
    ('practice_note_20', true, 71),
    ('practice_notes_100', true, 80),
    ('practice_note_100', true, 81)
)
INSERT INTO public.shop_catalog (product_id, is_enabled, sort_order, updated_at)
SELECT
  di.product_id,
  di.is_enabled,
  di.sort_order,
  now()
FROM default_items di
ON CONFLICT (product_id) DO UPDATE
SET
  is_enabled = EXCLUDED.is_enabled,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
