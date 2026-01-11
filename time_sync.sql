-- RPC to get accurate server time
CREATE OR REPLACE FUNCTION get_server_time()
RETURNS timestamptz AS $$
BEGIN
  RETURN now();
END;
$$ LANGUAGE plpgsql;
