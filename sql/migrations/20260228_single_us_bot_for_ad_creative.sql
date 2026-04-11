-- Replace the existing bot pool with a single US bot for ad capture sessions.

DELETE FROM public.bot_profiles;

INSERT INTO public.bot_profiles (id, nickname, avatar_url, country, mmr)
VALUES (
    'bot_ad_us_001',
    'Mason',
    'https://lh3.googleusercontent.com/gg/AMW1TPrfJTjfs-myKRLSjVr__1mh8T5kWQHcQ6oYmml0KaN5gDSz42NaGf-jN08Z1OEl3fojuoHCypUnluZnfXzZzGVfIHlA4GEK4rvfQ774htIyYydsCGxO39ewYKk6vH9VXN9Th7XHlerDOD0mudkjxeRGGydU5wIgofDTzaHTgjoq_j3bZoBjv0FQ0pweLmIQp-bTVw05Hp_eVQhY1eumUOzZnTnaWE_N83g4sIc58AcCK-Fk02wKfVsuWkrRm3ACr8Fi1RveYIDUpPbHVmZ_1Lkut0N4Q7lvcRnyWfSWpEIaw3HagaxBzPeWO4C3bgSXZeKHJT7jP0N40O_Ojsk4drlB=s1024-rj',
    'US',
    1200
);
