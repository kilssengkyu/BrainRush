import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, Trophy, User as UserIcon, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import Flag from './Flag';
import { getTierColor, getTierIcon } from '../../utils/rankUtils';
import UserProfileModal from './UserProfileModal';
import LevelBadge from './LevelBadge';
import AvatarModal from './AvatarModal';

interface LeaderboardModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface Ranker {
    rank: number;
    id: string;
    nickname: string;
    avatar_url: string;
    country: string;
    mmr: number;
    level?: number | null;
    tier: string;
}

const LeaderboardModal: React.FC<LeaderboardModalProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();
    const { user, profile } = useAuth();
    const [topPlayers, setTopPlayers] = useState<Ranker[]>([]);
    const [myRank, setMyRank] = useState<Ranker | null>(null);
    const [loading, setLoading] = useState(false);
    const [viewProfileId, setViewProfileId] = useState<string | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<{ src: string; alt: string } | null>(null);
    const [scope, setScope] = useState<'global' | 'country'>('global');
    const myCountry = profile?.country ?? null;
    const placementRequiredGames = 5;
    const rankGamesPlayed = Math.max(0, Number((profile as any)?.rank_games_played ?? 0));
    const placementGamesRemaining = Math.max(0, placementRequiredGames - rankGamesPlayed);
    const isPlacementPending = Boolean(user) && rankGamesPlayed < placementRequiredGames;

    useEffect(() => {
        if (isOpen && scope === 'country' && !myCountry) {
            setScope('global');
            return;
        }
        if (isOpen) {
            fetchLeaderboard();
        }
    }, [isOpen, scope, myCountry, user?.id]);

    useEffect(() => {
        if (!isOpen) return;
        const handleModalCloseRequest = (event: Event) => {
            const customEvent = event as CustomEvent<{ handled?: boolean }>;
            if (customEvent.detail?.handled) return;
            if (customEvent.detail) customEvent.detail.handled = true;
            onClose();
        };
        window.addEventListener('brainrush:request-modal-close', handleModalCloseRequest as EventListener);
        return () => {
            window.removeEventListener('brainrush:request-modal-close', handleModalCloseRequest as EventListener);
        };
    }, [isOpen, onClose]);

    const fetchLeaderboard = async () => {
        setLoading(true);
        try {
            const countryFilter = scope === 'country' ? myCountry : null;
            const { data, error } = await supabase.rpc('get_leaderboard', {
                p_user_id: user?.id ?? null,
                p_country: countryFilter
            });

            if (error) throw error;

            if (data) {
                let topPlayers = data.top_players || [];
                let userRank = data.user_rank || null;

                const missingIds = new Set<string>();
                topPlayers.forEach((player: Ranker) => {
                    if (player?.id && typeof player.level !== 'number') {
                        missingIds.add(player.id);
                    }
                });
                if (userRank?.id && typeof userRank.level !== 'number') {
                    missingIds.add(userRank.id);
                }

                if (missingIds.size > 0) {
                    const { data: levelRows, error: levelError } = await supabase
                        .from('profiles')
                        .select('id, level')
                        .in('id', Array.from(missingIds));

                    if (levelError) {
                        console.error('Error fetching leaderboard levels:', levelError);
                    } else {
                        const levelMap = new Map((levelRows || []).map(row => [row.id, row.level]));
                        topPlayers = topPlayers.map((player: Ranker) => (
                            player?.id && levelMap.has(player.id)
                                ? { ...player, level: levelMap.get(player.id) }
                                : player
                        ));
                        if (userRank?.id && levelMap.has(userRank.id)) {
                            userRank = { ...userRank, level: levelMap.get(userRank.id) };
                        }
                    }
                }

                setTopPlayers(topPlayers);
                setMyRank(userRank);
            }
        } catch (err) {
            console.error('Error fetching leaderboard:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/80 backdrop-blur-md p-4"
                        onClick={onClose}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="bg-slate-50 dark:bg-gray-900 w-full max-w-md h-[80vh] rounded-3xl border border-slate-200 dark:border-gray-700 shadow-2xl flex flex-col overflow-hidden relative"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="flex justify-between items-center p-5 border-b border-slate-200 dark:border-gray-800 bg-slate-50 dark:bg-gray-900/95 sticky top-0 z-10">
                                <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                                    <Trophy className="text-yellow-500 dark:text-yellow-400 w-6 h-6" />
                                    {t('leaderboard.title', 'Ranking')}
                                </h3>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-gray-800 transition-colors"
                                >
                                    <X className="w-5 h-5 text-slate-500 dark:text-gray-400" />
                                </button>
                            </div>
                            <div className="px-4 pt-3">
                                <div className="inline-flex rounded-xl border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800/70 p-1 gap-1 shadow-sm dark:shadow-none">
                                    <button
                                        type="button"
                                        onClick={() => setScope('global')}
                                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${scope === 'global' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700'}`}
                                    >
                                        {t('leaderboard.global', 'Global')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => myCountry && setScope('country')}
                                        disabled={!myCountry}
                                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${scope === 'country' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700'} ${!myCountry ? 'opacity-40 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent' : ''}`}
                                    >
                                        {myCountry ? `${t('leaderboard.country', 'Country')} (${myCountry})` : t('leaderboard.country', 'Country')}
                                    </button>
                                </div>
                                {isPlacementPending && (
                                    <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                                        {t(
                                            'leaderboard.placementNotice',
                                            '배치 {{count}}판 후 랭킹에 표시됩니다.',
                                            { count: placementGamesRemaining }
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* List */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
                                {loading ? (
                                    <div className="flex items-center justify-center h-full">
                                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                                    </div>
                                ) : (
                                    topPlayers.map((player) => (
                                        <RankItem
                                            key={player.id || `rank-${player.rank}`}
                                            player={player}
                                            isMe={player.id === user?.id}
                                            onClick={player.id ? () => setViewProfileId(player.id) : undefined}
                                            onAvatarClick={() => {
                                                if (player.avatar_url) {
                                                    setAvatarPreview({ src: player.avatar_url, alt: player.nickname });
                                                }
                                            }}
                                        />
                                    ))
                                )}
                            </div>

                            {/* My Rank (Sticky Bottom) */}
                            {myRank && !topPlayers.some(p => p.id === myRank.id) && (
                                <div className="p-4 border-t border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900/95 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] dark:shadow-[0_-10px_20px_rgba(0,0,0,0.5)] z-10">
                                    <div className="text-xs text-slate-500 mb-2 font-bold px-2">{t('leaderboard.myRank')}</div>
                                    <RankItem
                                        player={myRank}
                                        isMe={true}
                                        onClick={() => setViewProfileId(myRank.id)}
                                        onAvatarClick={() => {
                                            if (myRank.avatar_url) {
                                                setAvatarPreview({ src: myRank.avatar_url, alt: myRank.nickname });
                                            }
                                        }}
                                    />
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            <UserProfileModal
                isOpen={!!viewProfileId}
                onClose={() => setViewProfileId(null)}
                userId={viewProfileId}
            />
            <AvatarModal
                isOpen={!!avatarPreview}
                onClose={() => setAvatarPreview(null)}
                src={avatarPreview?.src ?? null}
                alt={avatarPreview?.alt}
            />
        </>
    );
};

const RankItem = ({
    player,
    isMe,
    onClick,
    onAvatarClick
}: {
    player: Ranker;
    isMe: boolean;
    onClick?: () => void;
    onAvatarClick?: () => void;
}) => {
    const { t } = useTranslation();
    const TierIcon = getTierIcon(player.tier);
    const tierColor = getTierColor(player.tier);
    const isTopThree = player.rank <= 3;

    // Top 3 Styles
    let rankStyle = "text-slate-500 dark:text-gray-400 font-mono font-bold";
    let bgStyle = isMe ? "bg-blue-50 dark:bg-blue-900/20 border-blue-400/50 dark:border-blue-500/50" : "bg-white dark:bg-gray-800/50 border-slate-200 dark:border-gray-700/50";
    let glowStyle = isMe ? "shadow-sm" : "shadow-sm dark:shadow-none";
    let shimmerStyle = "";

    if (player.rank === 1) {
        rankStyle = "text-yellow-600 dark:text-yellow-400 font-black text-xl drop-shadow-md";
        bgStyle = "bg-gradient-to-r from-yellow-50 dark:from-yellow-950/55 via-yellow-100/30 dark:via-yellow-900/20 to-white dark:to-gray-800 border-yellow-300 dark:border-yellow-400/70";
        glowStyle = "shadow-[0_4px_15px_rgba(250,204,21,0.15)] dark:shadow-[0_0_28px_rgba(250,204,21,0.18)]";
        shimmerStyle = "from-transparent via-yellow-400/10 dark:via-yellow-200/18 to-transparent";
    } else if (player.rank === 2) {
        rankStyle = "text-slate-500 dark:text-gray-300 font-black text-lg";
        bgStyle = "bg-gradient-to-r from-slate-100 dark:from-slate-200/10 via-slate-50 dark:via-gray-700/35 to-white dark:to-gray-800 border-slate-300 dark:border-gray-300/55";
        glowStyle = "shadow-[0_4px_12px_rgba(148,163,184,0.1)] dark:shadow-[0_0_22px_rgba(226,232,240,0.14)]";
        shimmerStyle = "from-transparent via-slate-400/10 dark:via-slate-100/14 to-transparent";
    } else if (player.rank === 3) {
        rankStyle = "text-orange-600 dark:text-orange-400 font-black text-lg";
        bgStyle = "bg-gradient-to-r from-orange-50 dark:from-orange-950/55 via-orange-100/30 dark:via-orange-900/20 to-white dark:to-gray-800 border-orange-300 dark:border-orange-400/60";
        glowStyle = "shadow-[0_4px_12px_rgba(251,146,60,0.1)] dark:shadow-[0_0_22px_rgba(251,146,60,0.14)]";
        shimmerStyle = "from-transparent via-orange-400/10 dark:via-orange-200/14 to-transparent";
    }

    return (
        <motion.div
            initial={false}
            whileHover={isTopThree ? { scale: 1.015, y: -1 } : undefined}
            className={`relative flex items-center gap-3 p-3 rounded-2xl border ${bgStyle} ${glowStyle} transition-all cursor-pointer overflow-hidden group`}
            onClick={onClick}
        >
            {isTopThree && (
                <>
                    <div className={`absolute inset-0 bg-gradient-to-r ${shimmerStyle} animate-bg-flow opacity-90 pointer-events-none`} />
                    <div className="absolute inset-[1px] rounded-[15px] border border-white/10 pointer-events-none" />
                </>
            )}
            {/* Rank Number */}
            <div className={`relative z-10 w-8 text-center ${rankStyle}`}>
                {player.rank}
            </div>

            {/* Avatar */}
            <button
                type="button"
                className={`relative z-10 w-10 h-10 rounded-full bg-slate-100 dark:bg-gray-700 overflow-hidden border-2 ${isMe ? 'border-blue-400' : isTopThree ? 'border-amber-200/40 dark:border-white/20' : 'border-transparent'} shadow-sm cursor-zoom-in group-hover:scale-105 transition-transform`}
                onClick={(event) => {
                    event.stopPropagation();
                    onAvatarClick?.();
                }}
                aria-label={t('leaderboard.avatarPreview', { nickname: player.nickname })}
            >
                {player.avatar_url ? (
                    <img src={player.avatar_url} alt={player.nickname} className="w-full h-full object-cover" />
                ) : (
                    <UserIcon className="w-full h-full p-2 text-slate-500 dark:text-gray-400" />
                )}
            </button>

            {/* Info */}
            <div className="relative z-10 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <Flag code={player.country} />
                    <span className={`font-bold truncate ${isMe ? 'text-blue-600 dark:text-blue-300' : 'text-slate-800 dark:text-gray-200'}`}>
                        {player.nickname}
                    </span>
                    {typeof player.level === 'number' && (
                        <LevelBadge level={player.level} size="xs" className="ml-1" />
                    )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                    {/* Tier Badge */}
                    <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold bg-gradient-to-r ${tierColor} text-black flex items-center gap-1`}>
                        <TierIcon className="w-3 h-3" />
                        {player.tier}
                    </div>
                </div>
            </div>

            {/* MMR */}
            <div className="relative z-10 text-right">
                <div className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                    {player.mmr.toLocaleString()}
                </div>
                <div className="text-[10px] text-gray-500">{t('leaderboard.mmrLabel')}</div>
            </div>
        </motion.div>
    );
};

export default LeaderboardModal;
