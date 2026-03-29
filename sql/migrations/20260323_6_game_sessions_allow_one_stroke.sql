-- Allow ONE_STROKE in game_sessions.game_type check constraint.

ALTER TABLE public.game_sessions
  DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;

ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_game_type_check
  CHECK (
    game_type IN (
      'RPS',
      'NUMBER',
      'MATH',
      'MATH_OX',
      'ONE_STROKE',
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
      'PATH',
      'BLIND_PATH',
      'BALLS',
      'CATCH_COLOR',
      'TIMING_BAR',
      'COLOR_TIMING',
      'STAIRWAY',
      'MAKE_ZERO'
    )
  );
