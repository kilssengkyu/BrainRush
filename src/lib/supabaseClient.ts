
import { createClient } from '@supabase/supabase-js';

// TODO: Replace with environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing Supabase Environment Variables!');
    console.error('VITE_SUPABASE_URL:', SUPABASE_URL ? 'Set' : 'Missing');
    console.error('VITE_SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? 'Set' : 'Missing');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
