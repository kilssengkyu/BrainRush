import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { App } from '@capacitor/app';
import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import { COUNTRIES } from '../constants/countries';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    profile: any | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    signInWithApple: () => Promise<void>;
    signInAnonymously: () => Promise<void>;
    linkWithGoogle: () => Promise<void>;
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
            if (session?.user) fetchProfile(session.user.id);
            else {
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
            // Use RPC to get profile AND trigger potential auto-recharge
            const { error } = await supabase
                .rpc('get_profile_with_pencils', { user_id: userId });

            if (error) {
                // If profile misses, fallback to create
                // Note: get_profile_with_pencils might fail if row missing entirely? 
                // Actually the RPC tries to select. If empty, it returns empty?
                // Let's check error code. If just 'PGRST116' (no rows) or similar.

                console.log('Profile RPC returned error or no data, checking plain fetch...', error);

                // Fallback: Check if profile exists manually to differentiate corruption vs missing
                const { error: plainError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .single();

                if (plainError && plainError.code === 'PGRST116') {
                    // Create new profile
                    console.log('Creating new profile for:', userId);
                    const { data: userData } = await supabase.auth.getUser();
                    if (userData.user) {
                        const newProfile = {
                            id: userId,
                            email: userData.user.email,
                            nickname: 'Player_' + Math.floor(Math.random() * 9000 + 1000),
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

                        const { error: insertError } = await supabase
                            .from('profiles')
                            .insert([newProfile]);

                        if (!insertError) {
                            setProfile(newProfile);
                            return;
                        }
                    }
                }
            } else {
                // The RPC returns a table of inputs. 
                // Wait, get_profile_with_pencils returns TABLE(pencils, last_recharge). 
                // It does NOT return the FULL profile.
                // We need to merge this with full profile usage.

                // Better approach: Call RPC to sync, THEN select full profile?
                // OR Update RPC to return full profile.
                // Modifying RPC is cleaner but 'select *' inside RPC usually returns specific columns unless SETOF profiles.

                // Let's do:
                // 1. Call RPC to Ensure Sync.
                // 2. Select * from profiles.

                // Reuse existing logic actually.
            }

            // Revised Logic:
            // 1. Just select * first.
            // 2. If present, setProfile.
            // 3. Then trigger background, non-blocking recharge check?
            // "get_profile_with_pencils" does READ and WRITE.

            // Let's try:
            const { error: rpcError } = await supabase.rpc('get_profile_with_pencils', { user_id: userId });

            if (rpcError) {
                console.error('RPC Error:', rpcError);
                // Fallback to normal fetch/create logic below
            }

            // Now fetch full profile (which should have updated values)
            const { data: fullProfile, error: fetchError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (fetchError) {
                if (fetchError.code === 'PGRST116') {
                    // Create logic
                    const { data: userData } = await supabase.auth.getUser();
                    if (userData.user) {
                        const newProfile = {
                            id: userId,
                            email: userData.user.email,
                            nickname: 'Player_' + Math.floor(Math.random() * 9000 + 1000),
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
                        if (!insertError) {
                            setProfile(newProfile);
                            return;
                        }
                    }
                }
            } else {
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

    // Global Presence & Deep Link Handling
    const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

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

                if (accessToken && refreshToken) {
                    const { error } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken,
                    });
                    if (error) {
                        console.error('Session Error:', error.message);
                        throw error;
                    }
                    console.log('Login Success! Session Restored.');
                } else if (code) {
                    const { error } = await supabase.auth.exchangeCodeForSession(code);
                    if (error) {
                        console.error('PKCE Exchange Error:', error.message);
                        throw error;
                    }
                    console.log('Login Success! Session Exchanged.');
                }
            } catch (err) {
                console.error('Deep link logic error:', err);
            }
        };

        const setupListener = async () => {
            // 1. Standard Capacitor Listener
            appListener = await App.addListener('appUrlOpen', async (event) => {
                handleDeepLink(event.url);
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
        if (user) {
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
        } else {
            setOnlineUsers(new Set());
        }

        return () => {
            if (appListener) appListener.remove();
            if (customDeepLinkHandler) window.removeEventListener('customDeepLink', customDeepLinkHandler as EventListener);
            if (channel) supabase.removeChannel(channel);
        };
    }, [user]);

    const signInWithGoogle = async () => {
        try {
            // Determine Redirect URL
            // Web: window.location.origin
            // Native: com.kilssengkyu.brainrush://login-callback
            let redirectUrl = window.location.origin;

            // Basic check for Capacitor (window.Capacitor exists)
            // or import check. 
            if ((window as any).Capacitor?.isNativePlatform()) {
                redirectUrl = 'com.kilssengkyu.brainrush://login-callback';
            }

            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectUrl,
                    queryParams: { prompt: 'select_account' },
                    skipBrowserRedirect: false // Important for native flow
                }
            });
            if (error) throw error;
        } catch (error) {
            console.error('Google Sign-in Error:', error);
            alert('구글 로그인 중 오류가 발생했습니다.');
        }
    };

    const linkWithGoogle = async () => {
        try {
            let redirectUrl = window.location.origin;
            if ((window as any).Capacitor?.isNativePlatform()) {
                redirectUrl = 'com.kilssengkyu.brainrush://login-callback';
            }

            const { error } = await supabase.auth.linkIdentity({
                provider: 'google',
                options: {
                    redirectTo: redirectUrl,
                    queryParams: { prompt: 'select_account' },
                    skipBrowserRedirect: false
                }
            });

            if (error) throw error;
        } catch (error) {
            console.error('Google Link Error:', error);
            alert('구글 계정 연동 중 오류가 발생했습니다.');
        }
    };

    const signInAnonymously = async () => {
        try {
            const { error } = await supabase.auth.signInAnonymously();
            if (error) throw error;
        } catch (error) {
            console.error('Anonymous Sign-in Error:', error);
            alert('게스트 로그인 중 오류가 발생했습니다. (Supabase 설정에서 Anonymous Sign-ins가 켜져있는지 확인해주세요)');
        }
    };

    const signInWithApple = async () => {
        try {
            const result = await SignInWithApple.authorize({
                clientId: 'com.kilssengkyu.brainrush',
                redirectURI: '',
                scopes: 'email name',
                state: '',
                nonce: '',
            });

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
            alert('Apple 로그인 중 오류가 발생했습니다.');
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

    const refreshProfile = async () => {
        if (user) {
            await fetchProfile(user.id);
        }
    };

    return (
        <AuthContext.Provider value={{ user, session, profile, loading, signInWithGoogle, signInWithApple, signInAnonymously, linkWithGoogle, signOut, refreshProfile, onlineUsers }}>
            {children}
        </AuthContext.Provider>
    );
};
