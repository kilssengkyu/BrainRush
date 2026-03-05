-- Friendly invite flow: create sessions with mode='friendly' and allow cancel

CREATE OR REPLACE FUNCTION create_session(p_player1_id text, p_player2_id text)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Security Check
  IF p_player1_id != auth.uid()::text THEN
    RAISE EXCEPTION 'Not authorized to create session for another user';
  END IF;

  INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode)
  VALUES (auth.uid()::text, p_player2_id, 'waiting', 0, 'friendly')
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


CREATE OR REPLACE FUNCTION cancel_friendly_session(p_room_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE game_sessions
  SET status = 'finished',
      end_at = now()
  WHERE id = p_room_id
    AND mode = 'friendly'
    AND status = 'waiting'
    AND (player1_id = auth.uid()::text OR player2_id = auth.uid()::text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
