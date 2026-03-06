CREATE OR REPLACE FUNCTION public.grant_nickname_change_tickets(user_id uuid, amount integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF user_id != auth.uid() THEN
    RAISE EXCEPTION 'Cannot grant nickname change tickets for another user';
  END IF;

  IF amount IS NULL OR amount <= 0 OR amount > 1000 THEN
    RAISE EXCEPTION 'Invalid nickname change ticket amount';
  END IF;

  UPDATE public.profiles
  SET nickname_change_tickets = COALESCE(nickname_change_tickets, 0) + amount
  WHERE id = user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN TRUE;
END;
$$;
