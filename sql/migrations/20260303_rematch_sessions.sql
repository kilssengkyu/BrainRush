-- Rematch sessions for finished rank/normal games.
-- One rematch is allowed per original session.

ALTER TABLE public.game_sessions
  ADD COLUMN IF NOT EXISTS rematch_source_session_id uuid REFERENCES public.game_sessions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_game_sessions_rematch_source_unique
  ON public.game_sessions(rematch_source_session_id)
  WHERE rematch_source_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_rematch_session(
  p_source_session_id uuid,
  p_requester_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_requester uuid := p_requester_id;
  v_source public.game_sessions%ROWTYPE;
  v_existing_room uuid;
  v_player1 uuid;
  v_player2 uuid;
  v_player1_pencils integer;
  v_player2_pencils integer;
  v_new_room_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;

  IF v_requester IS NULL THEN
    RAISE EXCEPTION 'requester required';
  END IF;

  SELECT *
  INTO v_source
  FROM public.game_sessions
  WHERE id = p_source_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source session not found';
  END IF;

  IF v_source.status <> 'finished' THEN
    RAISE EXCEPTION 'rematch requires a finished session';
  END IF;

  IF COALESCE(v_source.end_at, v_source.created_at) < (now() - interval '30 seconds') THEN
    RAISE EXCEPTION 'rematch window expired';
  END IF;

  IF v_source.mode NOT IN ('rank', 'normal') THEN
    RAISE EXCEPTION 'rematch is only available for rank or normal';
  END IF;

  IF v_source.rematch_source_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'rematch can only be requested from the original session';
  END IF;

  IF v_source.player1_id <> v_caller::text AND v_source.player2_id <> v_caller::text THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF v_source.player1_id <> v_requester::text AND v_source.player2_id <> v_requester::text THEN
    RAISE EXCEPTION 'invalid requester';
  END IF;

  SELECT id
  INTO v_existing_room
  FROM public.game_sessions
  WHERE rematch_source_session_id = p_source_session_id
  LIMIT 1;

  IF v_existing_room IS NOT NULL THEN
    RETURN v_existing_room;
  END IF;

  IF v_source.player1_id !~ '^[0-9a-fA-F-]{36}$' OR v_source.player2_id !~ '^[0-9a-fA-F-]{36}$' THEN
    RAISE EXCEPTION 'rematch requires authenticated players';
  END IF;

  v_player1 := v_source.player1_id::uuid;
  v_player2 := v_source.player2_id::uuid;

  IF EXISTS (
    SELECT 1
    FROM public.game_sessions gs
    WHERE gs.id <> p_source_session_id
      AND (gs.player1_id IN (v_source.player1_id, v_source.player2_id) OR gs.player2_id IN (v_source.player1_id, v_source.player2_id))
      AND (
        (gs.status = 'waiting' AND gs.created_at > (now() - interval '60 seconds'))
        OR
        (gs.status IN ('countdown', 'playing') AND COALESCE(gs.end_at, gs.created_at + interval '5 minutes') > (now() - interval '10 seconds'))
      )
  ) THEN
    RAISE EXCEPTION 'one of the players is already in another session';
  END IF;

  IF v_player1::text <= v_player2::text THEN
    SELECT pencils INTO v_player1_pencils FROM public.profiles WHERE id = v_player1 FOR UPDATE;
    SELECT pencils INTO v_player2_pencils FROM public.profiles WHERE id = v_player2 FOR UPDATE;
  ELSE
    SELECT pencils INTO v_player2_pencils FROM public.profiles WHERE id = v_player2 FOR UPDATE;
    SELECT pencils INTO v_player1_pencils FROM public.profiles WHERE id = v_player1 FOR UPDATE;
  END IF;

  IF v_player1_pencils IS NULL OR v_player2_pencils IS NULL THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  IF (v_requester = v_player1 AND v_player1_pencils < 1) OR (v_requester = v_player2 AND v_player2_pencils < 1) THEN
    RAISE EXCEPTION 'requester needs at least 1 pencil for a rematch';
  END IF;

  UPDATE public.profiles
  SET pencils = pencils - 1
  WHERE id = v_requester;

  INSERT INTO public.game_sessions (
    player1_id,
    player2_id,
    status,
    current_round,
    mode,
    rematch_source_session_id
  )
  VALUES (
    v_source.player1_id,
    v_source.player2_id,
    'waiting',
    0,
    v_source.mode,
    p_source_session_id
  )
  RETURNING id INTO v_new_room_id;

  RETURN v_new_room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_rematch_session(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_rematch_session(uuid, uuid) TO authenticated;
