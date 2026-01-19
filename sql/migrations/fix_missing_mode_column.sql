-- FIX: Add missing 'mode' column to game_sessions

ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS mode text DEFAULT 'normal';

-- Ensure existing rows have a value (optional, but good for safety)
UPDATE game_sessions SET mode = 'normal' WHERE mode IS NULL;

-- If you have a separate function to create rooms, ensure it sets this column.
-- For matchmaking (find_match logic), it usually inserts 'rank' or 'normal'.
-- Make sure the RPCs are aware of this column if they do exact INSERTs.
