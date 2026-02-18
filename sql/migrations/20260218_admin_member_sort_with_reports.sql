-- Admin member list with report_count and server-side sorting/filtering.

CREATE OR REPLACE FUNCTION public.get_admin_members(
  p_search text DEFAULT NULL,
  p_sort_by text DEFAULT 'created_at',
  p_sort_order text DEFAULT 'desc',
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  nickname text,
  email text,
  country text,
  mmr integer,
  level integer,
  avatar_url text,
  created_at timestamptz,
  last_seen timestamptz,
  needs_nickname_setup boolean,
  report_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_sort_by text := lower(COALESCE(p_sort_by, 'created_at'));
  v_sort_order text := lower(COALESCE(p_sort_order, 'desc'));
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;

  IF COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  IF v_sort_by NOT IN ('created_at', 'last_seen', 'mmr', 'level', 'nickname', 'report_count') THEN
    v_sort_by := 'created_at';
  END IF;

  IF v_sort_order NOT IN ('asc', 'desc') THEN
    v_sort_order := 'desc';
  END IF;

  RETURN QUERY
  WITH report_agg AS (
    SELECT pr.reported_user_id, COUNT(*)::bigint AS report_count
    FROM public.player_reports pr
    GROUP BY pr.reported_user_id
  ), base AS (
    SELECT
      p.id,
      p.nickname,
      p.email,
      p.country,
      p.mmr,
      p.level,
      p.avatar_url,
      p.created_at,
      p.last_seen,
      p.needs_nickname_setup,
      COALESCE(ra.report_count, 0)::bigint AS report_count
    FROM public.profiles p
    LEFT JOIN report_agg ra ON ra.reported_user_id = p.id
    WHERE (
      v_search IS NULL
      OR lower(COALESCE(p.nickname, '')) LIKE '%' || lower(v_search) || '%'
      OR lower(COALESCE(p.email, '')) LIKE '%' || lower(v_search) || '%'
      OR p.id::text LIKE '%' || v_search || '%'
    )
  )
  SELECT
    b.id,
    b.nickname,
    b.email,
    b.country,
    b.mmr,
    b.level,
    b.avatar_url,
    b.created_at,
    b.last_seen,
    b.needs_nickname_setup,
    b.report_count
  FROM base b
  ORDER BY
    CASE WHEN v_sort_by = 'report_count' AND v_sort_order = 'asc' THEN b.report_count END ASC,
    CASE WHEN v_sort_by = 'report_count' AND v_sort_order = 'desc' THEN b.report_count END DESC,

    CASE WHEN v_sort_by = 'created_at' AND v_sort_order = 'asc' THEN b.created_at END ASC,
    CASE WHEN v_sort_by = 'created_at' AND v_sort_order = 'desc' THEN b.created_at END DESC,

    CASE WHEN v_sort_by = 'last_seen' AND v_sort_order = 'asc' THEN b.last_seen END ASC,
    CASE WHEN v_sort_by = 'last_seen' AND v_sort_order = 'desc' THEN b.last_seen END DESC,

    CASE WHEN v_sort_by = 'mmr' AND v_sort_order = 'asc' THEN b.mmr END ASC,
    CASE WHEN v_sort_by = 'mmr' AND v_sort_order = 'desc' THEN b.mmr END DESC,

    CASE WHEN v_sort_by = 'level' AND v_sort_order = 'asc' THEN b.level END ASC,
    CASE WHEN v_sort_by = 'level' AND v_sort_order = 'desc' THEN b.level END DESC,

    CASE WHEN v_sort_by = 'nickname' AND v_sort_order = 'asc' THEN lower(COALESCE(b.nickname, '')) END ASC,
    CASE WHEN v_sort_by = 'nickname' AND v_sort_order = 'desc' THEN lower(COALESCE(b.nickname, '')) END DESC,

    b.created_at DESC,
    b.id ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_members(text, text, text, integer, integer) TO authenticated;
