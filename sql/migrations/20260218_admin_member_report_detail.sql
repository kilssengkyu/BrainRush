-- Admin detail: report reasons for a specific member.

CREATE OR REPLACE FUNCTION public.get_admin_member_reports(
  p_reported_user_id uuid,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  session_id uuid,
  reason text,
  created_at timestamptz,
  reporter_id uuid,
  reporter_nickname text,
  reporter_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;

  IF COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  IF p_reported_user_id IS NULL THEN
    RAISE EXCEPTION 'reported user required';
  END IF;

  RETURN QUERY
  SELECT
    pr.id,
    pr.session_id,
    pr.reason,
    pr.created_at,
    pr.reporter_id,
    rp.nickname AS reporter_nickname,
    rp.email AS reporter_email
  FROM public.player_reports pr
  LEFT JOIN public.profiles rp ON rp.id = pr.reporter_id
  WHERE pr.reported_user_id = p_reported_user_id
  ORDER BY pr.created_at DESC, pr.id DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_member_reports(uuid, integer, integer) TO authenticated;
