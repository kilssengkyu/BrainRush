import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { User, MessageCircle, Swords, UserMinus, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Flag from '../ui/Flag';
import UserProfileModal from '../ui/UserProfileModal';

interface Friend {
    id: string;
    nickname: string;
    avatar_url: string;
    country: string | null;
    mmr: number;
    last_seen: string | null;
    status?: 'online' | 'offline' | 'ingame';
}

interface FriendListProps {
    onChatClick: (friendId: string, nickname: string) => void;
    onChallengeClick: (friendId: string) => void;
    onUnreadChange?: (count: number) => void;
}

const FriendList: React.FC<FriendListProps> = ({ onChatClick, onChallengeClick, onUnreadChange }) => {
    const { user, onlineUsers } = useAuth();
    const { confirm } = useUI();
    const { t } = useTranslation();
    const [friends, setFriends] = useState<Friend[]>([]);
    const [loading, setLoading] = useState(true);
    const [unreadByFriend, setUnreadByFriend] = useState<Record<string, number>>({});
    const [viewProfileId, setViewProfileId] = useState<string | null>(null);

    useEffect(() => {
        if (user) {
            fetchFriends();

            // Subscribe to Friend List Changes
            const friendListChannel = supabase
                .channel(`friend_list_${user.id}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'friendships',
                    filter: `user_id=eq.${user.id}`
                }, () => {
                    fetchFriends();
                })
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'friendships',
                    filter: `friend_id=eq.${user.id}`
                }, () => {
                    fetchFriends();
                })
                .subscribe();

            return () => {
                supabase.removeChannel(friendListChannel);
            };
        }
    }, [user]);

    useEffect(() => {
        if (!user) return;

        fetchUnreadCounts();

        const unreadChannel = supabase
            .channel(`unread_messages_${user.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'chat_messages',
                filter: `receiver_id=eq.${user.id}`
            }, () => {
                fetchUnreadCounts();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(unreadChannel);
        };
    }, [user, onUnreadChange]);

    const fetchFriends = async () => {
        if (!user) return;
        setLoading(true);

        try {
            const { data: friendships, error } = await supabase
                .from('friendships')
                .select('user_id, friend_id')
                .eq('status', 'accepted')
                .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

            if (error) throw error;

            if (!friendships || friendships.length === 0) {
                setFriends([]);
                setLoading(false);
                return;
            }

            // Extract friend IDs
            const friendIds = friendships.map((f: { user_id: string; friend_id: string }) =>
                f.user_id === user.id ? f.friend_id : f.user_id
            );

            // Fetch profiles
            const { data: profiles, error: profileError } = await supabase
                .from('profiles')
                .select('id, nickname, avatar_url, country, mmr, last_seen')
                .in('id', friendIds);

            if (profileError) throw profileError;

            // Sort by MMR (High to Low)
            const sortedFriends = (profiles as Friend[]).sort((a, b) => b.mmr - a.mmr);

            setFriends(sortedFriends || []);

        } catch (err) {
            console.error("Error fetching friends:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchUnreadCounts = async () => {
        if (!user) return;

        try {
            const { data, error } = await supabase
                .from('chat_messages')
                .select('id, sender_id')
                .eq('receiver_id', user.id)
                .eq('is_read', false);

            if (error) throw error;

            const counts: Record<string, number> = {};
            (data || []).forEach((msg) => {
                counts[msg.sender_id] = (counts[msg.sender_id] || 0) + 1;
            });

            setUnreadByFriend(counts);
            const totalUnread = Object.values(counts).reduce((sum, count) => sum + count, 0);
            onUnreadChange?.(totalUnread);
        } catch (err) {
            console.error("Error fetching unread counts:", err);
        }
    };

    const handleDelete = async (friendId: string, nickname: string) => {
        if (!user) return;

        const confirmed = await confirm(
            t('social.deleteFriend'),
            t('social.deleteFriendConfirm', { nickname })
        );

        if (!confirmed) return;

        try {
            // Delete friendship record where (user_id=me AND friend_id=them) OR (user_id=them AND friend_id=me)
            const { error } = await supabase
                .from('friendships')
                .delete()
                .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`);

            if (error) throw error;

            // Remove from local state
            setFriends(prev => prev.filter(f => f.id !== friendId));

        } catch (err) {
            console.error("Error deleting friend:", err);
            alert(t('social.deleteFriendFail'));
        }
    };

    // Helper for formatting last seen
    const formatLastSeen = (dateString: string | null) => {
        if (!dateString) return t('common.timeAgo.longAgo');

        const now = new Date();
        const lastSeen = new Date(dateString);
        const diffInSeconds = Math.floor((now.getTime() - lastSeen.getTime()) / 1000);

        if (diffInSeconds < 60) return t('common.timeAgo.justNow');

        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) return t('common.timeAgo.minute', { count: diffInMinutes });

        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) return t('common.timeAgo.hour', { count: diffInHours });

        const diffInDays = Math.floor(diffInHours / 24);
        if (diffInDays <= 7) return t('common.timeAgo.day', { count: diffInDays });

        return t('common.timeAgo.longAgo');
    };

    if (loading) {
        return <div className="p-4 text-center text-gray-400">{t('social.loadingFriends')}</div>;
    }

    return (
        <div className="bg-slate-800 rounded-lg p-4 shadow-lg border border-slate-700">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <User size={20} className="text-blue-400" />
                {t('social.friendList')}
            </h3>

            {friends.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                    <p>{t('social.noFriends')}</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {friends.map(friend => {
                        const unreadCount = unreadByFriend[friend.id] || 0;
                        return (
                        <div
                            key={friend.id}
                            className="flex items-center justify-between bg-slate-700/50 p-3 rounded-lg hover:bg-slate-700 transition cursor-pointer"
                            onClick={() => setViewProfileId(friend.id)}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-slate-600 overflow-hidden border border-slate-500 relative">
                                    {unreadCount > 0 && (
                                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-slate-700" aria-hidden="true"></span>
                                    )}
                                    {friend.avatar_url ? (
                                        <img src={friend.avatar_url} alt={friend.nickname} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                                            <User size={20} />
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-1.5">
                                        <Flag code={friend.country} size="sm" />
                                        <span className="font-semibold text-white">{friend.nickname}</span>
                                    </div>

                                    <div className="flex items-center gap-3 text-xs">
                                        <div className="flex items-center gap-1 text-purple-400 font-medium">
                                            <Trophy size={10} />
                                            <span>{friend.mmr || 1000}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-gray-400">
                                            <div className={`w-1.5 h-1.5 rounded-full ${onlineUsers.has(friend.id) ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                                            {onlineUsers.has(friend.id)
                                                ? <span className="text-green-400">{t('social.online')}</span>
                                                : <span>{formatLastSeen(friend.last_seen)}</span>}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onChatClick(friend.id, friend.nickname); }}
                                    className="relative p-2 bg-blue-600/20 text-blue-400 rounded-full hover:bg-blue-600 hover:text-white transition"
                                    title={t('social.chat')}
                                >
                                    <MessageCircle size={18} />
                                    {unreadCount > 0 && (
                                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-slate-800" aria-hidden="true"></span>
                                    )}
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onChallengeClick(friend.id); }}
                                    className="p-2 bg-red-600/20 text-red-400 rounded-full hover:bg-red-600 hover:text-white transition"
                                    title={t('social.challenge')}
                                >
                                    <Swords size={18} />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete(friend.id, friend.nickname); }}
                                    className="p-2 bg-gray-600/20 text-gray-400 rounded-full hover:bg-gray-600 hover:text-white transition"
                                    title={t('social.deleteFriend')}
                                >
                                    <UserMinus size={18} />
                                </button>
                            </div>
                        </div>
                        );
                    })}
                </div>
            )}

            <UserProfileModal
                isOpen={!!viewProfileId}
                onClose={() => setViewProfileId(null)}
                userId={viewProfileId}
            />
        </div>
    );
};
export default FriendList;
