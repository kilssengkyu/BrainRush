import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, Trophy, User as UserIcon, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import Flag from './Flag';
import { getTierColor, getTierIcon } from '../../utils/rankUtils';
import UserProfileModal from './UserProfileModal';

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
    tier: string;
}

const LeaderboardModal: React.FC<LeaderboardModalProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [topPlayers, setTopPlayers] = useState<Ranker[]>([]);
    const [myRank, setMyRank] = useState<Ranker | null>(null);
    const [loading, setLoading] = useState(false);
    const [viewProfileId, setViewProfileId] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchLeaderboard();
        }
    }, [isOpen]);

    const fetchLeaderboard = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('get_leaderboard', {
                p_user_id: user?.id ?? null
            });

            if (error) throw error;

            if (data) {
                setTopPlayers(data.top_players || []);
                setMyRank(data.user_rank || null);
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
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
                        onClick={onClose}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="bg-gray-900 w-full max-w-md h-[80vh] rounded-3xl border border-gray-700 shadow-2xl flex flex-col overflow-hidden relative"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="flex justify-between items-center p-5 border-b border-gray-800 bg-gray-900/95 sticky top-0 z-10">
                                <h3 className="text-xl font-black text-white flex items-center gap-2">
                                    <Trophy className="text-yellow-400 w-6 h-6" />
                                    {t('leaderboard.title', 'Ranking')}
                                </h3>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-full hover:bg-gray-800 transition-colors"
                                >
                                    <X className="w-5 h-5 text-gray-400" />
                                </button>
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
                                        />
                                    ))
                                )}
                            </div>

                            {/* My Rank (Sticky Bottom) */}
                            {myRank && !topPlayers.some(p => p.id === myRank.id) && (
                                <div className="p-4 border-t border-gray-800 bg-gray-900/95 shadow-[0_-10px_20px_rgba(0,0,0,0.5)] z-10">
                                    <div className="text-xs text-gray-500 mb-2 font-bold px-2">MY RANK</div>
                                    <RankItem player={myRank} isMe={true} onClick={() => setViewProfileId(myRank.id)} />
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
        </>
    );
};

const RankItem = ({ player, isMe, onClick }: { player: Ranker, isMe: boolean, onClick?: () => void }) => {
    const TierIcon = getTierIcon(player.tier);
    const tierColor = getTierColor(player.tier);

    // Top 3 Styles
    let rankStyle = "text-gray-400 font-mono font-bold";
    let bgStyle = isMe ? "bg-blue-900/20 border-blue-500/50" : "bg-gray-800/50 border-gray-700/50";

    if (player.rank === 1) {
        rankStyle = "text-yellow-400 font-black text-xl drop-shadow-md";
        bgStyle = "bg-gradient-to-r from-yellow-900/20 to-gray-800 border-yellow-500/50";
    } else if (player.rank === 2) {
        rankStyle = "text-gray-300 font-black text-lg";
        bgStyle = "bg-gradient-to-r from-gray-700/30 to-gray-800 border-gray-400/50";
    } else if (player.rank === 3) {
        rankStyle = "text-orange-400 font-black text-lg";
        bgStyle = "bg-gradient-to-r from-orange-900/20 to-gray-800 border-orange-500/50";
    }

    return (
        <div
            className={`flex items-center gap-3 p-3 rounded-2xl border ${bgStyle} transition-all cursor-pointer`}
            onClick={onClick}
        >
            {/* Rank Number */}
            <div className={`w-8 text-center ${rankStyle}`}>
                {player.rank}
            </div>

            {/* Avatar */}
            <div className={`relative w-10 h-10 rounded-full bg-gray-700 overflow-hidden border-2 ${isMe ? 'border-blue-400' : 'border-transparent'}`}>
                {player.avatar_url ? (
                    <img src={player.avatar_url} alt={player.nickname} className="w-full h-full object-cover" />
                ) : (
                    <UserIcon className="w-full h-full p-2 text-gray-400" />
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <Flag code={player.country} />
                    <span className={`font-bold truncate ${isMe ? 'text-blue-300' : 'text-gray-200'}`}>
                        {player.nickname}
                    </span>
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
            <div className="text-right">
                <div className="font-mono font-bold text-white text-sm">
                    {player.mmr.toLocaleString()}
                </div>
                <div className="text-[10px] text-gray-500">MMR</div>
            </div>
        </div>
    );
};

export default LeaderboardModal;
