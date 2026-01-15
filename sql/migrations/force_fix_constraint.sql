-- Robustly remove any constraint on game_type column and add the correct one
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find checking constraints on the game_type column
    FOR r IN (
        SELECT con.conname
        FROM pg_catalog.pg_constraint con
        INNER JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
        INNER JOIN pg_catalog.pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
        WHERE rel.relname = 'game_sessions'
          AND att.attname = 'game_type'
          AND con.contype = 'c' -- 'c' for check constraint
    ) LOOP
        -- Dynamically drop the constraint
        EXECUTE 'ALTER TABLE game_sessions DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- Add the new inclusive constraint
ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_game_type_check 
CHECK (game_type IN ('RPS', 'NUMBER', 'MATH'));
