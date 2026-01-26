-- Remove the old constraint that restricts game_type values
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;

-- Add the new constraint with 'BLANK' included
ALTER TABLE game_sessions 
ADD CONSTRAINT game_sessions_game_type_check 
CHECK (game_type IN (
    'RPS', 
    'NUMBER', 
    'MATH', 
    'TEN', 
    'COLOR', 
    'MEMORY', 
    'SEQUENCE', 
    'SEQUENCE_NORMAL', 
    'LARGEST', 
    'PAIR', 
    'UPDOWN', 
    'SLIDER', 
    'ARROW', 
    'NUMBER_DESC',
    'BLANK'  -- Added new game type
));
