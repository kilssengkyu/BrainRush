-- Balance item effect durations.
-- SCREEN_BLOCK: 1s -> 2s
-- EMOJI_BOMB: 3s -> 5s

UPDATE public.item_catalog
SET
    duration_seconds = 2,
    updated_at = now()
WHERE item_code = 'SCREEN_BLOCK';

UPDATE public.item_catalog
SET
    duration_seconds = 5,
    updated_at = now()
WHERE item_code = 'EMOJI_BOMB';
