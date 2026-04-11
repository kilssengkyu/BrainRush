-- Admin upload storage for game/shop catalog icons.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'catalog-icons',
  'catalog-icons',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'catalog_icons_admin_insert'
  ) THEN
    CREATE POLICY "catalog_icons_admin_insert"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'catalog-icons'
        AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'catalog_icons_admin_update'
  ) THEN
    CREATE POLICY "catalog_icons_admin_update"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'catalog-icons'
        AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      )
      WITH CHECK (
        bucket_id = 'catalog-icons'
        AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'catalog_icons_admin_delete'
  ) THEN
    CREATE POLICY "catalog_icons_admin_delete"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'catalog-icons'
        AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'catalog_icons_admin_select'
  ) THEN
    CREATE POLICY "catalog_icons_admin_select"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'catalog-icons'
        AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      );
  END IF;
END $$;
