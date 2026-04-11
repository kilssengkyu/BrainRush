import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, User as UserIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import Flag from './Flag';
import HexRadar from './HexRadar';
import { getTierFromMMR, getTierColor, getTierIcon } from '../../utils/rankUtils';

interface UserProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string | null;
}

interface ProfileData {
    id: string;
    nickname: string | null;
    avatar_url: string | null;
    country: string | null;
    mmr: number | null;
    wins: number | null;
    losses: number | null;
    casual_wins: number | null;
    casual_losses: number | null;
    speed: number | null;
    memory: number | null;
    judgment: number | null;
    calculation: number | null;
    accuracy: number | null;
    observation: number | null;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, userId }) => {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [profile, setProfile] = useState<ProfileData | null>(null);

    useEffect(() => {
        if (!isOpen || !userId) return;

        const fetchProfile = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, nickname, avatar_url, country, mmr, wins, losses, casual_wins, casual_losses, speed, memory, judgment, calculation, accuracy, observation')
                    .eq('id', userId)
                    .single();
                if (error) throw error;
                setProfile(data || null);
            } catch (err) {
                console.error('Error fetching profile:', err);
                setProfile(null);
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, [isOpen, userId]);

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

    if (!isOpen) return null;

    const rank = profile?.mmr ?? 1000;
    const tier = getTierFromMMR(rank);
    const tierColor = getTierColor(tier);
    const TierIcon = getTierIcon(tier);
    const isShinyTier = tier === 'Diamond' || tier === 'Master';
    const wins = profile?.wins ?? 0;
    const losses = profile?.losses ?? 0;
    const casualWins = profile?.casual_wins ?? 0;
    const casualLosses = profile?.casual_losses ?? 0;
    const statValues = {
        speed: profile?.speed ?? 0,
        memory: profile?.memory ?? 0,
        judgment: profile?.judgment ?? 0,
        calculation: profile?.calculation ?? 0,
        accuracy: profile?.accuracy ?? 0,
        observation: profile?.observation ?? 0
    };

    return createPortal(
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={onClose}>
            <div
                className="bg-slate-50 dark:bg-gray-900 w-full max-w-md rounded-3xl border border-gray-700 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-5 pt-[calc(env(safe-area-inset-top)+1rem)] border-b border-gray-800 bg-slate-50 dark:bg-gray-900/95 sticky top-0 z-10">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <UserIcon className="w-6 h-6 text-slate-500 dark:text-gray-400" />
                        {t('menu.profile', '프로필')}
                    </h3>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-white dark:bg-gray-800 transition-colors">
                        <X className="w-5 h-5 text-slate-500 dark:text-gray-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {loading ? (
                        <div className="flex items-center justify-center h-40">
                            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : !profile ? (
                        <div className="text-center text-gray-500 py-12">
                            {t('profile.noRecord', 'No profile data.')}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center">
                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 p-[3px] mb-4">
                                <div className="w-full h-full rounded-full bg-slate-50 dark:bg-gray-900 flex items-center justify-center overflow-hidden">
                                    {profile.avatar_url ? (
                                        <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <UserIcon className="w-12 h-12 text-slate-500 dark:text-gray-400" />
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <Flag code={profile.country} size="lg" />
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                                    {profile.nickname || t('game.unknownPlayer')}
                                </h2>
                            </div>

                            <div className={`mt-4 w-full rounded-2xl shadow-lg transform hover:scale-[1.01] transition-transform overflow-hidden bg-gradient-to-br ${tierColor} p-0`}>
                                <div className="w-full h-full rounded-2xl p-4 relative bg-black/10 dark:bg-black/20">
                                    <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(120deg,rgba(255,255,255,0.42)_0%,rgba(255,255,255,0.1)_36%,rgba(0,0,0,0.14)_100%)]" />
                                    {isShinyTier && (
                                        <motion.div
                                            className="absolute inset-y-0 -left-1/2 w-1/2 pointer-events-none"
                                            initial={{ x: '-130%' }}
                                            animate={{ x: '300%' }}
                                            transition={{ duration: 2.1, repeat: Infinity, ease: 'linear' }}
                                            style={{ background: 'linear-gradient(105deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.0) 20%, rgba(255,255,255,0.45) 50%, rgba(255,255,255,0) 85%)' }}
                                        />
                                    )}
                                    <div className="absolute inset-[1px] rounded-[15px] border border-white/25 dark:border-white/20 pointer-events-none" />
                                    <div className="relative z-10 flex items-center justify-center gap-4">
                                        <div className="w-16 h-16 rounded-xl bg-black/5 dark:bg-black/20 border border-black/5 dark:border-white/10 flex items-center justify-center shrink-0">
                                            <TierIcon className="w-12 h-12 object-contain drop-shadow-sm dark:drop-shadow-md" />
                                        </div>
                                        <div className="min-w-0 leading-tight text-left">
                                            <div className="text-2xl font-black text-white truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">{tier}</div>
                                            <div className="text-xl font-black text-white/95 font-mono mt-1 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">{rank}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 w-full mt-6">
                                <div className="bg-white dark:bg-gray-800/50 p-4 rounded-2xl border border-white/5 text-center">
                                    <span className="text-xs text-blue-300 mb-1 font-bold uppercase tracking-wider">
                                        {t('game.rank')} {t('profile.record')}
                                    </span>
                                    <div className="flex gap-4 items-end justify-center mt-2">
                                        <span className="text-lg font-bold text-blue-400">{wins}W</span>
                                        <span className="text-lg font-bold text-red-400">{losses}L</span>
                                    </div>
                                </div>
                                <div className="bg-white dark:bg-gray-800/50 p-4 rounded-2xl border border-white/5 text-center">
                                    <span className="text-xs text-green-300 mb-1 font-bold uppercase tracking-wider">
                                        {t('game.normal')} {t('profile.record')}
                                    </span>
                                    <div className="flex gap-4 items-end justify-center mt-2">
                                        <span className="text-lg font-bold text-blue-300">{casualWins}W</span>
                                        <span className="text-lg font-bold text-red-300">{casualLosses}L</span>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-white/10 w-full">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 dark:text-gray-400 mb-4 text-center">
                                    {t('profile.statsTitle', '능력치')}
                                </h3>
                                <HexRadar
                                    size={220}
                                    values={statValues}
                                    labels={{
                                        speed: t('profile.stats.speed', '스피드'),
                                        memory: t('profile.stats.memory', '기억력'),
                                        judgment: t('profile.stats.judgment', '판단력'),
                                        calculation: t('profile.stats.calculation', '계산력'),
                                        accuracy: t('profile.stats.accuracy', '정확성'),
                                        observation: t('profile.stats.observation', '관찰력')
                                    }}
                                />
                                <div className="grid grid-cols-3 gap-2 mt-4 text-xs text-slate-500 dark:text-gray-400">
                                    <div className="flex items-center justify-between bg-white dark:bg-gray-800/50 rounded-lg px-2 py-1">
                                        <span>{t('profile.stats.speed', '스피드')}</span>
                                        <span className="text-blue-300 font-bold">{statValues.speed}</span>
                                    </div>
                                    <div className="flex items-center justify-between bg-white dark:bg-gray-800/50 rounded-lg px-2 py-1">
                                        <span>{t('profile.stats.memory', '기억력')}</span>
                                        <span className="text-blue-300 font-bold">{statValues.memory}</span>
                                    </div>
                                    <div className="flex items-center justify-between bg-white dark:bg-gray-800/50 rounded-lg px-2 py-1">
                                        <span>{t('profile.stats.judgment', '판단력')}</span>
                                        <span className="text-blue-300 font-bold">{statValues.judgment}</span>
                                    </div>
                                    <div className="flex items-center justify-between bg-white dark:bg-gray-800/50 rounded-lg px-2 py-1">
                                        <span>{t('profile.stats.calculation', '계산력')}</span>
                                        <span className="text-blue-300 font-bold">{statValues.calculation}</span>
                                    </div>
                                    <div className="flex items-center justify-between bg-white dark:bg-gray-800/50 rounded-lg px-2 py-1">
                                        <span>{t('profile.stats.accuracy', '정확성')}</span>
                                        <span className="text-blue-300 font-bold">{statValues.accuracy}</span>
                                    </div>
                                    <div className="flex items-center justify-between bg-white dark:bg-gray-800/50 rounded-lg px-2 py-1">
                                        <span>{t('profile.stats.observation', '관찰력')}</span>
                                        <span className="text-blue-300 font-bold">{statValues.observation}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default UserProfileModal;
