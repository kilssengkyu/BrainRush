-- Seed bot matchmaking delay config keys.
-- These are read by the client matchmaking hook.

BEGIN;

INSERT INTO public.app_config (key, value)
VALUES
  ('bot_delay_min_ms', '3000'),
  ('bot_delay_max_ms', '8000'),
  ('bot_force_after_ms', '8000')
ON CONFLICT (key) DO NOTHING;

COMMIT;
