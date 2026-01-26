-- FIX: Add missing 'winner_id' and score columns to game_sessions

ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS winner_id text,
ADD COLUMN IF NOT EXISTS player1_score int DEFAULT 0,
ADD COLUMN IF NOT EXISTS player2_score int DEFAULT 0;
