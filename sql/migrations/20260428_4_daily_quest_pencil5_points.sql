-- Daily quest balance: make the 5-pencil spend quest worth 20 points.

UPDATE public.daily_quest_catalog
SET points = 20,
    updated_at = now()
WHERE quest_code = 'PENCIL_SPEND_5';
