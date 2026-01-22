import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    profile: any | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    signInAnonymously: () => Promise<void>;
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
    signInAnonymously: async () => { },
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

    const fetchProfile = async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                // If profile doesn't exist (e.g. table dropped), create it
                if (error.code === 'PGRST116') {
                    console.log('Profile missing, creating new profile for:', userId);
                    const { data: userData } = await supabase.auth.getUser();
                    if (userData.user) {
                        const newProfile = {
                            id: userId,
                            email: userData.user.email,
                            nickname: 'Player_' + Math.floor(Math.random() * 9000 + 1000),
                            avatar_url: userData.user.user_metadata?.avatar_url,
                            created_at: new Date().toISOString()
                        };

                        const { error: insertError } = await supabase
                            .from('profiles')
                            .insert([newProfile]);

                        if (!insertError) {
                            setProfile(newProfile);
                            return;
                        } else {
                            console.error('Failed to create profile:', insertError);
                        }
                    }
                }
                console.error('Error fetching profile:', error);
            } else {
                setProfile(data);
            }
        } catch (error) {
            console.error('Error in fetchProfile:', error);
        } finally {
            setLoading(false);
        }
    };

    const signInWithGoogle = async () => {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin,
                }
            });
            if (error) throw error;
        } catch (error) {
            console.error('Google Sign-in Error:', error);
            alert('구글 로그인 중 오류가 발생했습니다.');
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

    // Global Presence Tracking
    const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (user) {
            const channel = supabase.channel('online_users', {
                config: {
                    presence: {
                        key: user.id,
                    },
                },
            });

            channel
                .on('presence', { event: 'sync' }, () => {
                    const newState = channel.presenceState();
                    const onlineIds = new Set(Object.keys(newState));
                    setOnlineUsers(onlineIds);
                })
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        await channel.track({
                            user_id: user.id,
                            online_at: new Date().toISOString(),
                        });
                    }
                });

            return () => {
                supabase.removeChannel(channel);
            };
        } else {
            setOnlineUsers(new Set());
        }
    }, [user]);

    return (
        <AuthContext.Provider value={{ user, session, profile, loading, signInWithGoogle, signInAnonymously, signOut, refreshProfile, onlineUsers }}>
            {children}
        </AuthContext.Provider>
    );
};
