import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Check, X, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface FriendRequestsProps {
    onCountChange?: (count: number) => void;
}

const FriendRequests: React.FC<FriendRequestsProps> = ({ onCountChange }) => {
    const { user } = useAuth();
    const { t } = useTranslation();
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            fetchRequests();

            // Subscribe to new requests
            const subscription = supabase
                .channel('friend_requests')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'friendships',
                    filter: `friend_id=eq.${user.id}`
                }, (payload: any) => {
                    console.log('New friend request:', payload);
                    fetchRequests(); // Refresh
                })
                .subscribe();

            return () => {
                subscription.unsubscribe();
            };
        }
    }, [user]);

    useEffect(() => {
        onCountChange?.(requests.length);
    }, [onCountChange, requests.length]);

    const fetchRequests = async () => {
        if (!user) return;
        try {
            // Get pending requests
            const { data: friendships, error } = await supabase
                .from('friendships')
                .select('id, user_id, created_at')
                .eq('friend_id', user.id)
                .eq('status', 'pending');

            if (error) throw error;

            if (!friendships || friendships.length === 0) {
                setRequests([]);
                setLoading(false);
                return;
            }

            // Fetch requester profiles
            const requesterIds = friendships.map((f: { user_id: string }) => f.user_id);
            const { data: profiles, error: profileError } = await supabase
                .from('profiles')
                .select('id, nickname, avatar_url')
                .in('id', requesterIds);

            if (profileError) throw profileError;

            // Merge data
            const merged = friendships.map((f: { id: string; user_id: string }) => {
                const profile = profiles?.find((p: any) => p.id === f.user_id);
                return {
                    friendship_id: f.id,
                    ...profile
                };
            });

            setRequests(merged);

        } catch (err) {
            console.error("Error fetching requests:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleResponse = async (friendshipId: string, accept: boolean) => {
        try {
            if (accept) {
                const { error } = await supabase
                    .from('friendships')
                    .update({ status: 'accepted', updated_at: new Date().toISOString() })
                    .eq('id', friendshipId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('friendships')
                    .delete()
                    .eq('id', friendshipId);
                if (error) throw error;
            }

            // Remove from local list
            setRequests(prev => prev.filter(r => r.friendship_id !== friendshipId));

        } catch (err) {
            console.error("Error responding to request:", err);
        }
    };

    if (loading) return null; // Or spinner
    if (requests.length === 0) return null;

    return (
        <div className="bg-slate-800 rounded-lg p-4 shadow-lg border border-slate-700 mb-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Bell size={20} className="text-yellow-400" />
                {t('social.friendRequests')} ({requests.length})
            </h3>

            <div className="space-y-3">
                {requests.map(req => (
                    <div key={req.friendship_id} className="flex items-center justify-between bg-slate-700/50 p-3 rounded-lg">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-600 overflow-hidden border border-slate-500">
                                {req.avatar_url ? (
                                    <img src={req.avatar_url} alt={req.nickname} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">?</div>
                                )}
                            </div>
                            <span className="font-semibold text-white">{req.nickname}</span>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => handleResponse(req.friendship_id, true)}
                                className="p-1.5 bg-green-600/20 text-green-400 rounded hover:bg-green-600 hover:text-white transition"
                                title={t('social.accept')}
                            >
                                <Check size={18} />
                            </button>
                            <button
                                onClick={() => handleResponse(req.friendship_id, false)}
                                className="p-1.5 bg-red-600/20 text-red-400 rounded hover:bg-red-600 hover:text-white transition"
                                title={t('social.reject')}
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default FriendRequests;
