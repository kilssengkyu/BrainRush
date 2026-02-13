-- Add PATH game type to the game_sessions constraint
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;

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
    'BLANK',
    'OPERATOR',
    'LADDER',
    'TAP_COLOR',
    'AIM',
    'MOST_COLOR',
    'SORTING',
    'SPY',
    'PATH'
));
