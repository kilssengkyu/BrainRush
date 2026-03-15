-- Admin-managed announcements for home popup.

BEGIN;

CREATE TABLE IF NOT EXISTS public.announcements (
  id bigserial PRIMARY KEY,
  title text NOT NULL,
  content text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcements_valid_window CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_announcements_active_window
  ON public.announcements (is_active, starts_at DESC, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_announcements_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_announcements_updated_at ON public.announcements;

CREATE TRIGGER trg_set_announcements_updated_at
BEFORE UPDATE ON public.announcements
FOR EACH ROW
EXECUTE FUNCTION public.set_announcements_updated_at();

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.announcements TO authenticated;
GRANT SELECT ON TABLE public.announcements TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.announcements_id_seq TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'announcements'
      AND policyname = 'Public can read active announcements'
  ) THEN
    CREATE POLICY "Public can read active announcements"
      ON public.announcements
      FOR SELECT
      TO anon, authenticated
      USING (
        is_active = true
        AND starts_at <= now()
        AND (ends_at IS NULL OR ends_at >= now())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'announcements'
      AND policyname = 'Admin can manage announcements'
  ) THEN
    CREATE POLICY "Admin can manage announcements"
      ON public.announcements
      FOR ALL
      TO authenticated
      USING (COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin')
      WITH CHECK (COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin');
  END IF;
END $$;

COMMIT;
