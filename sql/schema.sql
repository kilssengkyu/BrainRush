--
-- PostgreSQL database dump
--

\restrict s1GKWiFmOjPR8Fmnt5c457XgF6bngoNENcXDuXBcrgOsXjPlyXNk8YCUm6JYist

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.8 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql;


--
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql_public;


--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgbouncer;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA realtime;


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: vault; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA vault;


--
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_graphql WITH SCHEMA graphql;


--
-- Name: EXTENSION pg_graphql; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_graphql IS 'pg_graphql: GraphQL support';


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- Name: EXTENSION supabase_vault; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


--
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


--
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


--
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: action; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


--
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in'
);


--
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text
);


--
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


--
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


--
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: -
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


--
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


--
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


--
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    func_is_graphql_resolve bool;
BEGIN
    func_is_graphql_resolve = (
        SELECT n.proname = 'resolve'
        FROM pg_event_trigger_ddl_commands() AS ev
        LEFT JOIN pg_catalog.pg_proc AS n
        ON ev.objid = n.oid
    );

    IF func_is_graphql_resolve
    THEN
        -- Update public wrapper to pass all arguments through to the pg_graphql resolve func
        DROP FUNCTION IF EXISTS graphql_public.graphql;
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language sql
        as $$
            select graphql.resolve(
                query := query,
                variables := coalesce(variables, '{}'),
                "operationName" := "operationName",
                extensions := extensions
            );
        $$;

        -- This hook executes when `graphql.resolve` is created. That is not necessarily the last
        -- function in the extension so we need to grant permissions on existing entities AND
        -- update default permissions to any others that are created after `graphql.resolve`
        grant usage on schema graphql to postgres, anon, authenticated, service_role;
        grant select on all tables in schema graphql to postgres, anon, authenticated, service_role;
        grant execute on all functions in schema graphql to postgres, anon, authenticated, service_role;
        grant all on all sequences in schema graphql to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on tables to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on functions to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on sequences to postgres, anon, authenticated, service_role;

        -- Allow postgres role to allow granting usage on graphql and graphql_public schemas to custom roles
        grant usage on schema graphql_public to postgres with grant option;
        grant usage on schema graphql to postgres with grant option;
    END IF;

END;
$_$;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: -
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  BEGIN
      RAISE DEBUG 'PgBouncer auth request: %', p_usename;

      RETURN QUERY
      SELECT
          rolname::text,
          CASE WHEN rolvaliduntil < now()
              THEN null
              ELSE rolpassword::text
          END
      FROM pg_authid
      WHERE rolname=$1 and rolcanlogin;
  END;
  $_$;


--
-- Name: cancel_friendly_session(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_friendly_session(p_room_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE game_sessions
  SET status = 'finished',
      end_at = now()
  WHERE id = p_room_id
    AND mode = 'friendly'
    AND status = 'waiting'
    AND (player1_id = auth.uid()::text OR player2_id = auth.uid()::text);
END;
$$;


--
-- Name: check_active_session(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_active_session(p_player_id text) RETURNS TABLE(room_id uuid, opponent_id text, status text, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
BEGIN
    -- If UUID, enforce ownership for authenticated users
    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
        IF auth.uid() IS NOT NULL AND p_player_id != auth.uid()::text THEN
            RAISE EXCEPTION 'Not authorized';
        END IF;
    END IF;

    -- Return only recent, non-finished sessions with valid opponent
    RETURN QUERY
    SELECT 
        gs.id as room_id,
        CASE 
            WHEN gs.player1_id = p_player_id THEN gs.player2_id 
            ELSE gs.player1_id 
        END as opponent_id,
        gs.status,
        gs.created_at
    FROM game_sessions gs
    WHERE (gs.player1_id = p_player_id OR gs.player2_id = p_player_id)
      AND gs.status != 'finished'
      AND gs.player1_id IS NOT NULL
      AND gs.player2_id IS NOT NULL
      AND gs.mode IS DISTINCT FROM 'practice'
      AND (
          (gs.status = 'waiting' AND gs.created_at > (now() - interval '60 seconds'))
          OR
          (gs.status != 'waiting' AND gs.created_at > (now() - interval '5 minutes'))
      )
    ORDER BY gs.created_at DESC
    LIMIT 1;
END;
$_$;


--
-- Name: cleanup_stale_game_sessions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_stale_game_sessions() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE game_sessions
    SET status = 'finished',
        phase_end_at = now(),
        end_at = now()
    WHERE status IN ('countdown', 'playing', 'round_end')
      AND created_at < now() - interval '5 minutes';

    UPDATE game_sessions
    SET status = 'finished',
        phase_end_at = now(),
        end_at = now()
    WHERE status = 'waiting'
      AND created_at < now() - interval '60 seconds';
END;
$$;


--
-- Name: consume_pencil(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_pencil(user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    current_pencils INTEGER;
BEGIN
    -- Security Check
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot consume pencil of another user';
    END IF;

    SELECT p.pencils INTO current_pencils FROM public.profiles p WHERE p.id = user_id;

    IF current_pencils > 0 THEN
        UPDATE public.profiles 
        SET pencils = pencils - 1,
            last_recharge_at = CASE WHEN pencils = 5 THEN NOW() ELSE last_recharge_at END
        WHERE id = user_id;
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;


--
-- Name: consume_practice_note(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_practice_note(user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    current_notes INTEGER;
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot consume practice notes of another user';
    END IF;

    SELECT p.practice_notes INTO current_notes FROM public.profiles p WHERE p.id = user_id;

    IF current_notes > 0 THEN
        UPDATE public.profiles
        SET practice_notes = practice_notes - 1,
            practice_last_recharge_at = CASE WHEN practice_notes = 5 THEN NOW() ELSE practice_last_recharge_at END
        WHERE id = user_id;
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;


--
-- Name: create_bot_session(text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_bot_session(p_player_id text, p_force boolean DEFAULT false) RETURNS TABLE(room_id uuid, opponent_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
    v_bot record;
    v_room_id uuid;
    v_level int;
BEGIN
    -- Ownership check if UUID
    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
         IF p_player_id != auth.uid()::text THEN RAISE EXCEPTION 'Not authorized'; END IF;
    END IF;

    -- Restrict bots for higher levels unless forced
    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
        SELECT level INTO v_level FROM profiles WHERE id = p_player_id::uuid;
        IF (v_level IS NULL OR v_level > 5) AND NOT p_force THEN
            RAISE EXCEPTION 'Bot match restricted';
        END IF;
    END IF;

    -- Remove from queue to avoid race
    DELETE FROM matchmaking_queue WHERE player_id = p_player_id;

    -- Pick a random bot profile
    SELECT * INTO v_bot FROM bot_profiles ORDER BY random() LIMIT 1;
    IF v_bot.id IS NULL THEN
        RAISE EXCEPTION 'No bot profiles available';
    END IF;

    INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode)
    VALUES (p_player_id, v_bot.id, 'waiting', 0, 'normal')
    RETURNING id INTO v_room_id;

    room_id := v_room_id;
    opponent_id := v_bot.id;
    RETURN NEXT;
END;
$_$;


--
-- Name: create_practice_session(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_practice_session(p_player_id text, p_game_type text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
  consumed boolean;
BEGIN
  IF p_player_id <> auth.uid()::text THEN
      RAISE EXCEPTION 'Not authorized';
  END IF;

  consumed := consume_practice_note(auth.uid());
  IF NOT consumed THEN
      RAISE EXCEPTION 'Not enough practice notes';
  END IF;

  INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode, game_type)
  VALUES (p_player_id, 'practice_solo', 'waiting', 0, 'practice', p_game_type)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;


--
-- Name: create_session(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_session(p_player1_id text, p_player2_id text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Security Check
  IF p_player1_id != auth.uid()::text THEN
    RAISE EXCEPTION 'Not authorized to create session for another user';
  END IF;

  INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode)
  VALUES (auth.uid()::text, p_player2_id, 'waiting', 0, 'friendly')
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;


--
-- Name: delete_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_account() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Clean up dependent rows that reference auth.users
  DELETE FROM public.friendships WHERE user_id::text = auth.uid()::text OR friend_id::text = auth.uid()::text;
  DELETE FROM public.chat_messages WHERE sender_id::text = auth.uid()::text OR receiver_id::text = auth.uid()::text;
  DELETE FROM public.matchmaking_queue WHERE player_id::text = auth.uid()::text;

  -- Delete profile (cascades to per-game stats/highscores)
  DELETE FROM public.profiles WHERE id::text = auth.uid()::text;

  -- Delete the user from Auth
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;


--
-- Name: find_match(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_match(p_min_mmr integer, p_max_mmr integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_my_id uuid := auth.uid();
  v_opponent_id uuid;
  v_room_id uuid;
  v_my_mmr int;
BEGIN
  -- Get my current MMR for the queue record
  SELECT mmr INTO v_my_mmr FROM public.profiles WHERE id = v_my_id;

  -- 1. Try to find an opponent
  SELECT player_id INTO v_opponent_id
  FROM matchmaking_queue
  WHERE mmr >= p_min_mmr 
    AND mmr <= p_max_mmr
    AND player_id != v_my_id
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_opponent_id IS NOT NULL THEN
    -- 2. Match Found!
    DELETE FROM matchmaking_queue WHERE player_id IN (v_my_id, v_opponent_id);
    
    -- Create session (Rank Mode)
    INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode)
    VALUES (v_my_id::text, v_opponent_id::text, 'waiting', 0, 'rank')
    RETURNING id INTO v_room_id;
    
    RETURN v_room_id;
  ELSE
    -- 3. No match found, ensure I am in the queue
    INSERT INTO matchmaking_queue (player_id, mmr)
    VALUES (v_my_id, v_my_mmr)
    ON CONFLICT (player_id) DO UPDATE
    SET mmr = v_my_mmr, created_at = now();
    
    RETURN NULL;
  END IF;
END;
$$;


--
-- Name: find_match(integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_match(p_min_mmr integer, p_max_mmr integer, p_player_id text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  -- Use the passed ID. 
  v_my_id text := p_player_id;
  v_opponent_id text;
  v_room_id uuid;
  v_my_mmr int;
begin
  -- Get my current MMR. If I am a guest, default to 1000.
  -- We try to find a profile first.
  select mmr into v_my_mmr from public.profiles where id::text = v_my_id;
  
  if v_my_mmr is null then
    v_my_mmr := 1000; -- Default Guest MMR
  end if;

  -- 1. Try to find an opponent
  -- Lock the row to prevent race conditions
  select player_id into v_opponent_id
  from matchmaking_queue
  where mmr >= p_min_mmr 
    and mmr <= p_max_mmr
    and player_id != v_my_id
  order by created_at asc
  limit 1
  for update skip locked;

  if v_opponent_id is not null then
    -- 2. Match Found!
    -- Remove both from queue
    delete from matchmaking_queue where player_id in (v_my_id, v_opponent_id);
    
    -- Create session
    -- Note: game_sessions player columns are already TEXT type, so this allows guests.
    insert into game_sessions (player1_id, player2_id, status, current_round)
    values (v_my_id, v_opponent_id, 'waiting', 0)
    returning id into v_room_id;
    
    return v_room_id;
  else
    -- 3. No match found, ensure I am in the queue
    insert into matchmaking_queue (player_id, mmr)
    values (v_my_id, v_my_mmr)
    on conflict (player_id) do update
    set mmr = v_my_mmr, created_at = now(); -- Update heartbeat
    
    return null;
  end if;
end;
$$;


--
-- Name: find_match(integer, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_match(p_min_mmr integer, p_max_mmr integer, p_player_id text, p_mode text DEFAULT 'rank'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
    v_opponent_id text;
    v_room_id uuid;
    v_level int;
BEGIN
    -- [SECURE] Verify ownership if UUID
    IF p_player_id ~ '^[0-9a-fA-F-]{36}$' THEN
         IF p_player_id != auth.uid()::text THEN RAISE EXCEPTION 'Not authorized'; END IF;
    END IF;

    -- Rank gate: require authenticated user with level >= 5
    IF p_mode = 'rank' THEN
        IF p_player_id !~ '^[0-9a-fA-F-]{36}$' THEN
            RAISE EXCEPTION 'Rank requires login';
        END IF;

        SELECT level INTO v_level FROM profiles WHERE id = p_player_id::uuid;
        IF v_level IS NULL OR v_level < 5 THEN
            RAISE EXCEPTION 'Rank requires level 5';
        END IF;
    END IF;

    -- A. Cleanup Stale Entries
    DELETE FROM matchmaking_queue 
    WHERE updated_at < (now() - interval '60 seconds');

    -- B. Find Opponent
    SELECT player_id INTO v_opponent_id
    FROM matchmaking_queue
    WHERE player_id != p_player_id
      AND mmr BETWEEN p_min_mmr AND p_max_mmr
      AND mode = p_mode
      AND updated_at > (now() - interval '30 seconds')
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    -- C. Match Found?
    IF v_opponent_id IS NOT NULL THEN
        INSERT INTO game_sessions (player1_id, player2_id, status, current_round, mode)
        VALUES (p_player_id, v_opponent_id, 'waiting', 0, p_mode)
        RETURNING id INTO v_room_id;

        DELETE FROM matchmaking_queue WHERE player_id IN (p_player_id, v_opponent_id);
        RETURN v_room_id;
    END IF;

    -- D. No match -> Upsert Self
    INSERT INTO matchmaking_queue (player_id, mmr, mode, updated_at)
    VALUES (p_player_id, (p_min_mmr + p_max_mmr) / 2, p_mode, now())
    ON CONFLICT (player_id) 
    DO UPDATE SET 
        mmr = EXCLUDED.mmr,
        mode = EXCLUDED.mode,
        updated_at = now();

    RETURN NULL;
END;
$_$;


--
-- Name: finish_game(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finish_game(p_room_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
    v_session record;
    v_winner text;
    v_loser text;
    v_is_draw boolean := false;
    v_k_factor int := 32;
    v_p1_mmr int;
    v_p2_mmr int;
    v_p1_exp float;
    v_p2_exp float;
    v_new_p1_mmr int;
    v_new_p2_mmr int;

    v_p1_total int := 0;
    v_p2_total int := 0;
    v_round jsonb;

    v_round_winner text;
    v_round_type text;
    v_inc record;

    v_p1_speed int := 0;
    v_p1_memory int := 0;
    v_p1_judgment int := 0;
    v_p1_calculation int := 0;
    v_p1_accuracy int := 0;
    v_p1_observation int := 0;

    v_p2_speed int := 0;
    v_p2_memory int := 0;
    v_p2_judgment int := 0;
    v_p2_calculation int := 0;
    v_p2_accuracy int := 0;
    v_p2_observation int := 0;
BEGIN
    -- [SECURE] Caller Check
    IF NOT EXISTS (SELECT 1 FROM game_sessions WHERE id = p_room_id
        AND (player1_id = auth.uid()::text OR player2_id = auth.uid()::text)) THEN
       RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT * INTO v_session FROM game_sessions WHERE id = p_room_id;

    -- Status check
    IF v_session.status = 'finished' THEN RETURN; END IF;

    -- Calculate Totals and Per-Round Stat Gains
    SELECT round_scores INTO v_session.round_scores FROM game_sessions WHERE id = p_room_id;

    FOR v_round IN SELECT * FROM jsonb_array_elements(v_session.round_scores)
    LOOP
        v_p1_total := v_p1_total + (v_round->>'p1_score')::int;
        v_p2_total := v_p2_total + (v_round->>'p2_score')::int;

        v_round_winner := v_round->>'winner';
        v_round_type := v_round->>'game_type';

        IF v_round_winner = 'p1' THEN
            SELECT * INTO v_inc FROM stat_increments(v_round_type);
            v_p1_speed := v_p1_speed + v_inc.speed;
            v_p1_memory := v_p1_memory + v_inc.memory;
            v_p1_judgment := v_p1_judgment + v_inc.judgment;
            v_p1_calculation := v_p1_calculation + v_inc.calculation;
            v_p1_accuracy := v_p1_accuracy + v_inc.accuracy;
            v_p1_observation := v_p1_observation + v_inc.observation;
        ELSIF v_round_winner = 'p2' THEN
            SELECT * INTO v_inc FROM stat_increments(v_round_type);
            v_p2_speed := v_p2_speed + v_inc.speed;
            v_p2_memory := v_p2_memory + v_inc.memory;
            v_p2_judgment := v_p2_judgment + v_inc.judgment;
            v_p2_calculation := v_p2_calculation + v_inc.calculation;
            v_p2_accuracy := v_p2_accuracy + v_inc.accuracy;
            v_p2_observation := v_p2_observation + v_inc.observation;
        END IF;
    END LOOP;

    -- Determine Winner
    IF v_p1_total > v_p2_total THEN
        v_winner := v_session.player1_id;
        v_loser := v_session.player2_id;
    ELSIF v_p2_total > v_p1_total THEN
        v_winner := v_session.player2_id;
        v_loser := v_session.player1_id;
    ELSE
        v_is_draw := true;
    END IF;

    -- Update Session
    UPDATE game_sessions
    SET status = 'finished',
        winner_id = v_winner,
        end_at = now(),
        player1_score = v_p1_total,
        player2_score = v_p2_total
    WHERE id = p_room_id;

    -- STATS UPDATE LOGIC
    IF v_winner IS NOT NULL AND NOT v_is_draw THEN
        IF v_session.mode = 'rank' THEN
             -- RANK MODE: Update MMR + Standard Wins/Losses (only for real users)
             IF v_session.player1_id ~ '^[0-9a-fA-F-]{36}$' AND v_session.player2_id ~ '^[0-9a-fA-F-]{36}$' THEN
                 SELECT mmr INTO v_p1_mmr FROM profiles WHERE id = v_session.player1_id::uuid;
                 SELECT mmr INTO v_p2_mmr FROM profiles WHERE id = v_session.player2_id::uuid;

                 v_p1_exp := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::numeric / 400.0));
                 v_p2_exp := 1.0 / (1.0 + power(10.0, (v_p1_mmr - v_p2_mmr)::numeric / 400.0));

                 IF v_winner = v_session.player1_id::text THEN
                    v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (1 - v_p1_exp));
                    v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (0 - v_p2_exp));

                    UPDATE profiles SET mmr = v_new_p1_mmr, wins = wins + 1 WHERE id = v_session.player1_id::uuid;
                    UPDATE profiles SET mmr = v_new_p2_mmr, losses = losses + 1 WHERE id = v_session.player2_id::uuid;
                 ELSE
                    v_new_p1_mmr := round(v_p1_mmr + v_k_factor * (0 - v_p1_exp));
                    v_new_p2_mmr := round(v_p2_mmr + v_k_factor * (1 - v_p2_exp));

                    UPDATE profiles SET mmr = v_new_p1_mmr, losses = losses + 1 WHERE id = v_session.player1_id::uuid;
                    UPDATE profiles SET mmr = v_new_p2_mmr, wins = wins + 1 WHERE id = v_session.player2_id::uuid;
                 END IF;
             END IF;
        ELSIF v_session.mode = 'normal' THEN
             -- NORMAL MODE: Update Casual Wins/Losses (No MMR)
             IF v_winner ~ '^[0-9a-fA-F-]{36}$' THEN
                 UPDATE profiles SET casual_wins = casual_wins + 1 WHERE id = v_winner::uuid;
             END IF;
             IF v_loser ~ '^[0-9a-fA-F-]{36}$' THEN
                 UPDATE profiles SET casual_losses = casual_losses + 1 WHERE id = v_loser::uuid;
             END IF;
        ELSE
            -- FRIENDLY or PRACTICE MODE: Do NOT update any stats
            -- Just finish the session (already done above)
        END IF;
    END IF;

    -- XP/Level Update (Rank + Normal only)
    IF v_session.mode IN ('rank', 'normal') THEN
        IF v_session.player1_id ~ '^[0-9a-fA-F-]{36}$' THEN
            UPDATE profiles
            SET xp = COALESCE(xp, 0) + (10 + CASE WHEN v_winner = v_session.player1_id THEN 5 ELSE 0 END),
                level = floor((-(45)::numeric + sqrt((45 * 45) + (40 * (COALESCE(xp, 0) + (10 + CASE WHEN v_winner = v_session.player1_id THEN 5 ELSE 0 END))))) / 10) + 1
            WHERE id = v_session.player1_id::uuid;
        END IF;

        IF v_session.player2_id ~ '^[0-9a-fA-F-]{36}$' THEN
            UPDATE profiles
            SET xp = COALESCE(xp, 0) + (10 + CASE WHEN v_winner = v_session.player2_id THEN 5 ELSE 0 END),
                level = floor((-(45)::numeric + sqrt((45 * 45) + (40 * (COALESCE(xp, 0) + (10 + CASE WHEN v_winner = v_session.player2_id THEN 5 ELSE 0 END))))) / 10) + 1
            WHERE id = v_session.player2_id::uuid;
        END IF;
    END IF;

    -- Skill stats: per-round winner gains (rank/normal only, exclude guests/bots)
    IF v_session.mode IN ('rank', 'normal') THEN
        IF v_session.player1_id ~ '^[0-9a-fA-F-]{36}$' THEN
            UPDATE profiles
            SET speed = LEAST(999, COALESCE(speed, 0) + v_p1_speed),
                memory = LEAST(999, COALESCE(memory, 0) + v_p1_memory),
                judgment = LEAST(999, COALESCE(judgment, 0) + v_p1_judgment),
                calculation = LEAST(999, COALESCE(calculation, 0) + v_p1_calculation),
                accuracy = LEAST(999, COALESCE(accuracy, 0) + v_p1_accuracy),
                observation = LEAST(999, COALESCE(observation, 0) + v_p1_observation)
            WHERE id = v_session.player1_id::uuid;
        END IF;

        IF v_session.player2_id ~ '^[0-9a-fA-F-]{36}$' THEN
            UPDATE profiles
            SET speed = LEAST(999, COALESCE(speed, 0) + v_p2_speed),
                memory = LEAST(999, COALESCE(memory, 0) + v_p2_memory),
                judgment = LEAST(999, COALESCE(judgment, 0) + v_p2_judgment),
                calculation = LEAST(999, COALESCE(calculation, 0) + v_p2_calculation),
                accuracy = LEAST(999, COALESCE(accuracy, 0) + v_p2_accuracy),
                observation = LEAST(999, COALESCE(observation, 0) + v_p2_observation)
            WHERE id = v_session.player2_id::uuid;
        END IF;
    END IF;
END;
$_$;


--
-- Name: get_game_duration(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_game_duration(p_game_type text) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
    RETURN CASE p_game_type
        -- 30초 게임
        WHEN 'RPS' THEN 30
        WHEN 'ARROW' THEN 30
        WHEN 'TAP_COLOR' THEN 30
        WHEN 'SLIDER' THEN 30
        WHEN 'UPDOWN' THEN 30
        WHEN 'CATCH_COLOR' THEN 30
        WHEN 'MATH' THEN 30
        WHEN 'TEN' THEN 30
        WHEN 'BLANK' THEN 30
        WHEN 'OPERATOR' THEN 30
        WHEN 'LARGEST' THEN 30
        WHEN 'NUMBER' THEN 30
        WHEN 'NUMBER_DESC' THEN 30
        WHEN 'SORTING' THEN 30
        WHEN 'LADDER' THEN 30
        WHEN 'MOST_COLOR' THEN 30
        WHEN 'COLOR' THEN 30
        WHEN 'SEQUENCE' THEN 30
        WHEN 'SEQUENCE_NORMAL' THEN 30
        WHEN 'PAIR' THEN 30
        
        -- 40초 게임
        WHEN 'AIM' THEN 40
        WHEN 'BALLS' THEN 40
        WHEN 'MEMORY' THEN 40
        WHEN 'SPY' THEN 40
        WHEN 'TIMING_BAR' THEN 40
        WHEN 'STAIRWAY' THEN 40
        
        -- 45초 게임
        WHEN 'PATH' THEN 45
        WHEN 'BLIND_PATH' THEN 45
        
        ELSE 30
    END;
END;
$$;


--
-- Name: get_game_highscores(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_game_highscores(p_game_type text, p_limit integer DEFAULT 10) RETURNS TABLE(user_id uuid, nickname text, avatar_url text, country text, best_score integer, rank integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    ph.user_id,
    p.nickname,
    p.avatar_url,
    p.country,
    ph.best_score,
    (ROW_NUMBER() OVER (ORDER BY ph.best_score DESC, ph.updated_at DESC))::int AS rank
  FROM player_highscores ph
  JOIN profiles p ON p.id = ph.user_id
  WHERE ph.game_type = p_game_type
  ORDER BY ph.best_score DESC, ph.updated_at DESC
  LIMIT p_limit;
END;
$$;


--
-- Name: get_leaderboard(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_leaderboard(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_top_players JSON;
    v_user_rank JSON;
BEGIN
    -- Get Top 100 Players
    SELECT json_agg(t) INTO v_top_players
    FROM (
        SELECT 
            ROW_NUMBER() OVER (ORDER BY mmr DESC) as rank,
            id,
            nickname,
            avatar_url,
            country,
            mmr,
            get_tier_name(mmr) as tier
        FROM profiles
        LIMIT 100
    ) t;

    -- Get Requesting User's Specific Rank (if logged in)
    IF p_user_id IS NOT NULL THEN
        SELECT json_build_object(
            'rank', rank,
            'id', id,
            'nickname', nickname,
            'avatar_url', avatar_url,
            'country', country,
            'mmr', mmr,
            'tier', get_tier_name(mmr)
        ) INTO v_user_rank
        FROM (
            SELECT 
                id, nickname, avatar_url, country, mmr,
                RANK() OVER (ORDER BY mmr DESC) as rank
            FROM profiles
        ) sub
        WHERE id = p_user_id;
    END IF;

    -- Return combined result
    RETURN json_build_object(
        'top_players', COALESCE(v_top_players, '[]'::json),
        'user_rank', v_user_rank
    );
END;
$$;


--
-- Name: get_player_match_history(uuid, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_player_match_history(p_user_id uuid, p_mode text DEFAULT 'all'::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0) RETURNS TABLE(session_id uuid, game_mode text, created_at timestamp with time zone, result text, opponent_id text, opponent_nickname text, opponent_avatar_url text, opponent_country text, is_friend boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    -- Security Check: Only allow viewing own history
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Permission denied';
    END IF;

    RETURN QUERY
    SELECT
        gs.id AS session_id,
        gs.mode AS game_mode,
        gs.created_at,
        CASE
            WHEN gs.winner_id::text = p_user_id::text THEN 'WIN'
            WHEN gs.winner_id IS NULL AND gs.status IN ('completed', 'finished') THEN 'DRAW'
            ELSE 'LOSE'
        END AS result,
        (CASE
            WHEN gs.player1_id::text = p_user_id::text THEN gs.player2_id::text
            ELSE gs.player1_id::text
        END) AS opponent_id,
        COALESCE(p.nickname, b.nickname) AS opponent_nickname,
        COALESCE(p.avatar_url, b.avatar_url) AS opponent_avatar_url,
        COALESCE(p.country, b.country) AS opponent_country,
        (EXISTS (
            SELECT 1 FROM friendships f
            WHERE (f.user_id = p_user_id AND f.friend_id::text = (CASE WHEN gs.player1_id::text = p_user_id::text THEN gs.player2_id::text ELSE gs.player1_id::text END))
               OR (f.user_id::text = (CASE WHEN gs.player1_id::text = p_user_id::text THEN gs.player2_id::text ELSE gs.player1_id::text END) AND f.friend_id = p_user_id)
            AND f.status = 'accepted'
        )) AS is_friend
    FROM
        game_sessions gs
    LEFT JOIN
        profiles p ON p.id::text = (CASE WHEN gs.player1_id::text = p_user_id::text THEN gs.player2_id::text ELSE gs.player1_id::text END)
    LEFT JOIN
        bot_profiles b ON b.id = (CASE WHEN gs.player1_id::text = p_user_id::text THEN gs.player2_id::text ELSE gs.player1_id::text END)
    WHERE
        (gs.player1_id::text = p_user_id::text OR gs.player2_id::text = p_user_id::text)
        AND gs.status IN ('finished', 'forfeited', 'completed')
        AND gs.mode NOT ILIKE '%practice%'
        AND (p_mode = 'all' OR gs.mode = p_mode)
    ORDER BY
        gs.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;


--
-- Name: get_profile_with_pencils(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_profile_with_pencils(user_id uuid) RETURNS TABLE(pencils integer, last_recharge_at timestamp with time zone, practice_notes integer, practice_last_recharge_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    current_pencils INTEGER;
    last_time TIMESTAMPTZ;
    time_diff INTERVAL;
    recharge_amount INTEGER;
    new_last_time TIMESTAMPTZ;
    current_notes INTEGER;
    notes_last_time TIMESTAMPTZ;
    notes_diff INTERVAL;
    notes_recharge INTEGER;
    new_notes_last_time TIMESTAMPTZ;
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot access resources of another user';
    END IF;

    SELECT p.pencils, p.last_recharge_at, p.practice_notes, p.practice_last_recharge_at
    INTO current_pencils, last_time, current_notes, notes_last_time
    FROM public.profiles p
    WHERE p.id = user_id;

    IF current_pencils IS NULL THEN
        current_pencils := 5;
        last_time := NOW();
        UPDATE public.profiles SET pencils = 5, last_recharge_at = NOW() WHERE id = user_id;
    END IF;

    IF current_notes IS NULL THEN
        current_notes := 5;
        notes_last_time := NOW();
        UPDATE public.profiles SET practice_notes = 5, practice_last_recharge_at = NOW() WHERE id = user_id;
    END IF;

    -- Pencils: 1 per 30 minutes, max 5
    IF current_pencils < 5 THEN
        time_diff := NOW() - last_time;
        recharge_amount := FLOOR(EXTRACT(EPOCH FROM time_diff) / 1800);

        IF recharge_amount > 0 THEN
            current_pencils := LEAST(5, current_pencils + recharge_amount);
            IF current_pencils = 5 THEN
                new_last_time := NOW();
            ELSE
                new_last_time := last_time + (recharge_amount * INTERVAL '30 minutes');
            END IF;

            UPDATE public.profiles
            SET pencils = current_pencils,
                last_recharge_at = new_last_time
            WHERE id = user_id;

            last_time := new_last_time;
        END IF;
    END IF;

    -- Practice Notes: 1 per 30 minutes, max 5
    IF current_notes < 5 THEN
        notes_diff := NOW() - notes_last_time;
        notes_recharge := FLOOR(EXTRACT(EPOCH FROM notes_diff) / 1800);

        IF notes_recharge > 0 THEN
            current_notes := LEAST(5, current_notes + notes_recharge);
            IF current_notes = 5 THEN
                new_notes_last_time := NOW();
            ELSE
                new_notes_last_time := notes_last_time + (notes_recharge * INTERVAL '30 minutes');
            END IF;

            UPDATE public.profiles
            SET practice_notes = current_notes,
                practice_last_recharge_at = new_notes_last_time
            WHERE id = user_id;

            notes_last_time := new_notes_last_time;
        END IF;
    END IF;

    RETURN QUERY SELECT current_pencils, last_time, current_notes, notes_last_time;
END;
$$;


--
-- Name: get_server_time(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_server_time() RETURNS timestamp with time zone
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN now();
END;
$$;


--
-- Name: get_tier_name(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tier_name(p_mmr integer) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
    IF p_mmr >= 2500 THEN RETURN 'Diamond';
    ELSIF p_mmr >= 2000 THEN RETURN 'Platinum';
    ELSIF p_mmr >= 1500 THEN RETURN 'Gold';
    ELSIF p_mmr >= 1200 THEN RETURN 'Silver';
    ELSE RETURN 'Bronze';
    END IF;
END;
$$;


--
-- Name: grant_ads_removal(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grant_ads_removal(user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot grant ads removal for another user';
    END IF;

    UPDATE public.profiles
    SET ads_removed = TRUE
    WHERE id = user_id;

    RETURN TRUE;
END;
$$;


--
-- Name: grant_pencils(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grant_pencils(user_id uuid, amount integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot grant pencils for another user';
    END IF;

    IF amount IS NULL OR amount <= 0 OR amount > 1000 THEN
        RAISE EXCEPTION 'Invalid pencil amount';
    END IF;

    UPDATE public.profiles
    SET pencils = pencils + amount
    WHERE id = user_id;

    RETURN TRUE;
END;
$$;


--
-- Name: grant_practice_notes(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grant_practice_notes(user_id uuid, amount integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot grant practice notes to another user';
    END IF;

    UPDATE public.profiles
    SET practice_notes = COALESCE(practice_notes, 0) + amount
    WHERE id = user_id;

    RETURN TRUE;
END;
$$;


--
-- Name: handle_disconnection(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_disconnection(p_room_id uuid, p_leaver_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_p1 text; v_p2 text;
  v_winner_id text;
  v_leaver_mmr int; v_winner_mmr int;
  v_k int := 32;
  v_p1_score int; v_p2_score int;
  v_leaver_score_penalty int := -1; -- Or just 0 points? Treating as forfeit.
BEGIN
  -- Get Session Info
  select player1_id, player2_id, player1_score, player2_score 
  into v_p1, v_p2, v_p1_score, v_p2_score
  from game_sessions where id = p_room_id;

  -- Validate Leaver is in the room
  if v_p1 != p_leaver_id and v_p2 != p_leaver_id then
      raise exception 'Leaver not found in this room';
  end if;

  -- Identify Winner
  if v_p1 = p_leaver_id then
      v_winner_id := v_p2;
  else
      v_winner_id := v_p1;
  end if;

  -- Fetch MMRs
  select mmr into v_leaver_mmr from public.profiles where id = p_leaver_id::uuid;
  select mmr into v_winner_mmr from public.profiles where id = v_winner_id::uuid;

  -- Calculate MMR Change (Treat calculation as if Winner won against Leaver)
  -- Standard Elo calculation
  declare
      v_expect_winner float;
      v_expect_leaver float;
      v_winner_chg int;
      v_leaver_chg int;
  begin
      v_expect_winner := 1.0 / (1.0 + power(10.0, (v_leaver_mmr - v_winner_mmr)::float / 400.0));
      v_expect_leaver := 1.0 / (1.0 + power(10.0, (v_winner_mmr - v_leaver_mmr)::float / 400.0));

      v_winner_chg := round(v_k * (1.0 - v_expect_winner)); -- Actual result is 1.0 (Win)
      v_leaver_chg := round(v_k * (0.0 - v_expect_leaver)); -- Actual result is 0.0 (Loss)
      
      -- Update Leaver Profile (Disconnect +1, MMR down, NO Loss increase)
      update public.profiles 
      set mmr = mmr + v_leaver_chg, 
          disconnects = disconnects + 1 
      where id = p_leaver_id::uuid;

      -- Update Winner Profile (Win +1, MMR up)
      update public.profiles 
      set mmr = mmr + v_winner_chg, 
          wins = wins + 1 
      where id = v_winner_id::uuid;

      -- Close Session
      -- Give Winner 3 points to signify victory (or just mark finished)
      if v_winner_id = v_p1 then
          v_p1_score := 3;
      else
          v_p2_score := 3;
      end if;

      update game_sessions 
      set status = 'finished', 
          phase_end_at = now(),
          player1_score = v_p1_score,
          player2_score = v_p2_score,
          player1_mmr_change = case when v_p1 = v_winner_id then v_winner_chg else v_leaver_chg end,
          player2_mmr_change = case when v_p2 = v_winner_id then v_winner_chg else v_leaver_chg end
      where id = p_room_id;
  end;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, nickname)
  values (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'avatar_url',
    'Player_' || floor(random() * 9000 + 1000)::text
  );
  return new;
end;
$$;


--
-- Name: next_round(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_round(p_room_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_session record;
    v_new_type text;
    v_new_index int;
    v_seed text;
    v_round_record jsonb;
BEGIN
    SELECT * INTO v_session FROM game_sessions WHERE id = p_room_id FOR UPDATE;

    -- Practice Mode: finish immediately after Round 1 (or on timeout)
    IF v_session.mode = 'practice' THEN
        UPDATE game_sessions
        SET status = 'finished',
            end_at = now()
        WHERE id = p_room_id;
        RETURN;
    END IF;

    -- Safety check
    IF v_session.status = 'finished' THEN RETURN; END IF;

    -- Record scores from the JUST FINISHED round
    v_round_record := jsonb_build_object(
        'round', v_session.current_round_index + 1,
        'p1_score', v_session.player1_score,
        'p2_score', v_session.player2_score,
        'game_type', v_session.game_type
    );

    UPDATE game_sessions 
    SET round_scores = round_scores || v_round_record,
        player1_score = 0,
        player2_score = 0
    WHERE id = p_room_id;

    -- Check if we have more rounds
    IF v_session.current_round_index < 2 THEN
        v_new_index := v_session.current_round_index + 1;
        v_new_type := v_session.game_types[v_new_index + 1];
        v_seed := md5(random()::text);

        UPDATE game_sessions
        SET current_round_index = v_new_index,
            game_type = v_new_type,
            seed = v_seed,
            start_at = now() + interval '6 seconds',
            end_at = now() + interval '36 seconds'
        WHERE id = p_room_id;
    ELSE
        PERFORM finish_game(p_room_id);
    END IF;
END;
$$;


--
-- Name: record_purchase(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_purchase(p_user_id uuid, p_product_id text, p_platform text, p_transaction_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    inserted BOOLEAN := FALSE;
BEGIN
    INSERT INTO public.purchase_transactions (user_id, product_id, platform, transaction_id)
    VALUES (p_user_id, p_product_id, p_platform, p_transaction_id)
    ON CONFLICT (platform, transaction_id) DO NOTHING;

    GET DIAGNOSTICS inserted = ROW_COUNT;
    RETURN inserted;
END;
$$;


--
-- Name: resolve_round(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_round(p_room_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_game_type text; v_round int; v_p1 text; v_p2 text;
  v_p1_move text; v_p2_move text;
  v_p1_score int; v_p2_score int;
BEGIN
  select game_type, current_round, player1_id, player2_id, player1_score, player2_score
  into v_game_type, v_round, v_p1, v_p2, v_p1_score, v_p2_score
  from game_sessions where id = p_room_id and status = 'playing';

  if not found then return; end if;

  if v_game_type like 'NUMBER%' then
      select move into v_p1_move from game_moves where room_id = p_room_id and round = v_round and player_id = v_p1 and move like 'DONE:%' limit 1;
      select move into v_p2_move from game_moves where room_id = p_room_id and round = v_round and player_id = v_p2 and move like 'DONE:%' limit 1;
      
      if v_p1_move is not null and v_p2_move is null then v_p1_score := v_p1_score + 3;
      elsif v_p2_move is not null and v_p1_move is null then v_p2_score := v_p2_score + 3;
      end if;
      
      update game_sessions set player1_score = v_p1_score, player2_score = v_p2_score where id = p_room_id;
      
      if v_p1_score >= 3 or v_p2_score >= 3 then
         update game_sessions set status = 'finished', phase_end_at = now() where id = p_room_id;
         perform update_mmr(p_room_id);
      else
         update game_sessions set status = 'round_end', phase_end_at = now() where id = p_room_id;
      end if;
  else
      update game_sessions set status = 'round_end', phase_end_at = now() where id = p_room_id;
  end if;
END;
$$;


--
-- Name: reward_ad_pencils(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reward_ad_pencils(user_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    new_count INTEGER;
    current_count INTEGER;
    current_day DATE;
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot reward pencils for another user';
    END IF;

    SELECT p.ad_reward_count, p.ad_reward_day
    INTO current_count, current_day
    FROM public.profiles p
    WHERE p.id = user_id
    FOR UPDATE;

    IF current_count IS NULL THEN
        current_count := 0;
    END IF;

    IF current_day IS NULL OR current_day <> CURRENT_DATE THEN
        current_count := 0;
        current_day := CURRENT_DATE;
    END IF;

    IF current_count >= 10 THEN
        RAISE EXCEPTION 'Daily ad reward limit reached';
    END IF;

    UPDATE public.profiles
    SET pencils = pencils + 1,
        ad_reward_count = current_count + 1,
        ad_reward_day = current_day
    WHERE id = user_id
    RETURNING pencils INTO new_count;

    RETURN new_count;
END;
$$;


--
-- Name: reward_ad_practice_notes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reward_ad_practice_notes(user_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    new_count INTEGER;
    current_count INTEGER;
    current_day DATE;
BEGIN
    IF user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot reward practice notes for another user';
    END IF;

    SELECT p.practice_ad_reward_count, p.practice_ad_reward_day
    INTO current_count, current_day
    FROM public.profiles p
    WHERE p.id = user_id
    FOR UPDATE;

    IF current_count IS NULL THEN
        current_count := 0;
    END IF;

    IF current_day IS NULL OR current_day <> CURRENT_DATE THEN
        current_count := 0;
        current_day := CURRENT_DATE;
    END IF;

    IF current_count >= 10 THEN
        RAISE EXCEPTION 'Daily ad reward limit reached';
    END IF;

    UPDATE public.profiles
    SET practice_notes = practice_notes + 2,
        practice_ad_reward_count = current_count + 1,
        practice_ad_reward_day = current_day
    WHERE id = user_id
    RETURNING practice_notes INTO new_count;

    RETURN new_count;
END;
$$;


--
-- Name: set_player_ready(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_player_ready(p_room_id uuid, p_player_id text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_p1 text;
    v_p2 text;
BEGIN
    SELECT player1_id, player2_id INTO v_p1, v_p2
    FROM game_sessions
    WHERE id = p_room_id;

    IF v_p1 = p_player_id THEN
        UPDATE game_sessions SET player1_ready = true WHERE id = p_room_id;
    ELSIF v_p2 = p_player_id THEN
        UPDATE game_sessions SET player2_ready = true WHERE id = p_room_id;
    END IF;
END;
$$;


--
-- Name: start_game(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_game(p_room_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_seed text;
    v_mode text;
    v_current_type text;
    v_duration int;
    v_all_types text[] := ARRAY[
        'RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR',
        'MEMORY', 'SEQUENCE', 'LARGEST', 'PAIR',
        'UPDOWN', 'SEQUENCE_NORMAL', 'NUMBER_DESC',
        'SLIDER', 'ARROW', 'BLANK', 'OPERATOR', 'LADDER', 'TAP_COLOR',
        'AIM', 'MOST_COLOR', 'SORTING', 'SPY', 'PATH', 'BLIND_PATH', 'BALLS', 'CATCH_COLOR', 'TIMING_BAR', 'STAIRWAY'
    ];
    v_selected_types text[];
    v_first_type text;
BEGIN
    SELECT mode, game_type INTO v_mode, v_current_type FROM game_sessions WHERE id = p_room_id;
    v_seed := md5(random()::text);

    IF v_mode = 'practice' THEN
        -- Get duration for practice game type
        v_duration := get_game_duration(v_current_type);
        
        -- PRACTICE: Start immediately
        UPDATE game_sessions
        SET status = 'playing',
            game_types = ARRAY[v_current_type],
            current_round_index = 0,
            current_round = 1,
            seed = v_seed,
            phase_start_at = now(),
            phase_end_at = now() + interval '4 seconds',
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '4 seconds' + (v_duration || ' seconds')::interval,
            round_scores = '[]'::jsonb
        WHERE id = p_room_id;
    ELSE
        -- NORMAL/RANK: Random 3 games
        SELECT ARRAY(
            SELECT x
            FROM unnest(v_all_types) AS x
            ORDER BY random()
            LIMIT 3
        ) INTO v_selected_types;

        v_first_type := v_selected_types[1];
        v_duration := get_game_duration(v_first_type);

        UPDATE game_sessions
        SET status = 'playing',
            game_types = v_selected_types,
            current_round_index = 0,
            current_round = 1,
            game_type = v_first_type,
            seed = v_seed,
            phase_start_at = now(),
            phase_end_at = now() + interval '4 seconds',
            start_at = now() + interval '4 seconds',
            end_at = now() + interval '4 seconds' + (v_duration || ' seconds')::interval,
            round_scores = '[]'::jsonb
        WHERE id = p_room_id AND status = 'waiting';
    END IF;
END;
$$;


--
-- Name: start_next_round(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_next_round(p_room_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_next_type text;
  v_current_type text;
  v_status text;
  v_current_round int;
  v_next_round int;
  v_next_round_index int;
  v_duration int;
  
  -- Scores (Wins)
  v_p1_wins int;
  v_p2_wins int;
  
  -- Current Points
  v_p1_points int;
  v_p2_points int;
  
  v_game_data jsonb;
  v_target text;
  v_types text[] := ARRAY['RPS', 'NUMBER', 'MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW', 'NUMBER_DESC', 'BLANK', 'OPERATOR', 'LADDER', 'TAP_COLOR', 'AIM', 'MOST_COLOR', 'SORTING', 'SPY', 'PATH', 'BLIND_PATH', 'BALLS', 'CATCH_COLOR', 'TIMING_BAR', 'STAIRWAY'];
  v_opts text[] := ARRAY['rock','paper','scissors'];
  
  v_round_snapshot jsonb;
  v_mode text;
  v_p1_id text;
  v_p2_id text;
BEGIN
  -- Get current state
  SELECT game_type, status, COALESCE(current_round, 0), player1_score, player2_score, COALESCE(p1_current_score, 0), COALESCE(p2_current_score, 0), mode, player1_id, player2_id
  INTO v_current_type, v_status, v_current_round, v_p1_wins, v_p2_wins, v_p1_points, v_p2_points, v_mode, v_p1_id, v_p2_id
  FROM game_sessions WHERE id = p_room_id
  FOR UPDATE;

  -- Graceful Exit if Room Not Found
  IF v_status IS NULL THEN
      RETURN;
  END IF;

  IF v_status = 'finished' THEN
      RETURN;
  END IF;

  -- Race Condition Fix: If already in countdown, do not advance round again.
  IF v_status = 'countdown' THEN
      RETURN;
  END IF;

  -- 1. Snapshot Previous Round (if not first round)
  IF v_current_round > 0 THEN
      -- Determine Round Winner based on POINTS
      IF v_p1_points > v_p2_points THEN
          v_p1_wins := v_p1_wins + 1;
      ELSIF v_p2_points > v_p1_points THEN
          v_p2_wins := v_p2_wins + 1;
      END IF;

      -- Create Snapshot Object
      v_round_snapshot := jsonb_build_object(
          'round', v_current_round,
          'game_type', v_current_type,
          'p1_score', v_p1_points,
          'p2_score', v_p2_points,
          'winner', CASE WHEN v_p1_points > v_p2_points THEN 'p1' WHEN v_p2_points > v_p1_points THEN 'p2' ELSE 'draw' END
      );

      -- Update Session: Add Snapshot, Update Wins, RESET Current Points
      UPDATE game_sessions
      SET round_scores = COALESCE(round_scores, '[]'::jsonb) || jsonb_build_array(v_round_snapshot),
          player1_score = v_p1_wins,
          player2_score = v_p2_wins,
          p1_current_score = 0,
          p2_current_score = 0
      WHERE id = p_room_id;

      -- Update highscores (per minigame)
      IF v_current_type IS NOT NULL THEN
          IF v_p1_id ~ '^[0-9a-fA-F-]{36}$' THEN
              INSERT INTO player_highscores (user_id, game_type, best_score, updated_at)
              VALUES (v_p1_id::uuid, v_current_type, v_p1_points, now())
              ON CONFLICT (user_id, game_type)
              DO UPDATE SET best_score = GREATEST(player_highscores.best_score, EXCLUDED.best_score),
                            updated_at = now();
          END IF;

          IF v_p2_id ~ '^[0-9a-fA-F-]{36}$' THEN
              INSERT INTO player_highscores (user_id, game_type, best_score, updated_at)
              VALUES (v_p2_id::uuid, v_current_type, v_p2_points, now())
              ON CONFLICT (user_id, game_type)
              DO UPDATE SET best_score = GREATEST(player_highscores.best_score, EXCLUDED.best_score),
                            updated_at = now();
          END IF;
      END IF;

      -- Update per-minigame stats (normal/rank)
      IF v_current_type IS NOT NULL AND v_mode IN ('rank', 'normal') THEN
          IF v_p1_id ~ '^[0-9a-fA-F-]{36}$' THEN
              INSERT INTO player_game_stats (
                  user_id, game_type,
                  normal_wins, normal_losses, normal_draws,
                  rank_wins, rank_losses, rank_draws,
                  updated_at
              )
              VALUES (
                  v_p1_id::uuid, v_current_type,
                  CASE WHEN v_mode = 'normal' AND v_p1_points > v_p2_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'normal' AND v_p1_points < v_p2_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'normal' AND v_p1_points = v_p2_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'rank' AND v_p1_points > v_p2_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'rank' AND v_p1_points < v_p2_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'rank' AND v_p1_points = v_p2_points THEN 1 ELSE 0 END,
                  now()
              )
              ON CONFLICT (user_id, game_type)
              DO UPDATE SET
                  normal_wins = player_game_stats.normal_wins + EXCLUDED.normal_wins,
                  normal_losses = player_game_stats.normal_losses + EXCLUDED.normal_losses,
                  normal_draws = player_game_stats.normal_draws + EXCLUDED.normal_draws,
                  rank_wins = player_game_stats.rank_wins + EXCLUDED.rank_wins,
                  rank_losses = player_game_stats.rank_losses + EXCLUDED.rank_losses,
                  rank_draws = player_game_stats.rank_draws + EXCLUDED.rank_draws,
                  updated_at = now();
          END IF;

          IF v_p2_id ~ '^[0-9a-fA-F-]{36}$' THEN
              INSERT INTO player_game_stats (
                  user_id, game_type,
                  normal_wins, normal_losses, normal_draws,
                  rank_wins, rank_losses, rank_draws,
                  updated_at
              )
              VALUES (
                  v_p2_id::uuid, v_current_type,
                  CASE WHEN v_mode = 'normal' AND v_p2_points > v_p1_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'normal' AND v_p2_points < v_p1_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'normal' AND v_p2_points = v_p1_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'rank' AND v_p2_points > v_p1_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'rank' AND v_p2_points < v_p1_points THEN 1 ELSE 0 END,
                  CASE WHEN v_mode = 'rank' AND v_p2_points = v_p1_points THEN 1 ELSE 0 END,
                  now()
              )
              ON CONFLICT (user_id, game_type)
              DO UPDATE SET
                  normal_wins = player_game_stats.normal_wins + EXCLUDED.normal_wins,
                  normal_losses = player_game_stats.normal_losses + EXCLUDED.normal_losses,
                  normal_draws = player_game_stats.normal_draws + EXCLUDED.normal_draws,
                  rank_wins = player_game_stats.rank_wins + EXCLUDED.rank_wins,
                  rank_losses = player_game_stats.rank_losses + EXCLUDED.rank_losses,
                  rank_draws = player_game_stats.rank_draws + EXCLUDED.rank_draws,
                  updated_at = now();
          END IF;
      END IF;
  END IF;

  -- Practice: End after 1 round
  IF v_mode = 'practice' THEN
      UPDATE game_sessions SET status = 'finished', phase_end_at = now(), end_at = now() WHERE id = p_room_id;
      RETURN;
  END IF;

  -- 2. Check Victory Condition (3 rounds fixed)
  IF v_current_round >= 3 THEN
      PERFORM finish_game(p_room_id);
      RETURN;
  END IF;

  -- 3. Pick Next Game Type (Random)
  v_next_type := v_types[floor(random()*array_length(v_types, 1) + 1)];
  
  -- Get duration for next game type
  v_duration := get_game_duration(v_next_type);
  
  -- 4. Setup Game Data
  IF v_next_type = 'RPS' THEN
      v_target := v_opts[floor(random()*3 + 1)];
      v_game_data := '{}';
  ELSE
      v_target := null;
      v_game_data := jsonb_build_object('seed', floor(random()*10000));
  END IF;

  -- 5. Calculate Next Round
  v_next_round := v_current_round + 1;
  v_next_round_index := GREATEST(v_next_round - 1, 0);

  -- 6. Update Session -> PLAYING with 6s warmup (3s round_finished + 3s game_desc) + game duration
  UPDATE game_sessions
  SET status = 'playing',
      current_round = v_next_round,
      current_round_index = v_next_round_index,
      game_type = v_next_type,
      game_data = v_game_data,
      target_move = v_target,
      phase_start_at = now(),
      phase_end_at = now() + interval '6 seconds',
      start_at = now() + interval '6 seconds',
      end_at = now() + interval '6 seconds' + (v_duration || ' seconds')::interval,
      player1_ready = false,
      player2_ready = false
  WHERE id = p_room_id;
END;
$_$;


--
-- Name: stat_increments(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stat_increments(p_game_type text) RETURNS TABLE(speed integer, memory integer, judgment integer, calculation integer, accuracy integer, observation integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_speed int := 0;
    v_memory int := 0;
    v_judgment int := 0;
    v_calculation int := 0;
    v_accuracy int := 0;
    v_observation int := 0;
BEGIN
    CASE p_game_type
        WHEN 'AIM' THEN v_speed := 2; v_accuracy := 1;
        WHEN 'RPS' THEN v_speed := 2; v_judgment := 1;
        WHEN 'UPDOWN' THEN v_judgment := 2; v_speed := 1;
        WHEN 'ARROW' THEN v_speed := 2; v_judgment := 1;
        WHEN 'SLIDER' THEN v_accuracy := 2; v_speed := 1;
        WHEN 'MEMORY' THEN v_memory := 2; v_accuracy := 1;
        WHEN 'SEQUENCE' THEN v_memory := 2; v_accuracy := 1;
        WHEN 'SEQUENCE_NORMAL' THEN v_memory := 2; v_accuracy := 1;
        WHEN 'SPY' THEN v_memory := 2; v_observation := 1;
        WHEN 'PAIR' THEN v_memory := 2; v_observation := 1;
        WHEN 'COLOR' THEN v_observation := 2; v_accuracy := 1;
        WHEN 'MOST_COLOR' THEN v_observation := 2; v_judgment := 1;
        WHEN 'TAP_COLOR' THEN v_observation := 2; v_speed := 1;
        WHEN 'MATH' THEN v_calculation := 2; v_accuracy := 1;
        WHEN 'TEN' THEN v_calculation := 2; v_judgment := 1;
        WHEN 'BLANK' THEN v_calculation := 2; v_accuracy := 1;
        WHEN 'OPERATOR' THEN v_calculation := 2; v_judgment := 1;
        WHEN 'LARGEST' THEN v_calculation := 2; v_judgment := 1;
        WHEN 'NUMBER' THEN v_accuracy := 2; v_judgment := 1;
        WHEN 'NUMBER_DESC' THEN v_accuracy := 2; v_judgment := 1;
        WHEN 'NUMBER_ASC' THEN v_accuracy := 2; v_judgment := 1;
        WHEN 'SORTING' THEN v_accuracy := 2; v_judgment := 1;
        WHEN 'LADDER' THEN v_judgment := 2; v_accuracy := 1;
        WHEN 'PATH' THEN v_speed := 2; v_judgment := 1;
        WHEN 'BALLS' THEN v_observation := 2; v_accuracy := 1;
        WHEN 'BLIND_PATH' THEN v_observation := 2; v_accuracy := 1;
        WHEN 'CATCH_COLOR' THEN v_speed := 2; v_accuracy := 1;
        WHEN 'TIMING_BAR' THEN v_speed := 2; v_accuracy := 1;
        WHEN 'STAIRWAY' THEN v_speed := 2; v_judgment := 1;
        ELSE
            -- no-op
    END CASE;

    RETURN QUERY SELECT v_speed, v_memory, v_judgment, v_calculation, v_accuracy, v_observation;
END;
$$;


--
-- Name: submit_move(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_move(p_room_id uuid, p_player_id text, p_move text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_game_type text;
  v_round int;
  v_target text;
  v_mode text;
  v_opts text[] := ARRAY['rock','paper','scissors'];
  v_p1 text;
  v_p2 text;
  v_p1_move_standard text;
  v_p2_move_standard text;
  v_p1_time int;
  v_p2_time int;
BEGIN
  SELECT game_type, current_round, target_move, mode
  INTO v_game_type, v_round, v_target, v_mode
  FROM game_sessions WHERE id = p_room_id;

  INSERT INTO game_moves (room_id, player_id, round, move)
  VALUES (p_room_id, p_player_id, v_round, p_move);
  
  -- PRACTICE LOGIC
  IF v_mode = 'practice' THEN
      -- Immediate Finish on Success
      IF v_game_type = 'RPS' THEN
          DECLARE
              v_win_move text;
          BEGIN
              IF v_target = 'rock' THEN v_win_move := 'paper';
              ELSIF v_target = 'paper' THEN v_win_move := 'scissors';
              ELSE v_win_move := 'rock';
              END IF;

              IF p_move = v_win_move THEN
                 UPDATE game_sessions 
                 SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
                 WHERE id = p_room_id;
              ELSE
                 UPDATE game_sessions 
                 SET status = 'finished', end_at = now() 
                 WHERE id = p_room_id;
              END IF;
          END;
          RETURN;
      ELSE
          -- Time Attack Games: "DONE:xxx"
          IF p_move LIKE 'DONE:%' THEN
              UPDATE game_sessions 
              SET player1_score = 1, status = 'finished', end_at = now(), winner_id = p_player_id
              WHERE id = p_room_id;
              RETURN;
          END IF;
      END IF;
      RETURN;
  END IF;

  -- STANDARD LOGIC (For Normal/Rank)
  SELECT player1_id, player2_id INTO v_p1, v_p2 FROM game_sessions WHERE id = p_room_id;

  IF v_game_type = 'RPS' THEN
      DECLARE
          v_win_move_std text;
      BEGIN
          IF v_target = 'rock' THEN v_win_move_std := 'paper';
          ELSIF v_target = 'paper' THEN v_win_move_std := 'scissors';
          ELSE v_win_move_std := 'rock';
          END IF;

          IF p_move = v_win_move_std THEN
             IF p_player_id = v_p1 THEN
                UPDATE game_sessions SET player1_score = player1_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
             ELSE
                UPDATE game_sessions SET player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
             END IF;
          END IF;
      END;
  -- Added SPY here
  ELSIF v_game_type LIKE 'NUMBER%' OR v_game_type IN ('MATH', 'TEN', 'COLOR', 'MEMORY', 'SEQUENCE', 'SEQUENCE_NORMAL', 'LARGEST', 'PAIR', 'UPDOWN', 'SLIDER', 'ARROW', 'BLANK', 'OPERATOR', 'LADDER', 'TAP_COLOR', 'AIM', 'MOST_COLOR', 'SORTING', 'SPY') THEN
      SELECT move INTO v_p1_move_standard FROM game_moves WHERE room_id = p_room_id AND round = v_round AND player_id = v_p1 AND move LIKE 'DONE:%' LIMIT 1;
      SELECT move INTO v_p2_move_standard FROM game_moves WHERE room_id = p_room_id AND round = v_round AND player_id = v_p2 AND move LIKE 'DONE:%' LIMIT 1;

      IF v_p1_move_standard IS NOT NULL AND v_p2_move_standard IS NOT NULL THEN
          v_p1_time := cast(split_part(v_p1_move_standard, ':', 2) AS int);
          v_p2_time := cast(split_part(v_p2_move_standard, ':', 2) AS int);
          IF v_p1_time < v_p2_time THEN
             UPDATE game_sessions SET player1_score = player1_score + 3, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          ELSIF v_p2_time < v_p1_time THEN
             UPDATE game_sessions SET player2_score = player2_score + 3, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          ELSE
             UPDATE game_sessions SET player1_score = player1_score + 1, player2_score = player2_score + 1, status = 'round_end', phase_end_at = now() WHERE id = p_room_id;
          END IF;
       ELSE
          UPDATE game_sessions SET phase_end_at = now() + interval '500 milliseconds' WHERE id = p_room_id;
      END IF;
  END IF;
END;
$$;


--
-- Name: trigger_game_start(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_game_start(p_room_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE game_sessions
  SET status = 'playing',
      phase_start_at = now(),
      phase_end_at = COALESCE(end_at, now() + interval '30 seconds')
  WHERE id = p_room_id AND status = 'countdown';
END;
$$;


--
-- Name: update_last_seen(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_last_seen() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Only update if the user initiated the change (e.g., via a heartbeat call)
  -- or we could blindly update it on any profile change, but a specific RPC is better.
  NEW.last_seen = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_mmr(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_mmr(p_room_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_mode text;
  v_p1 uuid; v_p2 uuid;
  v_p1_score int; v_p2_score int;
  v_p1_mmr int; v_p2_mmr int;
  v_k int := 32;
  v_expect_p1 float; v_actual_p1 float;
  v_p1_chg int; v_p2_chg int;
BEGIN
  -- Get Session Info
  select mode, player1_id::uuid, player2_id::uuid, player1_score, player2_score
  into v_mode, v_p1, v_p2, v_p1_score, v_p2_score
  from game_sessions where id = p_room_id;

  -- Default to rank if null
  if v_mode is null then v_mode := 'rank'; end if;

  -- Fetch Current MMRs (Needed for calculation even if not updating in casual? No, casual doesn't use MMR)
  -- Actually, let's just calculate win/loss result first.
  
  if v_p1_score > v_p2_score then v_actual_p1 := 1.0;
  elsif v_p2_score > v_p1_score then v_actual_p1 := 0.0;
  else v_actual_p1 := 0.5;
  end if;

  -- === CASUAL MODE ===
  if v_mode != 'rank' then
      -- Just update casual W/L, NO MMR CHANGE
      update public.profiles 
      set casual_wins = casual_wins + (case when v_actual_p1 = 1.0 then 1 else 0 end),
          casual_losses = casual_losses + (case when v_actual_p1 = 0.0 then 1 else 0 end)
      where id = v_p1;

      update public.profiles 
      set casual_wins = casual_wins + (case when v_actual_p1 = 0.0 then 1 else 0 end),
          casual_losses = casual_losses + (case when v_actual_p1 = 1.0 then 1 else 0 end)
      where id = v_p2;

      -- Set session mmr_change to 0 or null to indicate no change
      update game_sessions set player1_mmr_change = 0, player2_mmr_change = 0 where id = p_room_id;
      return;
  end if;

  -- === RANK MODE (MMR Logic) ===
  
  -- Fetch Profiles
  select mmr into v_p1_mmr from public.profiles where id = v_p1;
  select mmr into v_p2_mmr from public.profiles where id = v_p2;

  -- Safety check
  if v_p1_mmr is null or v_p2_mmr is null then return; end if;

  -- Elo Calculation
  v_expect_p1 := 1.0 / (1.0 + power(10.0, (v_p2_mmr - v_p1_mmr)::float / 400.0));
  
  v_p1_chg := round(v_k * (v_actual_p1 - v_expect_p1));
  v_p2_chg := round(v_k * ((1.0 - v_actual_p1) - (1.0 - v_expect_p1)));

  -- Update DB (Rank Stats)
  update public.profiles 
  set mmr = mmr + v_p1_chg, 
      wins = wins + (case when v_actual_p1 = 1.0 then 1 else 0 end), 
      losses = losses + (case when v_actual_p1 = 0.0 then 1 else 0 end) 
  where id = v_p1;

  update public.profiles 
  set mmr = mmr + v_p2_chg, 
      wins = wins + (case when v_actual_p1 = 0.0 then 1 else 0 end), 
      losses = losses + (case when v_actual_p1 = 1.0 then 1 else 0 end) 
  where id = v_p2;
  
  -- Save Change to Session
  update game_sessions set player1_mmr_change = v_p1_chg, player2_mmr_change = v_p2_chg where id = p_room_id;
END;
$$;


--
-- Name: update_score(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_score(p_room_id uuid, p_player_id text, p_score integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_p1 text;
    v_p2 text;
    v_status text;
    v_p1_points int;
    v_p2_points int;
    v_bot_target int;
BEGIN
    SELECT player1_id, player2_id, status, COALESCE(p1_current_score, 0), COALESCE(p2_current_score, 0)
    INTO v_p1, v_p2, v_status, v_p1_points, v_p2_points
    FROM game_sessions WHERE id = p_room_id;

    IF v_p1 IS NULL THEN
        RAISE EXCEPTION 'Room not found';
    END IF;

    IF v_status = 'finished' THEN
        RETURN;
    END IF;

    -- Security Check: Allow if p_player_id matches valid players in the room
    IF p_player_id != v_p1 AND p_player_id != v_p2 THEN
        IF auth.uid() IS NOT NULL AND auth.uid()::text != p_player_id THEN
            RAISE EXCEPTION 'Not authorized';
        END IF;
    END IF;

    IF p_player_id = v_p1 THEN
        UPDATE game_sessions SET p1_current_score = p_score WHERE id = p_room_id;

        IF v_p2 LIKE 'bot_%' THEN
            v_bot_target := GREATEST(0, LEAST(p_score - 20, floor(p_score * 0.9)));
            IF v_bot_target < v_p2_points THEN
                v_bot_target := v_p2_points;
            END IF;
            UPDATE game_sessions SET p2_current_score = v_bot_target WHERE id = p_room_id;
        END IF;
    ELSIF p_player_id = v_p2 THEN
        UPDATE game_sessions SET p2_current_score = p_score WHERE id = p_room_id;

        IF v_p1 LIKE 'bot_%' THEN
            v_bot_target := GREATEST(0, LEAST(p_score - 20, floor(p_score * 0.9)));
            IF v_bot_target < v_p1_points THEN
                v_bot_target := v_p1_points;
            END IF;
            UPDATE game_sessions SET p1_current_score = v_bot_target WHERE id = p_room_id;
        END IF;
    END IF;
END;
$$;


--
-- Name: apply_rls(jsonb, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024)) RETURNS SETOF realtime.wal_rls
    LANGUAGE plpgsql
    AS $$
declare
-- Regclass of the table e.g. public.notes
entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

-- I, U, D, T: insert, update ...
action realtime.action = (
    case wal ->> 'action'
        when 'I' then 'INSERT'
        when 'U' then 'UPDATE'
        when 'D' then 'DELETE'
        else 'ERROR'
    end
);

-- Is row level security enabled for the table
is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

subscriptions realtime.subscription[] = array_agg(subs)
    from
        realtime.subscription subs
    where
        subs.entity = entity_
        -- Filter by action early - only get subscriptions interested in this action
        -- action_filter column can be: '*' (all), 'INSERT', 'UPDATE', or 'DELETE'
        and (subs.action_filter = '*' or subs.action_filter = action::text);

-- Subscription vars
roles regrole[] = array_agg(distinct us.claims_role::text)
    from
        unnest(subscriptions) us;

working_role regrole;
claimed_role regrole;
claims jsonb;

subscription_id uuid;
subscription_has_access bool;
visible_to_subscription_ids uuid[] = '{}';

-- structured info for wal's columns
columns realtime.wal_column[];
-- previous identity values for update/delete
old_columns realtime.wal_column[];

error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

-- Primary jsonb output for record
output jsonb;

begin
perform set_config('role', null, true);

columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'columns') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

old_columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'identity') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

for working_role in select * from unnest(roles) loop

    -- Update `is_selectable` for columns and old_columns
    columns =
        array_agg(
            (
                c.name,
                c.type_name,
                c.type_oid,
                c.value,
                c.is_pkey,
                pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
            )::realtime.wal_column
        )
        from
            unnest(columns) c;

    old_columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(old_columns) c;

    if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            -- subscriptions is already filtered by entity
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 400: Bad Request, no primary key']
        )::realtime.wal_rls;

    -- The claims role does not have SELECT permission to the primary key of entity
    elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 401: Unauthorized']
        )::realtime.wal_rls;

    else
        output = jsonb_build_object(
            'schema', wal ->> 'schema',
            'table', wal ->> 'table',
            'type', action,
            'commit_timestamp', to_char(
                ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            ),
            'columns', (
                select
                    jsonb_agg(
                        jsonb_build_object(
                            'name', pa.attname,
                            'type', pt.typname
                        )
                        order by pa.attnum asc
                    )
                from
                    pg_attribute pa
                    join pg_type pt
                        on pa.atttypid = pt.oid
                where
                    attrelid = entity_
                    and attnum > 0
                    and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
            )
        )
        -- Add "record" key for insert and update
        || case
            when action in ('INSERT', 'UPDATE') then
                jsonb_build_object(
                    'record',
                    (
                        select
                            jsonb_object_agg(
                                -- if unchanged toast, get column name and value from old record
                                coalesce((c).name, (oc).name),
                                case
                                    when (c).name is null then (oc).value
                                    else (c).value
                                end
                            )
                        from
                            unnest(columns) c
                            full outer join unnest(old_columns) oc
                                on (c).name = (oc).name
                        where
                            coalesce((c).is_selectable, (oc).is_selectable)
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                    )
                )
            else '{}'::jsonb
        end
        -- Add "old_record" key for update and delete
        || case
            when action = 'UPDATE' then
                jsonb_build_object(
                        'old_record',
                        (
                            select jsonb_object_agg((c).name, (c).value)
                            from unnest(old_columns) c
                            where
                                (c).is_selectable
                                and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                        )
                    )
            when action = 'DELETE' then
                jsonb_build_object(
                    'old_record',
                    (
                        select jsonb_object_agg((c).name, (c).value)
                        from unnest(old_columns) c
                        where
                            (c).is_selectable
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                    )
                )
            else '{}'::jsonb
        end;

        -- Create the prepared statement
        if is_rls_enabled and action <> 'DELETE' then
            if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                deallocate walrus_rls_stmt;
            end if;
            execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
        end if;

        visible_to_subscription_ids = '{}';

        for subscription_id, claims in (
                select
                    subs.subscription_id,
                    subs.claims
                from
                    unnest(subscriptions) subs
                where
                    subs.entity = entity_
                    and subs.claims_role = working_role
                    and (
                        realtime.is_visible_through_filters(columns, subs.filters)
                        or (
                          action = 'DELETE'
                          and realtime.is_visible_through_filters(old_columns, subs.filters)
                        )
                    )
        ) loop

            if not is_rls_enabled or action = 'DELETE' then
                visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
            else
                -- Check if RLS allows the role to see the record
                perform
                    -- Trim leading and trailing quotes from working_role because set_config
                    -- doesn't recognize the role as valid if they are included
                    set_config('role', trim(both '"' from working_role::text), true),
                    set_config('request.jwt.claims', claims::text, true);

                execute 'execute walrus_rls_stmt' into subscription_has_access;

                if subscription_has_access then
                    visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
                end if;
            end if;
        end loop;

        perform set_config('role', null, true);

        return next (
            output,
            is_rls_enabled,
            visible_to_subscription_ids,
            case
                when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                else '{}'
            end
        )::realtime.wal_rls;

    end if;
end loop;

perform set_config('role', null, true);
end;
$$;


--
-- Name: broadcast_changes(text, text, text, text, text, record, record, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$$;


--
-- Name: build_prepared_statement_sql(text, regclass, realtime.wal_column[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) RETURNS text
    LANGUAGE sql
    AS $$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $$;


--
-- Name: cast(text, regtype); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
    declare
      res jsonb;
    begin
      execute format('select to_jsonb(%L::'|| type_::text || ')', val)  into res;
      return res;
    end
    $$;


--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
      /*
      Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
      */
      declare
          op_symbol text = (
              case
                  when op = 'eq' then '='
                  when op = 'neq' then '!='
                  when op = 'lt' then '<'
                  when op = 'lte' then '<='
                  when op = 'gt' then '>'
                  when op = 'gte' then '>='
                  when op = 'in' then '= any'
                  else 'UNKNOWN OP'
              end
          );
          res boolean;
      begin
          execute format(
              'select %L::'|| type_::text || ' ' || op_symbol
              || ' ( %L::'
              || (
                  case
                      when op = 'in' then type_::text || '[]'
                      else type_::text end
              )
              || ')', val_1, val_2) into res;
          return res;
      end;
      $$;


--
-- Name: is_visible_through_filters(realtime.wal_column[], realtime.user_defined_filter[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $_$
    /*
    Should the record be visible (true) or filtered out (false) after *filters* are applied
    */
        select
            -- Default to allowed when no filters present
            $2 is null -- no filters. this should not happen because subscriptions has a default
            or array_length($2, 1) is null -- array length of an empty array is null
            or bool_and(
                coalesce(
                    realtime.check_equality_op(
                        op:=f.op,
                        type_:=coalesce(
                            col.type_oid::regtype, -- null when wal2json version <= 2.4
                            col.type_name::regtype
                        ),
                        -- cast jsonb to text
                        val_1:=col.value #>> '{}',
                        val_2:=f.value
                    ),
                    false -- if null, filter does not match
                )
            )
        from
            unnest(filters) f
            join unnest(columns) col
                on f.column_name = col.name;
    $_$;


--
-- Name: list_changes(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS SETOF realtime.wal_rls
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
      with pub as (
        select
          concat_ws(
            ',',
            case when bool_or(pubinsert) then 'insert' else null end,
            case when bool_or(pubupdate) then 'update' else null end,
            case when bool_or(pubdelete) then 'delete' else null end
          ) as w2j_actions,
          coalesce(
            string_agg(
              realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
              ','
            ) filter (where ppt.tablename is not null and ppt.tablename not like '% %'),
            ''
          ) w2j_add_tables
        from
          pg_publication pp
          left join pg_publication_tables ppt
            on pp.pubname = ppt.pubname
        where
          pp.pubname = publication
        group by
          pp.pubname
        limit 1
      ),
      w2j as (
        select
          x.*, pub.w2j_add_tables
        from
          pub,
          pg_logical_slot_get_changes(
            slot_name, null, max_changes,
            'include-pk', 'true',
            'include-transaction', 'false',
            'include-timestamp', 'true',
            'include-type-oids', 'true',
            'format-version', '2',
            'actions', pub.w2j_actions,
            'add-tables', pub.w2j_add_tables
          ) x
      )
      select
        xyz.wal,
        xyz.is_rls_enabled,
        xyz.subscription_ids,
        xyz.errors
      from
        w2j,
        realtime.apply_rls(
          wal := w2j.data::jsonb,
          max_record_bytes := max_record_bytes
        ) xyz(wal, is_rls_enabled, subscription_ids, errors)
      where
        w2j.w2j_add_tables <> ''
        and xyz.subscription_ids[1] is not null
    $$;


--
-- Name: quote_wal2json(regclass); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
      select
        (
          select string_agg('' || ch,'')
          from unnest(string_to_array(nsp.nspname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
        )
        || '.'
        || (
          select string_agg('' || ch,'')
          from unnest(string_to_array(pc.relname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
          )
      from
        pg_class pc
        join pg_namespace nsp
          on pc.relnamespace = nsp.oid
      where
        pc.oid = entity
    $$;


--
-- Name: send(jsonb, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    -- Generate a new UUID for the id
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    -- Attempt to insert the message
    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      -- Capture and notify the error
      RAISE WARNING 'ErrorSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


--
-- Name: subscription_check_filters(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.subscription_check_filters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    /*
    Validates that the user defined filters for a subscription:
    - refer to valid columns that the claimed role may access
    - values are coercable to the correct column type
    */
    declare
        col_names text[] = coalesce(
                array_agg(c.column_name order by c.ordinal_position),
                '{}'::text[]
            )
            from
                information_schema.columns c
            where
                format('%I.%I', c.table_schema, c.table_name)::regclass = new.entity
                and pg_catalog.has_column_privilege(
                    (new.claims ->> 'role'),
                    format('%I.%I', c.table_schema, c.table_name)::regclass,
                    c.column_name,
                    'SELECT'
                );
        filter realtime.user_defined_filter;
        col_type regtype;

        in_val jsonb;
    begin
        for filter in select * from unnest(new.filters) loop
            -- Filtered column is valid
            if not filter.column_name = any(col_names) then
                raise exception 'invalid column for filter %', filter.column_name;
            end if;

            -- Type is sanitized and safe for string interpolation
            col_type = (
                select atttypid::regtype
                from pg_catalog.pg_attribute
                where attrelid = new.entity
                      and attname = filter.column_name
            );
            if col_type is null then
                raise exception 'failed to lookup type for column %', filter.column_name;
            end if;

            -- Set maximum number of entries for in filter
            if filter.op = 'in'::realtime.equality_op then
                in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
                if coalesce(jsonb_array_length(in_val), 0) > 100 then
                    raise exception 'too many values for `in` filter. Maximum 100';
                end if;
            else
                -- raises an exception if value is not coercable to type
                perform realtime.cast(filter.value, col_type);
            end if;

        end loop;

        -- Apply consistent order to filters so the unique constraint on
        -- (subscription_id, entity, filters) can't be tricked by a different filter order
        new.filters = coalesce(
            array_agg(f order by f.column_name, f.op, f.value),
            '{}'
        ) from unnest(new.filters) f;

        return new;
    end;
    $$;


--
-- Name: to_regrole(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE sql IMMUTABLE
    AS $$ select role_name::regrole $$;


--
-- Name: topic(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.topic() RETURNS text
    LANGUAGE sql STABLE
    AS $$
select nullif(current_setting('realtime.topic', true), '')::text;
$$;


--
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


--
-- Name: delete_leaf_prefixes(text[], text[]); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.delete_leaf_prefixes(bucket_ids text[], names text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_rows_deleted integer;
BEGIN
    LOOP
        WITH candidates AS (
            SELECT DISTINCT
                t.bucket_id,
                unnest(storage.get_prefixes(t.name)) AS name
            FROM unnest(bucket_ids, names) AS t(bucket_id, name)
        ),
        uniq AS (
             SELECT
                 bucket_id,
                 name,
                 storage.get_level(name) AS level
             FROM candidates
             WHERE name <> ''
             GROUP BY bucket_id, name
        ),
        leaf AS (
             SELECT
                 p.bucket_id,
                 p.name,
                 p.level
             FROM storage.prefixes AS p
                  JOIN uniq AS u
                       ON u.bucket_id = p.bucket_id
                           AND u.name = p.name
                           AND u.level = p.level
             WHERE NOT EXISTS (
                 SELECT 1
                 FROM storage.objects AS o
                 WHERE o.bucket_id = p.bucket_id
                   AND o.level = p.level + 1
                   AND o.name COLLATE "C" LIKE p.name || '/%'
             )
             AND NOT EXISTS (
                 SELECT 1
                 FROM storage.prefixes AS c
                 WHERE c.bucket_id = p.bucket_id
                   AND c.level = p.level + 1
                   AND c.name COLLATE "C" LIKE p.name || '/%'
             )
        )
        DELETE
        FROM storage.prefixes AS p
            USING leaf AS l
        WHERE p.bucket_id = l.bucket_id
          AND p.name = l.name
          AND p.level = l.level;

        GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
        EXIT WHEN v_rows_deleted = 0;
    END LOOP;
END;
$$;


--
-- Name: enforce_bucket_name_length(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.enforce_bucket_name_length() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


--
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    SELECT _parts[array_length(_parts,1)] INTO _filename;
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


--
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


--
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$$;


--
-- Name: get_common_prefix(text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_common_prefix(p_key text, p_prefix text, p_delimiter text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
SELECT CASE
    WHEN position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)) > 0
    THEN left(p_key, length(p_prefix) + position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)))
    ELSE NULL
END;
$$;


--
-- Name: get_level(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_level(name text) RETURNS integer
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
SELECT array_length(string_to_array("name", '/'), 1);
$$;


--
-- Name: get_prefix(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_prefix(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $_$
SELECT
    CASE WHEN strpos("name", '/') > 0 THEN
             regexp_replace("name", '[\/]{1}[^\/]+\/?$', '')
         ELSE
             ''
        END;
$_$;


--
-- Name: get_prefixes(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_prefixes(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $$
DECLARE
    parts text[];
    prefixes text[];
    prefix text;
BEGIN
    -- Split the name into parts by '/'
    parts := string_to_array("name", '/');
    prefixes := '{}';

    -- Construct the prefixes, stopping one level below the last part
    FOR i IN 1..array_length(parts, 1) - 1 LOOP
            prefix := array_to_string(parts[1:i], '/');
            prefixes := array_append(prefixes, prefix);
    END LOOP;

    RETURN prefixes;
END;
$$;


--
-- Name: get_size_by_bucket(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_size_by_bucket() RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::bigint) as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


--
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text) RETURNS TABLE(key text, id text, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


--
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_objects_with_delimiter(_bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;

    -- Configuration
    v_is_asc BOOLEAN;
    v_prefix TEXT;
    v_start TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_is_asc := lower(coalesce(sort_order, 'asc')) = 'asc';
    v_prefix := coalesce(prefix_param, '');
    v_start := CASE WHEN coalesce(next_token, '') <> '' THEN next_token ELSE coalesce(start_after, '') END;
    v_file_batch_size := LEAST(GREATEST(max_keys * 2, 100), 1000);

    -- Calculate upper bound for prefix filtering (bytewise, using COLLATE "C")
    IF v_prefix = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix, 1) = delimiter_param THEN
        v_upper_bound := left(v_prefix, -1) || chr(ascii(delimiter_param) + 1);
    ELSE
        v_upper_bound := left(v_prefix, -1) || chr(ascii(right(v_prefix, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'AND o.name COLLATE "C" < $3 ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'AND o.name COLLATE "C" >= $3 ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- ========================================================================
    -- SEEK INITIALIZATION: Determine starting position
    -- ========================================================================
    IF v_start = '' THEN
        IF v_is_asc THEN
            v_next_seek := v_prefix;
        ELSE
            -- DESC without cursor: find the last item in range
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;

            IF v_next_seek IS NOT NULL THEN
                v_next_seek := v_next_seek || delimiter_param;
            ELSE
                RETURN;
            END IF;
        END IF;
    ELSE
        -- Cursor provided: determine if it refers to a folder or leaf
        IF EXISTS (
            SELECT 1 FROM storage.objects o
            WHERE o.bucket_id = _bucket_id
              AND o.name COLLATE "C" LIKE v_start || delimiter_param || '%'
            LIMIT 1
        ) THEN
            -- Cursor refers to a folder
            IF v_is_asc THEN
                v_next_seek := v_start || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_start || delimiter_param;
            END IF;
        ELSE
            -- Cursor refers to a leaf object
            IF v_is_asc THEN
                v_next_seek := v_start || delimiter_param;
            ELSE
                v_next_seek := v_start;
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= max_keys;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(v_peek_name, v_prefix, delimiter_param);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Emit and skip to next folder (no heap access needed)
            name := rtrim(v_common_prefix, delimiter_param);
            id := NULL;
            updated_at := NULL;
            created_at := NULL;
            last_accessed_at := NULL;
            metadata := NULL;
            RETURN NEXT;
            v_count := v_count + 1;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := left(v_common_prefix, -1) || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_common_prefix;
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query USING _bucket_id, v_next_seek,
                CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(v_current.name, v_prefix, delimiter_param);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := v_current.name;
                    EXIT;
                END IF;

                -- Emit file
                name := v_current.name;
                id := v_current.id;
                updated_at := v_current.updated_at;
                created_at := v_current.created_at;
                last_accessed_at := v_current.last_accessed_at;
                metadata := v_current.metadata;
                RETURN NEXT;
                v_count := v_count + 1;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := v_current.name || delimiter_param;
                ELSE
                    v_next_seek := v_current.name;
                END IF;

                EXIT WHEN v_count >= max_keys;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


--
-- Name: protect_delete(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.protect_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$$;


--
-- Name: search(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;
    v_delimiter CONSTANT TEXT := '/';

    -- Configuration
    v_limit INT;
    v_prefix TEXT;
    v_prefix_lower TEXT;
    v_is_asc BOOLEAN;
    v_order_by TEXT;
    v_sort_order TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;
    v_skipped INT := 0;
BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_limit := LEAST(coalesce(limits, 100), 1500);
    v_prefix := coalesce(prefix, '') || coalesce(search, '');
    v_prefix_lower := lower(v_prefix);
    v_is_asc := lower(coalesce(sortorder, 'asc')) = 'asc';
    v_file_batch_size := LEAST(GREATEST(v_limit * 2, 100), 1000);

    -- Validate sort column
    CASE lower(coalesce(sortcolumn, 'name'))
        WHEN 'name' THEN v_order_by := 'name';
        WHEN 'updated_at' THEN v_order_by := 'updated_at';
        WHEN 'created_at' THEN v_order_by := 'created_at';
        WHEN 'last_accessed_at' THEN v_order_by := 'last_accessed_at';
        ELSE v_order_by := 'name';
    END CASE;

    v_sort_order := CASE WHEN v_is_asc THEN 'asc' ELSE 'desc' END;

    -- ========================================================================
    -- NON-NAME SORTING: Use path_tokens approach (unchanged)
    -- ========================================================================
    IF v_order_by != 'name' THEN
        RETURN QUERY EXECUTE format(
            $sql$
            WITH folders AS (
                SELECT path_tokens[$1] AS folder
                FROM storage.objects
                WHERE objects.name ILIKE $2 || '%%'
                  AND bucket_id = $3
                  AND array_length(objects.path_tokens, 1) <> $1
                GROUP BY folder
                ORDER BY folder %s
            )
            (SELECT folder AS "name",
                   NULL::uuid AS id,
                   NULL::timestamptz AS updated_at,
                   NULL::timestamptz AS created_at,
                   NULL::timestamptz AS last_accessed_at,
                   NULL::jsonb AS metadata FROM folders)
            UNION ALL
            (SELECT path_tokens[$1] AS "name",
                   id, updated_at, created_at, last_accessed_at, metadata
             FROM storage.objects
             WHERE objects.name ILIKE $2 || '%%'
               AND bucket_id = $3
               AND array_length(objects.path_tokens, 1) = $1
             ORDER BY %I %s)
            LIMIT $4 OFFSET $5
            $sql$, v_sort_order, v_order_by, v_sort_order
        ) USING levels, v_prefix, bucketname, v_limit, offsets;
        RETURN;
    END IF;

    -- ========================================================================
    -- NAME SORTING: Hybrid skip-scan with batch optimization
    -- ========================================================================

    -- Calculate upper bound for prefix filtering
    IF v_prefix_lower = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix_lower, 1) = v_delimiter THEN
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(v_delimiter) + 1);
    ELSE
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(right(v_prefix_lower, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'AND lower(o.name) COLLATE "C" < $3 ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'AND lower(o.name) COLLATE "C" >= $3 ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- Initialize seek position
    IF v_is_asc THEN
        v_next_seek := v_prefix_lower;
    ELSE
        -- DESC: find the last item in range first (static SQL)
        IF v_upper_bound IS NOT NULL THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower AND lower(o.name) COLLATE "C" < v_upper_bound
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSIF v_prefix_lower <> '' THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSE
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        END IF;

        IF v_peek_name IS NOT NULL THEN
            v_next_seek := lower(v_peek_name) || v_delimiter;
        ELSE
            RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= v_limit;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix_lower <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(lower(v_peek_name), v_prefix_lower, v_delimiter);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Handle offset, emit if needed, skip to next folder
            IF v_skipped < offsets THEN
                v_skipped := v_skipped + 1;
            ELSE
                name := split_part(rtrim(storage.get_common_prefix(v_peek_name, v_prefix, v_delimiter), v_delimiter), v_delimiter, levels);
                id := NULL;
                updated_at := NULL;
                created_at := NULL;
                last_accessed_at := NULL;
                metadata := NULL;
                RETURN NEXT;
                v_count := v_count + 1;
            END IF;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := lower(left(v_common_prefix, -1)) || chr(ascii(v_delimiter) + 1);
            ELSE
                v_next_seek := lower(v_common_prefix);
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix_lower is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := lower(v_current.name);
                    EXIT;
                END IF;

                -- Handle offset skipping
                IF v_skipped < offsets THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    -- Emit file
                    name := split_part(v_current.name, v_delimiter, levels);
                    id := v_current.id;
                    updated_at := v_current.updated_at;
                    created_at := v_current.created_at;
                    last_accessed_at := v_current.last_accessed_at;
                    metadata := v_current.metadata;
                    RETURN NEXT;
                    v_count := v_count + 1;
                END IF;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := lower(v_current.name) || v_delimiter;
                ELSE
                    v_next_seek := lower(v_current.name);
                END IF;

                EXIT WHEN v_count >= v_limit;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: search_by_timestamp(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_by_timestamp(p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_cursor_op text;
    v_query text;
    v_prefix text;
BEGIN
    v_prefix := coalesce(p_prefix, '');

    IF p_sort_order = 'asc' THEN
        v_cursor_op := '>';
    ELSE
        v_cursor_op := '<';
    END IF;

    v_query := format($sql$
        WITH raw_objects AS (
            SELECT
                o.name AS obj_name,
                o.id AS obj_id,
                o.updated_at AS obj_updated_at,
                o.created_at AS obj_created_at,
                o.last_accessed_at AS obj_last_accessed_at,
                o.metadata AS obj_metadata,
                storage.get_common_prefix(o.name, $1, '/') AS common_prefix
            FROM storage.objects o
            WHERE o.bucket_id = $2
              AND o.name COLLATE "C" LIKE $1 || '%%'
        ),
        -- Aggregate common prefixes (folders)
        -- Both created_at and updated_at use MIN(obj_created_at) to match the old prefixes table behavior
        aggregated_prefixes AS (
            SELECT
                rtrim(common_prefix, '/') AS name,
                NULL::uuid AS id,
                MIN(obj_created_at) AS updated_at,
                MIN(obj_created_at) AS created_at,
                NULL::timestamptz AS last_accessed_at,
                NULL::jsonb AS metadata,
                TRUE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NOT NULL
            GROUP BY common_prefix
        ),
        leaf_objects AS (
            SELECT
                obj_name AS name,
                obj_id AS id,
                obj_updated_at AS updated_at,
                obj_created_at AS created_at,
                obj_last_accessed_at AS last_accessed_at,
                obj_metadata AS metadata,
                FALSE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NULL
        ),
        combined AS (
            SELECT * FROM aggregated_prefixes
            UNION ALL
            SELECT * FROM leaf_objects
        ),
        filtered AS (
            SELECT *
            FROM combined
            WHERE (
                $5 = ''
                OR ROW(
                    date_trunc('milliseconds', %I),
                    name COLLATE "C"
                ) %s ROW(
                    COALESCE(NULLIF($6, '')::timestamptz, 'epoch'::timestamptz),
                    $5
                )
            )
        )
        SELECT
            split_part(name, '/', $3) AS key,
            name,
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
        FROM filtered
        ORDER BY
            COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz) %s,
            name COLLATE "C" %s
        LIMIT $4
    $sql$,
        p_sort_column,
        v_cursor_op,
        p_sort_column,
        p_sort_order,
        p_sort_order
    );

    RETURN QUERY EXECUTE v_query
    USING v_prefix, p_bucket_id, p_level, p_limit, p_start_after, p_sort_column_after;
END;
$_$;


--
-- Name: search_legacy_v1(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_legacy_v1(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
declare
    v_order_by text;
    v_sort_order text;
begin
    case
        when sortcolumn = 'name' then
            v_order_by = 'name';
        when sortcolumn = 'updated_at' then
            v_order_by = 'updated_at';
        when sortcolumn = 'created_at' then
            v_order_by = 'created_at';
        when sortcolumn = 'last_accessed_at' then
            v_order_by = 'last_accessed_at';
        else
            v_order_by = 'name';
        end case;

    case
        when sortorder = 'asc' then
            v_sort_order = 'asc';
        when sortorder = 'desc' then
            v_sort_order = 'desc';
        else
            v_sort_order = 'asc';
        end case;

    v_order_by = v_order_by || ' ' || v_sort_order;

    return query execute
        'with folders as (
           select path_tokens[$1] as folder
           from storage.objects
             where objects.name ilike $2 || $3 || ''%''
               and bucket_id = $4
               and array_length(objects.path_tokens, 1) <> $1
           group by folder
           order by folder ' || v_sort_order || '
     )
     (select folder as "name",
            null as id,
            null as updated_at,
            null as created_at,
            null as last_accessed_at,
            null as metadata from folders)
     union all
     (select path_tokens[$1] as "name",
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
     from storage.objects
     where objects.name ilike $2 || $3 || ''%''
       and bucket_id = $4
       and array_length(objects.path_tokens, 1) = $1
     order by ' || v_order_by || ')
     limit $5
     offset $6' using levels, prefix, search, bucketname, limits, offsets;
end;
$_$;


--
-- Name: search_v2(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_sort_col text;
    v_sort_ord text;
    v_limit int;
BEGIN
    -- Cap limit to maximum of 1500 records
    v_limit := LEAST(coalesce(limits, 100), 1500);

    -- Validate and normalize sort_order
    v_sort_ord := lower(coalesce(sort_order, 'asc'));
    IF v_sort_ord NOT IN ('asc', 'desc') THEN
        v_sort_ord := 'asc';
    END IF;

    -- Validate and normalize sort_column
    v_sort_col := lower(coalesce(sort_column, 'name'));
    IF v_sort_col NOT IN ('name', 'updated_at', 'created_at') THEN
        v_sort_col := 'name';
    END IF;

    -- Route to appropriate implementation
    IF v_sort_col = 'name' THEN
        -- Use list_objects_with_delimiter for name sorting (most efficient: O(k * log n))
        RETURN QUERY
        SELECT
            split_part(l.name, '/', levels) AS key,
            l.name AS name,
            l.id,
            l.updated_at,
            l.created_at,
            l.last_accessed_at,
            l.metadata
        FROM storage.list_objects_with_delimiter(
            bucket_name,
            coalesce(prefix, ''),
            '/',
            v_limit,
            start_after,
            '',
            v_sort_ord
        ) l;
    ELSE
        -- Use aggregation approach for timestamp sorting
        -- Not efficient for large datasets but supports correct pagination
        RETURN QUERY SELECT * FROM storage.search_by_timestamp(
            prefix, bucket_name, v_limit, levels, start_after,
            v_sort_ord, v_sort_col, sort_column_after
        );
    END IF;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.flow_state IS 'Stores metadata for all OAuth/SSO login flows';


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


--
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


--
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);


--
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- Name: COLUMN mfa_factors.last_webauthn_challenge_data; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';


--
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    nonce text,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_nonce_length CHECK ((char_length(nonce) <= 255)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


--
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: TABLE oauth_client_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


--
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    token_endpoint_auth_method text NOT NULL,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048)),
    CONSTRAINT oauth_clients_token_endpoint_auth_method_check CHECK ((token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])))
);


--
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT oauth_consents_revoked_after_granted CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT oauth_consents_scopes_length CHECK ((char_length(scopes) <= 2048)),
    CONSTRAINT oauth_consents_scopes_not_empty CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);


--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


--
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


--
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text,
    CONSTRAINT sessions_scopes_length CHECK ((char_length(scopes) <= 4096))
);


--
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- Name: COLUMN sessions.refresh_token_hmac_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';


--
-- Name: COLUMN sessions.refresh_token_counter; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


--
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


--
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- Name: bot_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bot_profiles (
    id text NOT NULL,
    nickname text NOT NULL,
    avatar_url text,
    country text,
    mmr integer DEFAULT 1000,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    content text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: friendships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friendships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    friend_id uuid NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT friendships_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'blocked'::text])))
);


--
-- Name: game_moves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_moves (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id uuid,
    player_id text NOT NULL,
    round integer NOT NULL,
    move text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: game_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player1_id text NOT NULL,
    player2_id text NOT NULL,
    status text DEFAULT 'waiting'::text,
    game_type text,
    seed text,
    player1_score integer DEFAULT 0,
    player2_score integer DEFAULT 0,
    start_at timestamp with time zone,
    end_at timestamp with time zone,
    winner_id text,
    mode text DEFAULT 'rank'::text,
    created_at timestamp with time zone DEFAULT now(),
    current_round integer DEFAULT 0,
    phase_end_at timestamp with time zone,
    game_types text[],
    current_round_index integer DEFAULT 0,
    p1_current_score integer DEFAULT 0,
    p2_current_score integer DEFAULT 0,
    round_scores jsonb,
    game_data jsonb DEFAULT '{}'::jsonb,
    target_move text,
    phase_start_at timestamp with time zone,
    player1_ready boolean DEFAULT false,
    player2_ready boolean DEFAULT false,
    CONSTRAINT game_sessions_game_type_check CHECK ((game_type = ANY (ARRAY['RPS'::text, 'NUMBER'::text, 'MATH'::text, 'TEN'::text, 'COLOR'::text, 'MEMORY'::text, 'SEQUENCE'::text, 'SEQUENCE_NORMAL'::text, 'LARGEST'::text, 'PAIR'::text, 'UPDOWN'::text, 'SLIDER'::text, 'ARROW'::text, 'NUMBER_DESC'::text, 'BLANK'::text, 'OPERATOR'::text, 'LADDER'::text, 'TAP_COLOR'::text, 'AIM'::text, 'MOST_COLOR'::text, 'SORTING'::text, 'SPY'::text, 'PATH'::text, 'BLIND_PATH'::text, 'BALLS'::text, 'CATCH_COLOR'::text, 'TIMING_BAR'::text, 'STAIRWAY'::text])))
);


--
-- Name: matchmaking_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matchmaking_queue (
    player_id text NOT NULL,
    mmr integer DEFAULT 1000,
    mode text DEFAULT 'rank'::text,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: player_game_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_game_stats (
    user_id uuid NOT NULL,
    game_type text NOT NULL,
    normal_wins integer DEFAULT 0 NOT NULL,
    normal_losses integer DEFAULT 0 NOT NULL,
    normal_draws integer DEFAULT 0 NOT NULL,
    rank_wins integer DEFAULT 0 NOT NULL,
    rank_losses integer DEFAULT 0 NOT NULL,
    rank_draws integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: player_highscores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_highscores (
    user_id uuid NOT NULL,
    game_type text NOT NULL,
    best_score integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    full_name text,
    avatar_url text,
    nickname text,
    wins integer DEFAULT 0,
    losses integer DEFAULT 0,
    mmr integer DEFAULT 1000,
    created_at timestamp with time zone DEFAULT now(),
    disconnects integer DEFAULT 0,
    casual_wins integer DEFAULT 0,
    casual_losses integer DEFAULT 0,
    country text,
    last_seen timestamp with time zone DEFAULT now(),
    pencils integer DEFAULT 5,
    last_recharge_at timestamp with time zone DEFAULT now(),
    speed integer DEFAULT 0,
    memory integer DEFAULT 0,
    judgment integer DEFAULT 0,
    calculation integer DEFAULT 0,
    accuracy integer DEFAULT 0,
    observation integer DEFAULT 0,
    ad_reward_count integer DEFAULT 0,
    ad_reward_day date DEFAULT CURRENT_DATE,
    ads_removed boolean DEFAULT false,
    xp integer DEFAULT 0 NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    practice_notes integer DEFAULT 5,
    practice_last_recharge_at timestamp with time zone DEFAULT now(),
    practice_ad_reward_count integer DEFAULT 0,
    practice_ad_reward_day date DEFAULT CURRENT_DATE
);


--
-- Name: COLUMN profiles.country; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.country IS 'ISO 3166-1 alpha-2 country code (e.g. KR, US)';


--
-- Name: purchase_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    product_id text NOT NULL,
    platform text NOT NULL,
    transaction_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    original_transaction_id text,
    store_environment text,
    store_payload jsonb,
    verified boolean DEFAULT false,
    verified_at timestamp with time zone
);


--
-- Name: messages; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
)
PARTITION BY RANGE (inserted_at);


--
-- Name: messages_2026_02_10; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_02_10 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_02_11; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_02_11 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_02_12; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_02_12 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_02_13; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_02_13 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_02_14; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_02_14 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_02_15; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_02_15 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_02_16; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_02_16 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    action_filter text DEFAULT '*'::text,
    CONSTRAINT subscription_action_filter_check CHECK ((action_filter = ANY (ARRAY['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


--
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: -
--

ALTER TABLE realtime.subscription ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME realtime.subscription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL
);


--
-- Name: COLUMN buckets.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_analytics (
    name text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: buckets_vectors; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_vectors (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'VECTOR'::storage.buckettype NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: migrations; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb
);


--
-- Name: COLUMN objects.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb
);


--
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vector_indexes; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.vector_indexes (
    id text DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    bucket_id text NOT NULL,
    data_type text NOT NULL,
    dimension integer NOT NULL,
    distance_metric text NOT NULL,
    metadata_configuration jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: messages_2026_02_10; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_02_10 FOR VALUES FROM ('2026-02-10 00:00:00') TO ('2026-02-11 00:00:00');


--
-- Name: messages_2026_02_11; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_02_11 FOR VALUES FROM ('2026-02-11 00:00:00') TO ('2026-02-12 00:00:00');


--
-- Name: messages_2026_02_12; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_02_12 FOR VALUES FROM ('2026-02-12 00:00:00') TO ('2026-02-13 00:00:00');


--
-- Name: messages_2026_02_13; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_02_13 FOR VALUES FROM ('2026-02-13 00:00:00') TO ('2026-02-14 00:00:00');


--
-- Name: messages_2026_02_14; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_02_14 FOR VALUES FROM ('2026-02-14 00:00:00') TO ('2026-02-15 00:00:00');


--
-- Name: messages_2026_02_15; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_02_15 FOR VALUES FROM ('2026-02-15 00:00:00') TO ('2026-02-16 00:00:00');


--
-- Name: messages_2026_02_16; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_02_16 FOR VALUES FROM ('2026-02-16 00:00:00') TO ('2026-02-17 00:00:00');


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: bot_profiles bot_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_profiles
    ADD CONSTRAINT bot_profiles_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_user_id_friend_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user_id_friend_id_key UNIQUE (user_id, friend_id);


--
-- Name: game_moves game_moves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_moves
    ADD CONSTRAINT game_moves_pkey PRIMARY KEY (id);


--
-- Name: game_sessions game_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_sessions
    ADD CONSTRAINT game_sessions_pkey PRIMARY KEY (id);


--
-- Name: matchmaking_queue matchmaking_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matchmaking_queue
    ADD CONSTRAINT matchmaking_queue_pkey PRIMARY KEY (player_id);


--
-- Name: player_game_stats player_game_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_game_stats
    ADD CONSTRAINT player_game_stats_pkey PRIMARY KEY (user_id, game_type);


--
-- Name: player_highscores player_highscores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_highscores
    ADD CONSTRAINT player_highscores_pkey PRIMARY KEY (user_id, game_type);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: purchase_transactions purchase_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_transactions
    ADD CONSTRAINT purchase_transactions_pkey PRIMARY KEY (id);


--
-- Name: purchase_transactions purchase_transactions_platform_transaction_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_transactions
    ADD CONSTRAINT purchase_transactions_platform_transaction_id_key UNIQUE (platform, transaction_id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_02_10 messages_2026_02_10_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_02_10
    ADD CONSTRAINT messages_2026_02_10_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_02_11 messages_2026_02_11_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_02_11
    ADD CONSTRAINT messages_2026_02_11_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_02_12 messages_2026_02_12_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_02_12
    ADD CONSTRAINT messages_2026_02_12_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_02_13 messages_2026_02_13_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_02_13
    ADD CONSTRAINT messages_2026_02_13_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_02_14 messages_2026_02_14_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_02_14
    ADD CONSTRAINT messages_2026_02_14_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_02_15 messages_2026_02_15_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_02_15
    ADD CONSTRAINT messages_2026_02_15_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_02_16 messages_2026_02_16_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_02_16
    ADD CONSTRAINT messages_2026_02_16_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: buckets_vectors buckets_vectors_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_vectors
    ADD CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- Name: vector_indexes vector_indexes_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: idx_profiles_mmr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_mmr ON public.profiles USING btree (mmr DESC);


--
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- Name: messages_inserted_at_topic_index; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_02_10_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_02_10_inserted_at_topic_idx ON realtime.messages_2026_02_10 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_02_11_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_02_11_inserted_at_topic_idx ON realtime.messages_2026_02_11 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_02_12_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_02_12_inserted_at_topic_idx ON realtime.messages_2026_02_12 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_02_13_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_02_13_inserted_at_topic_idx ON realtime.messages_2026_02_13 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_02_14_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_02_14_inserted_at_topic_idx ON realtime.messages_2026_02_14 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_02_15_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_02_15_inserted_at_topic_idx ON realtime.messages_2026_02_15 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_02_16_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_02_16_inserted_at_topic_idx ON realtime.messages_2026_02_16 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: subscription_subscription_id_entity_filters_action_filter_key; Type: INDEX; Schema: realtime; Owner: -
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_action_filter_key ON realtime.subscription USING btree (subscription_id, entity, filters, action_filter);


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- Name: buckets_analytics_unique_name_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);


--
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- Name: idx_objects_bucket_id_name_lower; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: vector_indexes_name_bucket_id_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id);


--
-- Name: messages_2026_02_10_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_02_10_inserted_at_topic_idx;


--
-- Name: messages_2026_02_10_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_02_10_pkey;


--
-- Name: messages_2026_02_11_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_02_11_inserted_at_topic_idx;


--
-- Name: messages_2026_02_11_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_02_11_pkey;


--
-- Name: messages_2026_02_12_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_02_12_inserted_at_topic_idx;


--
-- Name: messages_2026_02_12_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_02_12_pkey;


--
-- Name: messages_2026_02_13_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_02_13_inserted_at_topic_idx;


--
-- Name: messages_2026_02_13_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_02_13_pkey;


--
-- Name: messages_2026_02_14_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_02_14_inserted_at_topic_idx;


--
-- Name: messages_2026_02_14_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_02_14_pkey;


--
-- Name: messages_2026_02_15_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_02_15_inserted_at_topic_idx;


--
-- Name: messages_2026_02_15_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_02_15_pkey;


--
-- Name: messages_2026_02_16_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_02_16_inserted_at_topic_idx;


--
-- Name: messages_2026_02_16_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_02_16_pkey;


--
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: -
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- Name: buckets protect_buckets_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects protect_objects_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id);


--
-- Name: chat_messages chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id);


--
-- Name: friendships friendships_friend_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_friend_id_fkey FOREIGN KEY (friend_id) REFERENCES auth.users(id);


--
-- Name: friendships friendships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: game_moves game_moves_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_moves
    ADD CONSTRAINT game_moves_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.game_sessions(id) ON DELETE CASCADE;


--
-- Name: player_game_stats player_game_stats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_game_stats
    ADD CONSTRAINT player_game_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: player_highscores player_highscores_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_highscores
    ADD CONSTRAINT player_highscores_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id);


--
-- Name: purchase_transactions purchase_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_transactions
    ADD CONSTRAINT purchase_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- Name: vector_indexes vector_indexes_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id);


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- Name: matchmaking_queue Manage own queue entry; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Manage own queue entry" ON public.matchmaking_queue USING (((auth.uid())::text = player_id));


--
-- Name: game_moves Participants can view moves; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can view moves" ON public.game_moves FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.game_sessions s
  WHERE ((s.id = game_moves.room_id) AND ((s.player1_id = (auth.uid())::text) OR (s.player2_id = (auth.uid())::text))))));


--
-- Name: game_sessions Participants can view sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can view sessions" ON public.game_sessions FOR SELECT USING ((((auth.uid())::text = player1_id) OR ((auth.uid())::text = player2_id)));


--
-- Name: game_moves Players can insert own moves; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Players can insert own moves" ON public.game_moves FOR INSERT WITH CHECK ((((auth.uid())::text = player_id) AND (EXISTS ( SELECT 1
   FROM public.game_sessions s
  WHERE ((s.id = game_moves.room_id) AND ((s.player1_id = (auth.uid())::text) OR (s.player2_id = (auth.uid())::text)))))));


--
-- Name: bot_profiles Public bot profiles are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public bot profiles are viewable by everyone" ON public.bot_profiles FOR SELECT USING (true);


--
-- Name: profiles Public profiles are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);


--
-- Name: game_sessions Users can create their own sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own sessions" ON public.game_sessions FOR INSERT WITH CHECK (((auth.uid())::text = player1_id));


--
-- Name: friendships Users can delete their own friendships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own friendships" ON public.friendships FOR DELETE USING (((auth.uid() = user_id) OR (auth.uid() = friend_id)));


--
-- Name: friendships Users can insert friendship requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert friendship requests" ON public.friendships FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: player_game_stats Users can insert own game stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own game stats" ON public.player_game_stats FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: player_highscores Users can insert own highscores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own highscores" ON public.player_highscores FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: chat_messages Users can send messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can send messages" ON public.chat_messages FOR INSERT WITH CHECK ((auth.uid() = sender_id));


--
-- Name: chat_messages Users can update (mark read) received messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update (mark read) received messages" ON public.chat_messages FOR UPDATE USING ((auth.uid() = receiver_id));


--
-- Name: player_game_stats Users can update own game stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own game stats" ON public.player_game_stats FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: player_highscores Users can update own highscores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own highscores" ON public.player_highscores FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: profiles Users can update their own last_seen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own last_seen" ON public.profiles FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: friendships Users can update their received requests or own friendships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their received requests or own friendships" ON public.friendships FOR UPDATE USING (((auth.uid() = user_id) OR (auth.uid() = friend_id)));


--
-- Name: player_game_stats Users can view own game stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own game stats" ON public.player_game_stats FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: player_highscores Users can view own highscores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own highscores" ON public.player_highscores FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: friendships Users can view their own friendships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own friendships" ON public.friendships FOR SELECT USING (((auth.uid() = user_id) OR (auth.uid() = friend_id)));


--
-- Name: chat_messages Users can view their own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own messages" ON public.chat_messages FOR SELECT USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));


--
-- Name: bot_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bot_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: friendships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

--
-- Name: game_moves; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.game_moves ENABLE ROW LEVEL SECURITY;

--
-- Name: game_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: matchmaking_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: player_game_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.player_game_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: player_highscores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.player_highscores ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_transactions purchase_transactions_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_transactions_insert_own ON public.purchase_transactions FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: purchase_transactions purchase_transactions_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_transactions_select_own ON public.purchase_transactions FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: purchase_transactions purchase_transactions_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_transactions_update_own ON public.purchase_transactions FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: objects avatars_delete_own 1oj01fe_0; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "avatars_delete_own 1oj01fe_0" ON storage.objects FOR DELETE USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects avatars_delete_own 1oj01fe_1; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "avatars_delete_own 1oj01fe_1" ON storage.objects FOR SELECT USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects avatars_insert_own 1oj01fe_0; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "avatars_insert_own 1oj01fe_0" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects avatars_update_own 1oj01fe_0; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "avatars_update_own 1oj01fe_0" ON storage.objects FOR UPDATE USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects avatars_update_own 1oj01fe_1; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "avatars_update_own 1oj01fe_1" ON storage.objects FOR SELECT USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_vectors; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: vector_indexes; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.vector_indexes ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


--
-- Name: supabase_realtime_messages_publication; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime_messages_publication WITH (publish = 'insert, update, delete, truncate');


--
-- Name: supabase_realtime chat_messages; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.chat_messages;


--
-- Name: supabase_realtime friendships; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.friendships;


--
-- Name: supabase_realtime_messages_publication messages; Type: PUBLICATION TABLE; Schema: realtime; Owner: -
--

ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE ONLY realtime.messages;


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE FUNCTION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


--
-- PostgreSQL database dump complete
--

\unrestrict s1GKWiFmOjPR8Fmnt5c457XgF6bngoNENcXDuXBcrgOsXjPlyXNk8YCUm6JYist

