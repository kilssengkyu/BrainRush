-- Rank tier expansion to 6 tiers + DB-level MMR floor protection (>= 0)

BEGIN;

CREATE OR REPLACE FUNCTION public.get_tier_name(p_mmr integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p_mmr >= 2400 THEN
        RETURN 'Master';
    ELSIF p_mmr >= 2000 THEN
        RETURN 'Diamond';
    ELSIF p_mmr >= 1600 THEN
        RETURN 'Platinum';
    ELSIF p_mmr >= 1200 THEN
        RETURN 'Gold';
    ELSIF p_mmr >= 800 THEN
        RETURN 'Silver';
    ELSE
        RETURN 'Bronze';
    END IF;
END;
$$;

-- One-time cleanup for any legacy negative MMR values.
UPDATE public.profiles
SET mmr = 0
WHERE mmr < 0;

-- Enforce non-negative MMR at table level.
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_mmr_non_negative_check;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_mmr_non_negative_check
    CHECK (mmr IS NULL OR mmr >= 0);

-- Extra safety net for writes coming from any path.
CREATE OR REPLACE FUNCTION public.clamp_profile_mmr_non_negative()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.mmr IS NOT NULL AND NEW.mmr < 0 THEN
        NEW.mmr := 0;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clamp_profile_mmr_non_negative ON public.profiles;

CREATE TRIGGER trg_clamp_profile_mmr_non_negative
BEFORE INSERT OR UPDATE OF mmr
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.clamp_profile_mmr_non_negative();

COMMIT;
