-- Hide legacy nickname product alias from shop listing.
-- keep alias row for backward compatibility in purchase verification, but disable visibility.
INSERT INTO public.shop_catalog (product_id, is_enabled, sort_order, updated_at)
VALUES ('nickname_ticket', false, 21, now())
ON CONFLICT (product_id) DO UPDATE
SET is_enabled = false,
    sort_order = 21,
    updated_at = now();
