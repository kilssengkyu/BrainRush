-- Migration: add_avatar_storage.sql
-- Public avatar bucket with owner-only write/delete

-- 1) Ensure avatars bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2) RLS for storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;

CREATE POLICY "avatars_insert_own"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "avatars_update_own"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "avatars_delete_own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);
