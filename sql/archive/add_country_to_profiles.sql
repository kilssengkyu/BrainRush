-- Add country column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS country text DEFAULT NULL;

-- Comment on column
COMMENT ON COLUMN profiles.country IS 'ISO 3166-1 alpha-2 country code (e.g. KR, US)';
