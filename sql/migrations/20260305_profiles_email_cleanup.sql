-- Remove runtime dependencies on profiles.email after column drop.

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
AS $$
begin
  insert into public.profiles (id, full_name, avatar_url, nickname, needs_nickname_setup)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    'Player_' || floor(random() * 9000 + 1000)::text,
    true
  );
  return new;
end;
$$;

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
  report_count bigint,
  member_role text,
  banned_until timestamptz
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
      p.country,
      p.mmr,
      p.level,
      p.avatar_url,
      p.created_at,
      p.last_seen,
      p.needs_nickname_setup,
      COALESCE(ra.report_count, 0)::bigint AS report_count,
      CASE WHEN COALESCE(au.raw_app_meta_data ->> 'role', '') = 'admin' THEN 'admin' ELSE 'user' END AS member_role,
      au.banned_until
    FROM public.profiles p
    JOIN auth.users au ON au.id = p.id
    LEFT JOIN report_agg ra ON ra.reported_user_id = p.id
    WHERE (
      v_search IS NULL
      OR lower(COALESCE(p.nickname, '')) LIKE '%' || lower(v_search) || '%'
      OR p.id::text LIKE '%' || v_search || '%'
    )
  )
  SELECT
    b.id,
    b.nickname,
    NULL::text AS email,
    b.country,
    b.mmr,
    b.level,
    b.avatar_url,
    b.created_at,
    b.last_seen,
    b.needs_nickname_setup,
    b.report_count,
    b.member_role,
    b.banned_until
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
    NULL::text AS reporter_email
  FROM public.player_reports pr
  LEFT JOIN public.profiles rp ON rp.id = pr.reporter_id
  WHERE pr.reported_user_id = p_reported_user_id
  ORDER BY pr.created_at DESC, pr.id DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;
