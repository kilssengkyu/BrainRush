CREATE OR REPLACE FUNCTION public.register_guest_signup(
    p_device_id text,
    p_limit integer DEFAULT 2,
    p_window interval DEFAULT interval '24 hours'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Guest signup limiting has been retired.
    -- Keep this function as a no-op for backward compatibility.
    RETURN;
END;
$$;
