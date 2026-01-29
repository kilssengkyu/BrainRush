import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Trophy, Zap, User as UserIcon } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import Flag from './Flag';
import { useUI } from '../../contexts/UIContext';
import UserProfileModal from './UserProfileModal';

interface MatchHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string | undefined;
    initialMode?: 'all' | 'rank' | 'normal';
}

const ITEMS_PER_PAGE = 10;

const MatchHistoryModal = ({ isOpen, onClose, userId, initialMode = 'all' }: MatchHistoryModalProps) => {
    const { t } = useTranslation();
    const { showToast } = useUI();
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState(initialMode);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const observerTarget = useRef<HTMLDivElement>(null);
    const [viewProfileId, setViewProfileId] = useState<string | null>(null);

    const lastRequestMode = useRef<string | null>(null);

    // Initial load and filter change
    useEffect(() => {
        if (isOpen && userId) {
            setHistory([]);
            setPage(0);
            setHasMore(true);
            fetchHistory(0, filter);
        }
    }, [isOpen, userId, filter]);

    // Update filter when initialMode changes
    useEffect(() => {
        if (isOpen && initialMode !== filter) {
            setFilter(initialMode);
        }
    }, [initialMode, isOpen]);

    // Infinite scroll observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasMore && !loading) {
                    const nextPage = page + 1;
                    setPage(nextPage);
                    fetchHistory(nextPage * ITEMS_PER_PAGE, filter);
                }
            },
            { threshold: 0.5 }
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => observer.disconnect();
    }, [hasMore, loading, page, filter]);

    const fetchHistory = async (offset: number, mode: string) => {
        if (!userId) return;

        // Race Condition Guard
        lastRequestMode.current = mode;
        const currentRequestMode = mode;

        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('get_player_match_history', {
                p_user_id: userId,
                p_mode: mode,
                p_limit: ITEMS_PER_PAGE,
                p_offset: offset
            });

            if (error) throw error;

            // Check if this request is still relevant
            if (lastRequestMode.current !== currentRequestMode) {
                console.log(`Ignoring stale request for ${mode} (Current: ${lastRequestMode.current})`);
                return;
            }

            if (data && data.length > 0) {
                if (offset === 0) {
                    setHistory(data);
                } else {
                    setHistory(prev => [...prev, ...data]);
                }

                if (data.length < ITEMS_PER_PAGE) {
                    setHasMore(false);
                }
            } else {
                if (offset === 0) setHistory([]);
                setHasMore(false);
            }
        } catch (err) {
            console.error("Fetch history error:", err);
        } finally {
            if (lastRequestMode.current === currentRequestMode) {
                setLoading(false);
            }
        }
    };

    const handleAddFriend = async (friendId: string) => {
        if (!userId) return;
        try {
            const { error } = await supabase
                .from('friendships')
                .insert({
                    user_id: userId,
                    friend_id: friendId,
                    status: 'pending'
                });

            if (error) throw error;
            showToast(t('social.requestSent'), 'success');
            // Optimistic update
            setHistory(prev => prev.map(match =>
                match.opponent_id === friendId ? { ...match, is_friend: true } : match
            ));
        } catch (err: any) {
            console.error("Add friend error:", err);
            if (err.code === '23505' || err.message?.includes('duplicate')) {
                showToast(t('social.requestPending'), 'error');
            } else {
                showToast(t('social.requestFail'), 'error');
            }
        }
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = (now.getTime() - date.getTime()) / 1000 / 60; // minutes
        if (diff < 60) return t('common.timeAgo.minute', { count: Math.floor(diff) });
        if (diff < 24 * 60) return t('common.timeAgo.hour', { count: Math.floor(diff / 60) });
        return t('common.timeAgo.day', { count: Math.floor(diff / (60 * 24)) });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-md bg-gray-900 border border-white/10 rounded-3xl shadow-2xl flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="p-6 border-b border-white/10 flex justify-between items-center flex-shrink-0">
                    <h2 className="text-xl font-bold text-white flex gap-2 items-center">
                        {t('profile.record')}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-6 h-6 text-gray-400" />
                    </button>
                </div>

                {/* Filters */}
                <div className="px-6 py-4 flex gap-2 overflow-x-auto no-scrollbar flex-shrink-0">
                    {(['all', 'rank', 'normal'] as const).map((m) => (
                        <button
                            key={m}
                            onClick={() => {
                                if (filter === m) return; // Fix: Prevent reload if already active
                                setFilter(m);
                                setPage(0);
                                setHasMore(true);
                                setHistory([]);
                            }}
                            className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${filter === m
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                }`}
                        >
                            {m === 'all' ? t('game.all', 'All') : t(`game.${m}`)}
                        </button>
                    ))}
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-6 pt-0 space-y-3 custom-scrollbar">
                    {history.length === 0 && !loading ? (
                        <div className="text-center py-12 text-gray-500">
                            {t('profile.noRecord', 'No match history.')}
                        </div>
                    ) : (
                        history.map((match) => (
                            <div
                                key={match.session_id}
                                className="bg-gray-800/50 p-3 rounded-xl flex items-center justify-between border border-white/5 hover:border-white/10 transition cursor-pointer"
                                onClick={() => {
                                    if (!match.opponent_id || match.opponent_id.startsWith('guest_')) return;
                                    setViewProfileId(match.opponent_id);
                                }}
                            >
                                {/* Left: Result & Mode */}
                                <div className="flex items-center gap-3">
                                    <div className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center font-bold text-sm ${match.result === 'WIN' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                        match.result === 'LOSE' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                                            'bg-gray-500/20 text-gray-400'
                                        }`}>
                                        <span>{match.result}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="text-xs text-gray-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                                            {match.game_mode === 'rank' && <Trophy size={10} className="text-purple-400" />}
                                            {match.game_mode === 'normal' && <Zap size={10} className="text-blue-400" />}
                                            {match.game_mode}
                                        </div>
                                        <div className="text-xs text-slate-500">{formatTime(match.created_at)}</div>
                                    </div>
                                </div>

                                {/* Right: Opponent & Action */}
                                <div className="flex items-center gap-3">
                                    <div className="text-right">
                                        <div className="text-sm font-semibold flex items-center justify-end gap-1.5">
                                            {match.opponent_nickname || t('game.unknownPlayer')}
                                            <Flag code={match.opponent_country} size="xs" />
                                        </div>
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-gray-600 overflow-hidden relative border border-gray-500">
                                        {match.opponent_avatar_url ? (
                                            <img src={match.opponent_avatar_url} className="w-full h-full object-cover" />
                                        ) : (
                                            <UserIcon className="w-full h-full p-1.5 text-gray-400" />
                                        )}
                                    </div>

                                    {/* Add Friend Button */}
                                    {!match.is_friend && match.opponent_id && match.opponent_id !== userId && !match.opponent_id.startsWith('guest_') && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleAddFriend(match.opponent_id); }}
                                            className="p-1.5 bg-green-600/20 text-green-400 rounded-lg hover:bg-green-600 hover:text-white transition ml-1"
                                            title={t('social.addFriend')}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}

                    {/* Infinite Scroll Trigger & Loading */}
                    <div ref={observerTarget} className="py-4 flex justify-center h-10">
                        {loading && (
                            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        )}
                    </div>
                </div>
            </div>
            <UserProfileModal
                isOpen={!!viewProfileId}
                onClose={() => setViewProfileId(null)}
                userId={viewProfileId}
            />
        </div>
    );
};

export default MatchHistoryModal;
