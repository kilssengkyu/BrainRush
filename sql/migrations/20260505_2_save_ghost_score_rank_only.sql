-- Keep item-mode scores out of bot ghost replay data.
-- Normal mode is currently item mode, where score-multiplying items can distort timelines.

CREATE OR REPLACE FUNCTION public.save_ghost_score(
  p_room_id uuid,
  p_game_type text,
  p_timeline jsonb,
  p_final_score int
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller text;
  v_p1 text;
  v_p2 text;
  v_session_type text;
  v_status text;
  v_mode text;
BEGIN
  v_caller := auth.uid()::text;
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_final_score <= 0 OR p_final_score > 50000 THEN
    RETURN;
  END IF;

  IF p_timeline IS NULL OR jsonb_typeof(p_timeline) <> 'array' OR jsonb_array_length(p_timeline) = 0 THEN
    RETURN;
  END IF;

  SELECT player1_id, player2_id, game_type, status, mode
  INTO v_p1, v_p2, v_session_type, v_status, v_mode
  FROM public.game_sessions
  WHERE id = p_room_id;

  IF v_p1 IS NULL THEN
    RETURN;
  END IF;

  IF v_mode IS DISTINCT FROM 'rank' THEN
    RETURN;
  END IF;

  IF v_caller <> v_p1 AND v_caller <> v_p2 THEN
    RETURN;
  END IF;

  IF v_session_type <> p_game_type THEN
    RETURN;
  END IF;

  INSERT INTO public.ghost_scores (game_type, score_timeline, final_score, session_id)
  VALUES (p_game_type, p_timeline, p_final_score, p_room_id)
  ON CONFLICT (session_id, game_type) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_ghost_score(uuid, text, jsonb, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_ghost_score(uuid, text, jsonb, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_ghost_score(uuid, text, jsonb, int) TO authenticated, service_role;
