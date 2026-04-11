-- In rank bot matches, assume bot MMR is near the real user with ±60.
-- This keeps Elo deltas more natural than fixed-bot baselines.

DO $do$
DECLARE
    fn_old text;
    fn_new text;
BEGIN
    SELECT pg_get_functiondef('public.finish_game(uuid)'::regprocedure)
    INTO fn_old;

    fn_new := fn_old;

    -- If an existing near-bot block used ±20, upgrade it to ±60.
    fn_new := replace(fn_new, 'THEN -20 ELSE 20 END', 'THEN -60 ELSE 60 END');
    fn_new := replace(fn_new, 'THEN -20 ELSE 20 END));', 'THEN -60 ELSE 60 END));');

    -- If no near-bot block exists yet, inject a new ±60 block after COALESCE lines.
    IF fn_new = fn_old THEN
        fn_new := regexp_replace(
            fn_old,
            'v_p1_mmr := COALESCE\(v_p1_mmr, 1000\);\s*v_p2_mmr := COALESCE\(v_p2_mmr, 1000\);',
$repl$
v_p1_mmr := COALESCE(v_p1_mmr, 1000);
                 v_p2_mmr := COALESCE(v_p2_mmr, 1000);

                 -- Bot MMR is assumed near the real player (±60)
                 IF v_p1_is_real AND NOT v_p2_is_real THEN
                     v_p2_mmr := GREATEST(0, v_p1_mmr + (CASE WHEN random() < 0.5 THEN -60 ELSE 60 END));
                 ELSIF NOT v_p1_is_real AND v_p2_is_real THEN
                     v_p1_mmr := GREATEST(0, v_p2_mmr + (CASE WHEN random() < 0.5 THEN -60 ELSE 60 END));
                 END IF;
$repl$,
            'n'
        );
    END IF;

    IF fn_new = fn_old THEN
        RAISE EXCEPTION 'Patch point not found in finish_game().';
    END IF;

    EXECUTE fn_new;
END
$do$;

