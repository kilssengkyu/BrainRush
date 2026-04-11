-- Keep only canonical product ids in shop_catalog.
-- Platform-specific aliases are handled in app/runtime mapping, not as separate catalog rows.

WITH canonical_items(product_id, sort_order) AS (
  VALUES
    ('remove_ads', 10),
    ('nickname_change_ticket', 20),
    ('pencils_5', 30),
    ('pencils_20', 40),
    ('pencils_100', 50),
    ('practice_notes_10', 60),
    ('practice_notes_20', 70),
    ('practice_notes_100', 80)
)
INSERT INTO public.shop_catalog (product_id, is_enabled, sort_order, updated_at)
SELECT
  c.product_id,
  true,
  c.sort_order,
  now()
FROM canonical_items c
ON CONFLICT (product_id) DO NOTHING;

DELETE FROM public.shop_catalog
WHERE product_id IN (
  'nickname_ticket',
  'pencil_5',
  'pencil_20',
  'pencil_100',
  'practice_note_10',
  'practice_note_20',
  'practice_note_100'
);
