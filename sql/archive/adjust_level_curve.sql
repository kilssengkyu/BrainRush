-- Adjust level curve: 25 XP per level
UPDATE public.profiles
SET level = floor((-(45)::numeric + sqrt((45 * 45) + (40 * coalesce(xp, 0)))) / 10) + 1;
