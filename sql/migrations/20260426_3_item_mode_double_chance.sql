-- Update AUTO_SOLVE item behavior to 3-second double score window.

UPDATE public.item_catalog
SET
    duration_seconds = 3,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('score_multiplier', 2),
    updated_at = now()
WHERE item_code = 'AUTO_SOLVE';
