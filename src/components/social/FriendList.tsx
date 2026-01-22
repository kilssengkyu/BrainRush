import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { User, MessageCircle, Swords, UserMinus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Friend {
    id: string;
    nickname: string;
    avatar_url: string;
    status?: 'online' | 'offline' | 'ingame';
}

interface FriendListProps {
    onChatClick: (friendId: string, nickname: string) => void;
    onChallengeClick: (friendId: string) => void;
}

const FriendList: React.FC<FriendListProps> = ({ onChatClick, onChallengeClick }) => {
    const { user, onlineUsers } = useAuth();
    const { confirm } = useUI();
    const { t } = useTranslation();
    const [friends, setFriends] = useState<Friend[]>([]);
    const [loading, setLoading] = useState(true);

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
                .select('id, nickname, avatar_url')
                .in('id', friendIds);

            if (profileError) throw profileError;

            setFriends((profiles as Friend[]) || []);

        } catch (err) {
            console.error("Error fetching friends:", err);
        } finally {
            setLoading(false);
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
                    {friends.map(friend => (
                        <div key={friend.id} className="flex items-center justify-between bg-slate-700/50 p-3 rounded-lg hover:bg-slate-700 transition">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-slate-600 overflow-hidden border border-slate-500">
                                    {friend.avatar_url ? (
                                        <img src={friend.avatar_url} alt={friend.nickname} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                                            <User size={20} />
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <div className="font-semibold text-white">{friend.nickname}</div>
                                    <div className="text-xs text-gray-400 flex items-center gap-1">
                                        <div className={`w-2 h-2 rounded-full ${onlineUsers.has(friend.id) ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                                        {onlineUsers.has(friend.id) ? t('social.online') : t('social.offline')}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => onChatClick(friend.id, friend.nickname)}
                                    className="p-2 bg-blue-600/20 text-blue-400 rounded-full hover:bg-blue-600 hover:text-white transition"
                                    title={t('social.chat')}
                                >
                                    <MessageCircle size={18} />
                                </button>
                                <button
                                    onClick={() => onChallengeClick(friend.id)}
                                    className="p-2 bg-red-600/20 text-red-400 rounded-full hover:bg-red-600 hover:text-white transition"
                                    title={t('social.challenge')}
                                >
                                    <Swords size={18} />
                                </button>
                                <button
                                    onClick={() => handleDelete(friend.id, friend.nickname)}
                                    className="p-2 bg-gray-600/20 text-gray-400 rounded-full hover:bg-gray-600 hover:text-white transition"
                                    title={t('social.deleteFriend')}
                                >
                                    <UserMinus size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default FriendList;
