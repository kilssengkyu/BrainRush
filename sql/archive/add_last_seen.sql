-- Add last_seen column to profiles table
ALTER TABLE profiles ADD COLUMN last_seen TIMESTAMPTZ DEFAULT NOW();

-- Create a function to update the last_seen timestamp
CREATE OR REPLACE FUNCTION update_last_seen()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if the user initiated the change (e.g., via a heartbeat call)
  -- or we could blindly update it on any profile change, but a specific RPC is better.
  NEW.last_seen = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Actually, a simpler approach is to exposing an RPC to update it
-- or just update it directly from the client when the user interacts.
-- Let's stick to client-side update for "heartbeat" or on-load.
-- So we just need the column and RLS.

-- Allow users to update their own last_seen
CREATE POLICY "Users can update their own last_seen"
ON profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
