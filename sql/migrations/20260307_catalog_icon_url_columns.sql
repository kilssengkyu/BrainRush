-- Allow runtime-managed icons for game and shop catalogs.
-- If icon_url is null/empty, clients should fall back to bundled local icons.

ALTER TABLE IF EXISTS public.game_catalog
  ADD COLUMN IF NOT EXISTS icon_url text;

ALTER TABLE IF EXISTS public.shop_catalog
  ADD COLUMN IF NOT EXISTS icon_url text;

