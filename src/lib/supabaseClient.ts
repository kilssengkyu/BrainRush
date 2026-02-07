
import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

// 앱 환경 변수 원본 값을 보관합니다.
const appEnvRaw = import.meta.env.VITE_APP_ENV;
// 앱 환경 값을 정규화해 소문자로 변환합니다.
const appEnv = typeof appEnvRaw === 'string' ? appEnvRaw.toLowerCase() : '';
// 프로덕션 여부를 판별합니다.
const isProd = appEnv === 'prod' || appEnv === 'production' || (appEnv === '' && import.meta.env.PROD);

// 네이티브 플랫폼 여부를 확인합니다.
const isNativePlatform = Capacitor.isNativePlatform();

// 환경별 Supabase URL을 결정합니다.
const SUPABASE_URL = (isProd ? import.meta.env.VITE_SUPABASE_URL_PROD : import.meta.env.VITE_SUPABASE_URL_DEV)
    ?? import.meta.env.VITE_SUPABASE_URL;
// 환경별 Supabase ANON 키를 결정합니다.
const SUPABASE_ANON_KEY = (isProd ? import.meta.env.VITE_SUPABASE_ANON_KEY_PROD : import.meta.env.VITE_SUPABASE_ANON_KEY_DEV)
    ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing Supabase Environment Variables!');
    console.error('VITE_APP_ENV:', appEnv || '(unset)');
    console.error('VITE_SUPABASE_URL_DEV/PROD or VITE_SUPABASE_URL:', SUPABASE_URL ? 'Set' : 'Missing');
    console.error('VITE_SUPABASE_ANON_KEY_DEV/PROD or VITE_SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? 'Set' : 'Missing');
}

// Supabase 클라이언트를 생성합니다.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        // 네이티브 환경에서 딥링크 처리 시 세션 파싱을 방지합니다.
        detectSessionInUrl: !isNativePlatform,
        // iOS/Android에서 안정적인 OAuth를 위해 PKCE 플로우를 사용합니다.
        flowType: 'pkce'
    }
});
