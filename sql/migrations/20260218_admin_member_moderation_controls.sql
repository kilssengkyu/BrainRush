-- Admin controls: role(user/admin) + ban duration/permanent.
-- Also extend get_admin_members output with role and banned_until.

DROP FUNCTION IF EXISTS public.get_admin_members(text, text, text, integer, integer);

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
      p.email,
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


CREATE OR REPLACE FUNCTION public.admin_update_member_moderation(
  p_user_id uuid,
  p_role text DEFAULT NULL,
  p_ban_action text DEFAULT 'keep',
  p_ban_days integer DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  member_role text,
  banned_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text := lower(NULLIF(btrim(COALESCE(p_role, '')), ''));
  v_ban_action text := lower(COALESCE(p_ban_action, 'keep'));
  v_banned_until timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;

  IF COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required';
  END IF;

  IF v_role IS NOT NULL AND v_role NOT IN ('user', 'admin') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;

  IF v_ban_action NOT IN ('keep', 'clear', 'temporary', 'permanent') THEN
    RAISE EXCEPTION 'invalid ban action';
  END IF;

  IF v_ban_action = 'temporary' AND (p_ban_days IS NULL OR p_ban_days <= 0) THEN
    RAISE EXCEPTION 'invalid ban days';
  END IF;

  SELECT u.banned_until INTO v_banned_until
  FROM auth.users u
  WHERE u.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  IF v_ban_action = 'clear' THEN
    v_banned_until := NULL;
  ELSIF v_ban_action = 'temporary' THEN
    v_banned_until := now() + make_interval(days => p_ban_days);
  ELSIF v_ban_action = 'permanent' THEN
    v_banned_until := '9999-12-31 23:59:59+00'::timestamptz;
  END IF;

  UPDATE auth.users u
  SET
    raw_app_meta_data = CASE
      WHEN v_role IS NULL THEN COALESCE(u.raw_app_meta_data, '{}'::jsonb)
      WHEN v_role = 'admin' THEN COALESCE(u.raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
      ELSE COALESCE(u.raw_app_meta_data, '{}'::jsonb) - 'role'
    END,
    banned_until = v_banned_until,
    updated_at = now()
  WHERE u.id = p_user_id;

  RETURN QUERY
  SELECT
    u.id,
    CASE WHEN COALESCE(u.raw_app_meta_data ->> 'role', '') = 'admin' THEN 'admin' ELSE 'user' END AS member_role,
    u.banned_until
  FROM auth.users u
  WHERE u.id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_member_moderation(uuid, text, text, integer) TO authenticated;
