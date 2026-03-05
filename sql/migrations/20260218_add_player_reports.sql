-- Player report system: store per-report records with reason text.

CREATE TABLE IF NOT EXISTS public.player_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NULL REFERENCES public.game_sessions(id) ON DELETE SET NULL,
  reason text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT player_reports_reason_length CHECK (char_length(btrim(reason)) BETWEEN 3 AND 300),
  CONSTRAINT player_reports_not_self CHECK (reporter_id <> reported_user_id)
);

CREATE INDEX IF NOT EXISTS idx_player_reports_reported_created_at
  ON public.player_reports (reported_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_player_reports_reporter_created_at
  ON public.player_reports (reporter_id, created_at DESC);

ALTER TABLE public.player_reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'player_reports'
      AND policyname = 'player_reports_insert_own'
  ) THEN
    CREATE POLICY player_reports_insert_own
      ON public.player_reports
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = reporter_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.submit_player_report(
  p_reported_user_id uuid,
  p_session_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_reason text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;

  IF p_reported_user_id IS NULL THEN
    RAISE EXCEPTION 'reported user required';
  END IF;

  IF auth.uid() = p_reported_user_id THEN
    RAISE EXCEPTION 'cannot report yourself';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF char_length(v_reason) < 3 OR char_length(v_reason) > 300 THEN
    RAISE EXCEPTION 'reason must be between 3 and 300 characters';
  END IF;

  INSERT INTO public.player_reports (reporter_id, reported_user_id, session_id, reason)
  VALUES (auth.uid(), p_reported_user_id, p_session_id, v_reason)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_player_report(uuid, uuid, text) TO authenticated;
