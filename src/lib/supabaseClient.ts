
import { createClient } from '@supabase/supabase-js';

const appEnvRaw = import.meta.env.VITE_APP_ENV;
const appEnv = typeof appEnvRaw === 'string' ? appEnvRaw.toLowerCase() : '';
const isProd = appEnv === 'prod' || appEnv === 'production' || (appEnv === '' && import.meta.env.PROD);

const SUPABASE_URL = (isProd ? import.meta.env.VITE_SUPABASE_URL_PROD : import.meta.env.VITE_SUPABASE_URL_DEV)
    ?? import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = (isProd ? import.meta.env.VITE_SUPABASE_ANON_KEY_PROD : import.meta.env.VITE_SUPABASE_ANON_KEY_DEV)
    ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing Supabase Environment Variables!');
    console.error('VITE_APP_ENV:', appEnv || '(unset)');
    console.error('VITE_SUPABASE_URL_DEV/PROD or VITE_SUPABASE_URL:', SUPABASE_URL ? 'Set' : 'Missing');
    console.error('VITE_SUPABASE_ANON_KEY_DEV/PROD or VITE_SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? 'Set' : 'Missing');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
