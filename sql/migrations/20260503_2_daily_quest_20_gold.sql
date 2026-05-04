-- Add gold to the 20-point daily quest milestone.
-- Existing clients read reward payloads dynamically, so this is safe before app release.

CREATE OR REPLACE FUNCTION public.get_daily_quest_reward_payload(p_milestone integer)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN CASE p_milestone
        WHEN 20 THEN '{"xp": 15, "gold": 10}'::jsonb
        WHEN 40 THEN '{"gold": 30}'::jsonb
        WHEN 60 THEN '{"pencils": 1}'::jsonb
        WHEN 80 THEN '{"random_item": 1}'::jsonb
        WHEN 100 THEN '{"gold": 50, "xp": 15}'::jsonb
        ELSE '{}'::jsonb
    END;
END;
$$;
