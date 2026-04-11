import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { App } from '@capacitor/app';
import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import { Browser } from '@capacitor/browser';
import { COUNTRIES } from '../constants/countries';
import { logAnalyticsEvent, setAnalyticsUserId } from '../lib/analytics';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    profile: any | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    signInWithApple: () => Promise<void>;
    signInAnonymously: () => Promise<void>;
    linkWithGoogle: () => Promise<void>;
    linkWithApple: () => Promise<void>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
    onlineUsers: Set<string>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    profile: null,
    loading: true,
    signInWithGoogle: async () => { },
    signInWithApple: async () => { },
    signInAnonymously: async () => { },
    linkWithGoogle: async () => { },
    linkWithApple: async () => { },
    signOut: async () => { },
    refreshProfile: async () => { },
    onlineUsers: new Set(),
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const AUTH_ERROR_STORAGE_KEY = 'brainrush_auth_error';
    const lastLoggedAuthSessionRef = React.useRef<string | null>(null);
    const SIGNUP_COMPLETE_LOGGED_PREFIX = 'brainrush_signup_complete_logged';

    const persistAuthError = (error: any) => {
        try {
            const rawMessage = String(error?.message || error?.error_description || error?.msg || '');
            if (!rawMessage) return;
            const lower = rawMessage.toLowerCase();
            const isBanned = lower.includes('banned');
            const untilMatch = rawMessage.match(/until\\s+([0-9]{4}-[0-9]{2}-[0-9]{2}(?:[ t][0-9:.+-zZ]+)?)/i);
            const payload = {
                message: rawMessage,
                isBanned,
                bannedUntil: untilMatch?.[1] || null,
                at: Date.now()
            };
            localStorage.setItem(AUTH_ERROR_STORAGE_KEY, JSON.stringify(payload));
        } catch {
            // no-op
        }
    };

    const isAlreadyRegisteredIdentityError = (error: any) => {
        const code = String(error?.code || '').toLowerCase();
        const msg = String(error?.message || '').toLowerCase();
        return (
            code.includes('identity_already_exists') ||
            code.includes('already_exists') ||
            msg.includes('already registered') ||
            msg.includes('already exists') ||
            msg.includes('identity is already linked') ||
            msg.includes('account exists')
        );
    };

    const getSessionDeviceId = () => {
        const key = 'brainrush_session_device_id';
        try {
            const existing = localStorage.getItem(key);
            if (existing) return existing;
            const generated = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
                ? `dev_${crypto.randomUUID()}`
                : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            localStorage.setItem(key, generated);
            return generated;
        } catch {
            return `dev_fallback_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        }
    };

    useEffect(() => {
        // 1. Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) fetchProfile(session.user.id);
            else setLoading(false);
        });

        // 2. Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                const currentUser = session.user;
                const provider = currentUser.is_anonymous
                    ? 'anonymous'
                    : String(currentUser.app_metadata?.provider || 'unknown');

                if (lastLoggedAuthSessionRef.current !== currentUser.id) {
                    lastLoggedAuthSessionRef.current = currentUser.id;
                    void logAnalyticsEvent('br_auth_success', {
                        provider,
                        is_anonymous: currentUser.is_anonymous,
                    });
                }

                void setAnalyticsUserId(currentUser.is_anonymous ? null : currentUser.id);

                if (!currentUser.is_anonymous) {
                    const signupKey = `${SIGNUP_COMPLETE_LOGGED_PREFIX}:${currentUser.id}`;
                    const alreadyLogged = window.localStorage.getItem(signupKey) === '1';
                    if (!alreadyLogged) {
                        window.localStorage.setItem(signupKey, '1');
                        void logAnalyticsEvent('signup_complete', { provider });
                    }
                }

                fetchProfile(currentUser.id);
            } else {
                lastLoggedAuthSessionRef.current = null;
                void setAnalyticsUserId(null);
                setProfile(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const getDefaultCountry = () => {
        if (typeof navigator === 'undefined') return null;
        const candidates = [
            ...(navigator.languages || []),
            navigator.language
        ].filter(Boolean) as string[];

        const known = new Set(COUNTRIES.map(c => c.code));
        for (const lang of candidates) {
            const normalized = lang.replace('_', '-');
            const parts = normalized.split('-');
            const region = parts[1]?.toUpperCase();
            if (region && known.has(region)) return region;
        }

        const primary = candidates[0]?.split(/[-_]/)[0]?.toLowerCase();
        if (!primary) return null;
        const fallbackMap: Record<string, string> = {
            ko: 'KR',
            ja: 'JP',
            zh: 'CN',
            en: 'US'
        };
        const fallback = fallbackMap[primary];
        return fallback && known.has(fallback) ? fallback : null;
    };

    const fetchProfile = async (userId: string) => {
        try {
            const isTemporaryNickname = (nickname?: string | null) => /^player_[0-9]{4}$/i.test((nickname || '').trim());

            const { error: rpcError } = await supabase.rpc('get_profile_with_pencils', { user_id: userId });
            if (rpcError) {
                console.warn('get_profile_with_pencils failed, fallback to direct profile fetch', rpcError);
            }

            let { data: fullProfile, error: fetchError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (fetchError) {
                throw fetchError;
            }

            if (!fullProfile) {
                const { data: userData } = await supabase.auth.getUser();
                const baseUser = userData.user;

                if (baseUser) {
                    const newProfile = {
                        id: userId,
                        nickname: 'Player_' + Math.floor(Math.random() * 9000 + 1000),
                        needs_nickname_setup: true,
                        nickname_set_at: null,
                        avatar_url: null,
                        created_at: new Date().toISOString(),
                        pencils: 5,
                        last_recharge_at: new Date().toISOString(),
                        practice_notes: 5,
                        practice_last_recharge_at: new Date().toISOString(),
                        practice_ad_reward_count: 0,
                        practice_ad_reward_day: new Date().toISOString().slice(0, 10),
                        country: getDefaultCountry(),
                        xp: 0,
                        level: 1
                    };

                    const { error: insertError } = await supabase.from('profiles').insert([newProfile]);
                    if (insertError && insertError.code !== '23505') {
                        throw insertError;
                    }

                    const refetch = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', userId)
                        .maybeSingle();

                    if (refetch.error) throw refetch.error;
                    fullProfile = refetch.data ?? newProfile;
                }
            }

            if (fullProfile) {
                if (!fullProfile.needs_nickname_setup && isTemporaryNickname(fullProfile.nickname)) {
                    const { error: setupFlagError } = await supabase
                        .from('profiles')
                        .update({ needs_nickname_setup: true })
                        .eq('id', userId);

                    if (!setupFlagError) {
                        fullProfile = { ...fullProfile, needs_nickname_setup: true };
                    }
                }

                const defaultCountry = getDefaultCountry();
                if (!fullProfile.country && defaultCountry) {
                    const { error: updateError } = await supabase
                        .from('profiles')
                        .update({ country: defaultCountry })
                        .eq('id', userId);
                    if (!updateError) {
                        setProfile({ ...fullProfile, country: defaultCountry });
                    } else {
                        setProfile(fullProfile);
                    }
                } else {
                    setProfile(fullProfile);
                }
            }
        } catch (error) {
            console.error('Error in fetchProfile:', error);
        } finally {
            setLoading(false);
        }
    };

    // Global Presence, Session Guard & Deep Link Handling
    const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
    const sessionDeviceIdRef = React.useRef<string>(getSessionDeviceId());

    useEffect(() => {
        // Deep Link Listener
        let appListener: any;
        let customDeepLinkHandler: ((event: CustomEvent) => void) | null = null;

        const handleDeepLink = async (urlString: string) => {
            console.log('Processing Deep Link:', urlString.substring(0, 50) + '...');
            try {
                const url = new URL(urlString);
                const hashParams = new URLSearchParams(url.hash.substring(1));
                const searchParams = new URLSearchParams(url.search);

                const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
                const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');
                const code = hashParams.get('code') || searchParams.get('code');
                const errName = hashParams.get('error') || searchParams.get('error');
                const errDesc = hashParams.get('error_description') || searchParams.get('error_description');

                if (errName || errDesc) {
                    const decoded = decodeURIComponent(errDesc || errName || '');
                    console.error('Deep link error:', decoded);
                    window.dispatchEvent(new CustomEvent('authDeepLinkError', { detail: { message: decoded } }));
                    return;
                }

                if (accessToken && refreshToken) {
                    const { error } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken,
                    });
                    if (error) {
                        console.error('Session Error:', error.message);
                        persistAuthError(error);
                        throw error;
                    }
                    console.log('Login Success! Session Restored.');
                } else if (code) {
                    const { error } = await supabase.auth.exchangeCodeForSession(code);
                    if (error) {
                        console.error('PKCE Exchange Error:', error.message);
                        persistAuthError(error);
                        throw error;
                    }
                    console.log('Login Success! Session Exchanged.');
                }
            } catch (err) {
                console.error('Deep link logic error:', err);
                persistAuthError(err);
            }
        };

        const setupListener = async () => {
            // 1. Standard Capacitor Listener
            appListener = await App.addListener('appUrlOpen', async (event) => {
                handleDeepLink(event.url);
                // Close the browser if it was opened for login flow
                await Browser.close();
            });

            // 1-1. 앱이 딥링크로 시작된 경우를 처리합니다.
            try {
                const launchUrl = await App.getLaunchUrl();
                if (launchUrl?.url) {
                    handleDeepLink(launchUrl.url);
                }
            } catch (error) {
                console.warn('Launch URL 확인 중 오류:', error);
            }

            // 2. Custom Native-to-JS Event Listener (Fallback)
            customDeepLinkHandler = ((event: CustomEvent) => {
                console.log('Custom Deep Link Event:', event.detail);
                handleDeepLink(event.detail);
            }) as (event: CustomEvent) => void;
            window.addEventListener('customDeepLink', customDeepLinkHandler as EventListener);
        };

        setupListener();

        // Presence Logic
        let channel: any;
        // Session Guard (Single Active Session)
        let sessionChannel: any;

        if (user) {
            const isAnonymousUser = Boolean(user.is_anonymous || user.app_metadata?.provider === 'anonymous');
            channel = supabase.channel('online_users', {
                config: { presence: { key: user.id } },
            });

            channel
                .on('presence', { event: 'sync' }, () => {
                    const newState = channel.presenceState();
                    const onlineIds = new Set(Object.keys(newState));
                    setOnlineUsers(onlineIds);
                })
                .subscribe(async (status: string) => {
                    if (status === 'SUBSCRIBED') {
                        await channel.track({
                            user_id: user.id,
                            online_at: new Date().toISOString(),
                        });
                        await supabase
                            .from('profiles')
                            .update({ last_seen: new Date().toISOString() })
                            .eq('id', user.id);
                    }
                });

            if (!isAnonymousUser) {
                // Session guard only applies to linked accounts.
                const myDeviceId = sessionDeviceIdRef.current;
                sessionChannel = supabase.channel(`session:${user.id}`);

                sessionChannel
                    .on('broadcast', { event: 'force_logout' }, (payload: any) => {
                        const senderDeviceId = payload?.payload?.deviceId;
                        // 내가 보낸 게 아닌 경우에만 로그아웃 처리
                        if (senderDeviceId && senderDeviceId !== myDeviceId) {
                            console.warn('Another device logged in. Forcing logout.');
                            window.dispatchEvent(new CustomEvent('forceLogout'));
                            supabase.auth.signOut({ scope: 'local' });
                        }
                    })
                    .subscribe(async (status: string) => {
                        if (status === 'SUBSCRIBED') {
                            // 나 로그인 했다고 다른 기기에 알림
                            await sessionChannel.send({
                                type: 'broadcast',
                                event: 'force_logout',
                                payload: { deviceId: myDeviceId },
                            });
                        }
                    });
            }
        } else {
            setOnlineUsers(new Set());
        }

        return () => {
            if (appListener) appListener.remove();
            if (customDeepLinkHandler) window.removeEventListener('customDeepLink', customDeepLinkHandler as EventListener);
            if (channel) supabase.removeChannel(channel);
            if (sessionChannel) supabase.removeChannel(sessionChannel);
        };
    }, [user]);

    const signInWithGoogle = async () => {
        try {
            void logAnalyticsEvent('br_auth_attempt', { provider: 'google' });
            // Determine Redirect URL
            // Web: window.location.origin
            // Native: com.kilssengkyu.brainrush://login-callback
            let redirectUrl = window.location.origin;

            // Basic check for Capacitor (window.Capacitor exists)
            // or import check. 
            if ((window as any).Capacitor?.isNativePlatform()) {
                redirectUrl = 'com.kilssengkyu.brainrush://login-callback';
            }

            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectUrl,
                    queryParams: { prompt: 'select_account' },
                    skipBrowserRedirect: true
                }
            });
            if (error) throw error;
            if (data?.url) {
                await Browser.open({ url: data.url, windowName: '_self' });
            }
        } catch (error) {
            console.error('Google Sign-in Error:', error);
            persistAuthError(error);
            throw new Error((error as any)?.message || '구글 로그인 중 오류가 발생했습니다.');
        }
    };

    const linkWithGoogle = async () => {
        try {
            void logAnalyticsEvent('br_link_attempt', { provider: 'google' });
            let redirectUrl = window.location.origin;
            if ((window as any).Capacitor?.isNativePlatform()) {
                redirectUrl = 'com.kilssengkyu.brainrush://login-callback';
            }

            const { data, error } = await supabase.auth.linkIdentity({
                provider: 'google',
                options: {
                    redirectTo: redirectUrl,
                    queryParams: { prompt: 'select_account' },
                    skipBrowserRedirect: true
                }
            });

            if (error) throw error;
            if (data?.url) {
                await Browser.open({ url: data.url, windowName: '_self' });
            }
        } catch (error) {
            console.error('Google Link Error:', error);
            if (isAlreadyRegisteredIdentityError(error)) {
                throw new Error('이미 가입된 구글 계정입니다.');
            } else {
                throw new Error('구글 계정 연동 중 오류가 발생했습니다.');
            }
        }
    };

    const linkWithApple = async () => {
        try {
            void logAnalyticsEvent('br_link_attempt', { provider: 'apple' });
            const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
            let error: any = null;

            if (isNative) {
                const result = await SignInWithApple.authorize({
                    clientId: 'com.kilssengkyu.brainrush',
                    redirectURI: '',
                    // iOS plugin runtime can expect an array for scopes.
                    // The current TS definition is narrower (string), so cast is required.
                    scopes: ['email', 'name'] as any,
                    state: '',
                    nonce: '',
                } as any);

                const identityToken = result.response?.identityToken;
                if (!identityToken) {
                    throw new Error('Apple Link: No identity token received');
                }

                const linkResult = await supabase.auth.linkIdentity({
                    provider: 'apple',
                    token: identityToken,
                });
                error = linkResult.error;
            } else {
                const redirectUrl = window.location.origin;
                const linkResult = await supabase.auth.linkIdentity({
                    provider: 'apple',
                    options: {
                        redirectTo: redirectUrl,
                        skipBrowserRedirect: false
                    }
                });
                error = linkResult.error;
            }

            if (error) throw error;
        } catch (error) {
            console.error('Apple Link Error:', error);
            if (isAlreadyRegisteredIdentityError(error)) {
                throw new Error('이미 가입된 Apple 계정입니다.');
            } else {
                throw new Error('Apple 계정 연동 중 오류가 발생했습니다.');
            }
        }
    };

    const signInAnonymously = async () => {
        try {
            void logAnalyticsEvent('br_auth_attempt', { provider: 'anonymous' });
            const { error } = await supabase.auth.signInAnonymously();
            if (error) throw error;
        } catch (error) {
            console.error('Anonymous Sign-in Error:', error);
            persistAuthError(error);
            throw new Error('게스트 로그인 중 오류가 발생했습니다. (Supabase 설정에서 Anonymous Sign-ins가 켜져있는지 확인해주세요)');
        }
    };

    const signInWithApple = async () => {
        try {
            void logAnalyticsEvent('br_auth_attempt', { provider: 'apple' });
            const result = await SignInWithApple.authorize({
                clientId: 'com.kilssengkyu.brainrush',
                redirectURI: '',
                // iOS plugin runtime can expect an array for scopes.
                // The current TS definition is narrower (string), so cast is required.
                scopes: ['email', 'name'] as any,
                state: '',
                nonce: '',
            } as any);

            const identityToken = result.response?.identityToken;

            if (!identityToken) {
                throw new Error('Apple Sign In: No identity token received');
            }

            const { error } = await supabase.auth.signInWithIdToken({
                provider: 'apple',
                token: identityToken,
            });

            if (error) throw error;
            console.log('Apple Sign-in Success!');
        } catch (error: any) {
            // User cancelled
            if (error?.message?.includes('cancelled') || error?.message?.includes('canceled')) {
                console.log('Apple Sign-in cancelled by user');
                return;
            }
            console.error('Apple Sign-in Error:', error);
            persistAuthError(error);
            throw new Error((error as any)?.message || 'Apple 로그인 중 오류가 발생했습니다.');
        }
    };

    const signOut = async () => {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                console.error('Sign-out Error:', error);
                const { error: localError } = await supabase.auth.signOut({ scope: 'local' });
                if (localError) {
                    console.error('Local Sign-out Error:', localError);
                }
            }
        } catch (error) {
            console.error('Sign-out Error:', error);
        } finally {
            setSession(null);
            setUser(null);
            setProfile(null);
        }
    };

    const refreshProfile = useCallback(async () => {
        if (user) {
            await fetchProfile(user.id);
        }
    }, [user]);

    return (
        <AuthContext.Provider value={{ user, session, profile, loading, signInWithGoogle, signInWithApple, signInAnonymously, linkWithGoogle, linkWithApple, signOut, refreshProfile, onlineUsers }}>
            {children}
        </AuthContext.Provider>
    );
};
