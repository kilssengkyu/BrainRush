-- Allow authenticated admins to manage runtime catalogs.
-- Admin check uses app_metadata.role from JWT.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.game_catalog TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.shop_catalog TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'game_catalog'
      AND policyname = 'Admin can manage game_catalog'
  ) THEN
    CREATE POLICY "Admin can manage game_catalog"
      ON public.game_catalog
      FOR ALL
      TO authenticated
      USING (COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin')
      WITH CHECK (COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shop_catalog'
      AND policyname = 'Admin can manage shop_catalog'
  ) THEN
    CREATE POLICY "Admin can manage shop_catalog"
      ON public.shop_catalog
      FOR ALL
      TO authenticated
      USING (COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin')
      WITH CHECK (COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin');
  END IF;
END $$;
