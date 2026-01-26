-- FIX: Add missing 'seed' and time columns to game_sessions

ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS seed text,
ADD COLUMN IF NOT EXISTS start_at timestamptz,
ADD COLUMN IF NOT EXISTS end_at timestamptz;

-- Ensure consistency
UPDATE game_sessions SET seed = md5(random()::text) WHERE seed IS NULL;
