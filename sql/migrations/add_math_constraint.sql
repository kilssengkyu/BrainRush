-- Add MATH to game_sessions check constraint
ALTER TABLE game_sessions
DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;

ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_game_type_check 
CHECK (game_type IN ('RPS', 'NUMBER', 'MATH'));
