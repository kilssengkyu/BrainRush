-- Change default of MMR Change columns to NULL
-- This prevents the UI from showing "MMR +0" before the calculation is finished.

ALTER TABLE game_sessions ALTER COLUMN player1_mmr_change DROP DEFAULT;
ALTER TABLE game_sessions ALTER COLUMN player1_mmr_change SET DEFAULT NULL;

ALTER TABLE game_sessions ALTER COLUMN player2_mmr_change DROP DEFAULT;
ALTER TABLE game_sessions ALTER COLUMN player2_mmr_change SET DEFAULT NULL;

-- Optional: Reset existing waiting/active sessions to NULL (Safe to run)
UPDATE game_sessions SET player1_mmr_change = NULL, player2_mmr_change = NULL 
WHERE status IN ('waiting', 'countdown', 'playing');
