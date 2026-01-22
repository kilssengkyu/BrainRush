import React, { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Search, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const AddFriend = () => {
    const { user } = useAuth();
    const { t } = useTranslation();
    const [nickname, setNickname] = useState('');
    const [loading, setLoading] = useState(false);
    const [searchResult, setSearchResult] = useState<any>(null);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nickname.trim()) return;

        setLoading(true);
        setMessage(null);
        setSearchResult(null);

        try {
            // Find user by nickname
            const { data, error } = await supabase
                .from('profiles')
                .select('id, nickname, avatar_url')
                .eq('nickname', nickname.trim())
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    setMessage({ text: t('social.userNotFound'), type: 'error' });
                } else {
                    setMessage({ text: t('social.searchError'), type: 'error' });
                }
            } else if (data.id === user?.id) {
                setMessage({ text: t('social.cannotAddSelf'), type: 'error' });
            } else {
                setSearchResult(data);
            }
        } catch (err) {
            console.error(err);
            setMessage({ text: t('social.searchError'), type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const sendFriendRequest = async () => {
        if (!user || !searchResult) return;
        setLoading(true);

        try {
            // Check if friendship already exists
            const { data: existing } = await supabase
                .from('friendships')
                .select('status')
                .or(`and(user_id.eq.${user.id},friend_id.eq.${searchResult.id}),and(user_id.eq.${searchResult.id},friend_id.eq.${user.id})`)
                .single();

            if (existing) {
                if (existing.status === 'accepted') {
                    setMessage({ text: t('social.alreadyFriends'), type: 'error' });
                } else if (existing.status === 'pending') {
                    setMessage({ text: t('social.requestPending'), type: 'error' });
                } else {
                    setMessage({ text: t('social.blocked'), type: 'error' });
                }
                setLoading(false);
                return;
            }

            // Send Request
            const { error } = await supabase
                .from('friendships')
                .insert({
                    user_id: user.id,
                    friend_id: searchResult.id,
                    status: 'pending'
                });

            if (error) throw error;

            setMessage({ text: t('social.requestSent'), type: 'success' });
            setSearchResult(null);
            setNickname('');

        } catch (err) {
            console.error(err);
            setMessage({ text: t('social.requestFail'), type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-slate-800 rounded-lg p-4 shadow-lg border border-slate-700">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <UserPlus size={20} className="text-green-400" />
                {t('social.addFriend')}
            </h3>

            <form onSubmit={handleSearch} className="flex gap-2 mb-4">
                <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder={t('social.searchNickname')}
                    className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
                <button
                    type="submit"
                    disabled={loading}
                    className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-lg transition disabled:opacity-50"
                >
                    <Search size={20} />
                </button>
            </form>

            {message && (
                <div className={`p-3 rounded-lg mb-4 text-sm ${message.type === 'success' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                    {message.text}
                </div>
            )}

            {searchResult && (
                <div className="bg-slate-700/50 p-3 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-600 overflow-hidden border border-slate-500">
                            {searchResult.avatar_url ? (
                                <img src={searchResult.avatar_url} alt={searchResult.nickname} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-400">
                                    <UserPlus size={20} />
                                </div>
                            )}
                        </div>
                        <span className="font-semibold text-white">{searchResult.nickname}</span>
                    </div>
                    <button
                        onClick={sendFriendRequest}
                        disabled={loading}
                        className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg text-sm transition font-medium"
                    >
                        <UserPlus size={16} /> {t('common.add')}
                    </button>
                </div>
            )}
        </div>
    );
};

export default AddFriend;
