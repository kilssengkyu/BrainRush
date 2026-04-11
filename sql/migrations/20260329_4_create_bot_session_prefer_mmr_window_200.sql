-- Prefer bots whose MMR is within ±200 of the requesting player's MMR.
-- Falls back to full-random bot if no close bot exists.

DO $do$
DECLARE
    fn_old text;
    fn_new text;
BEGIN
    SELECT pg_get_functiondef('public.create_bot_session(text, boolean)'::regprocedure)
    INTO fn_old;

    fn_new := fn_old;

    -- Add variables in DECLARE section.
    fn_new := regexp_replace(
        fn_new,
        '(v_bot record;\s*)',
        E'\\1    v_user_mmr int := 1000;\n    v_has_close_bot boolean := false;\n',
        'n'
    );

    -- Load player MMR before bot selection.
    fn_new := regexp_replace(
        fn_new,
        '(\s*-- Pick a random bot profile)',
        E'\n    -- Load player MMR (fallback 1000)\n    IF p_player_id ~ ''^[0-9a-fA-F-]{36}$'' THEN\n        SELECT COALESCE(p.mmr, 1000)\n        INTO v_user_mmr\n        FROM public.profiles p\n        WHERE p.id = p_player_id::uuid;\n    END IF;\n\n\\1',
        'n'
    );

    -- Replace random bot pick with ±200 preferred pick + fallback.
    fn_new := regexp_replace(
        fn_new,
        'SELECT \* INTO v_bot FROM bot_profiles ORDER BY random\(\) LIMIT 1;',
$repl$
SELECT EXISTS (
        SELECT 1
        FROM public.bot_profiles b
        WHERE ABS(COALESCE(b.mmr, 1000) - COALESCE(v_user_mmr, 1000)) <= 200
    )
    INTO v_has_close_bot;

    IF v_has_close_bot THEN
        SELECT *
        INTO v_bot
        FROM public.bot_profiles b
        WHERE ABS(COALESCE(b.mmr, 1000) - COALESCE(v_user_mmr, 1000)) <= 200
        ORDER BY random()
        LIMIT 1;
    ELSE
        SELECT *
        INTO v_bot
        FROM public.bot_profiles
        ORDER BY random()
        LIMIT 1;
    END IF;
$repl$,
        'n'
    );

    IF fn_new = fn_old THEN
        RAISE EXCEPTION 'Patch point not found in create_bot_session().';
    END IF;

    EXECUTE fn_new;
END
$do$;

