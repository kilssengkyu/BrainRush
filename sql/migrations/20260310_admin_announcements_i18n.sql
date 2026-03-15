-- Add i18n translations for announcements.

BEGIN;

CREATE TABLE IF NOT EXISTS public.announcement_translations (
  id bigserial PRIMARY KEY,
  announcement_id bigint NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  locale text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcement_translations_unique_locale UNIQUE (announcement_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_announcement_translations_announcement_id
  ON public.announcement_translations (announcement_id);

CREATE INDEX IF NOT EXISTS idx_announcement_translations_locale
  ON public.announcement_translations (locale);

-- Move legacy title/content into Korean translation rows.
INSERT INTO public.announcement_translations (announcement_id, locale, title, content)
SELECT a.id, 'ko', a.title, a.content
FROM public.announcements a
WHERE COALESCE(a.title, '') <> '' AND COALESCE(a.content, '') <> ''
ON CONFLICT (announcement_id, locale)
DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  updated_at = now();

-- Keep legacy columns optional for backward compatibility.
ALTER TABLE public.announcements
  ALTER COLUMN title DROP NOT NULL,
  ALTER COLUMN content DROP NOT NULL;

ALTER TABLE public.announcement_translations ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.announcement_translations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.announcement_translations TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.announcement_translations_id_seq TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'announcement_translations'
      AND policyname = 'Public can read announcement translations'
  ) THEN
    CREATE POLICY "Public can read announcement translations"
      ON public.announcement_translations
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'announcement_translations'
      AND policyname = 'Admin can manage announcement translations'
  ) THEN
    CREATE POLICY "Admin can manage announcement translations"
      ON public.announcement_translations
      FOR ALL
      TO authenticated
      USING (COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin')
      WITH CHECK (COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_announcement_translations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_announcement_translations_updated_at ON public.announcement_translations;

CREATE TRIGGER trg_set_announcement_translations_updated_at
BEFORE UPDATE ON public.announcement_translations
FOR EACH ROW
EXECUTE FUNCTION public.set_announcement_translations_updated_at();

COMMIT;
