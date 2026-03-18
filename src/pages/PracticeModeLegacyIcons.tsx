// Backup of the legacy icon-card practice mode screen.
// Keep this file for quick rollback when final icon assets are ready.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Play, HelpCircle, X } from 'lucide-react';
import { useSound } from '../contexts/SoundContext';
import { useAuth } from '../contexts/AuthContext';
import { useUI } from '../contexts/UIContext';
import { supabase } from '../lib/supabaseClient';
import AdModal from '../components/ui/AdModal';
import { PRACTICE_GUIDES } from '../content/practiceGuides';
import { PRACTICE_GAMES } from '../content/practiceGames';

const PracticeMode = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { playSound } = useSound();
    const { user, profile, refreshProfile } = useAuth();
    const { showToast } = useUI();
    const [loading, setLoading] = useState(false);
    const [showAdModal, setShowAdModal] = useState(false);
    const [guideGameId, setGuideGameId] = useState<string | null>(null);

    const NOTE_MAX = 5;
    const AD_DAILY_LIMIT = 10;
    const today = new Date().toISOString().slice(0, 10);
    const adRewardDay = profile?.practice_ad_reward_day;
    const adRewardCount = profile?.practice_ad_reward_count ?? 0;
    const adRemaining = user
        ? (!adRewardDay || adRewardDay !== today)
            ? AD_DAILY_LIMIT
            : Math.max(0, AD_DAILY_LIMIT - adRewardCount)
        : AD_DAILY_LIMIT;

    useEffect(() => {
        if (user) refreshProfile();
    }, [user, refreshProfile]);

    const handleBack = () => {
        playSound('click');
        navigate('/');
    };

    const handleGameSelect = async (gameId: string) => {
        if (!user) {
            navigate('/login');
            return;
        }

        // Random: pick a random game from the list (excluding RANDOM itself)
        let actualGameId = gameId;
        if (gameId === 'RANDOM') {
            const games = PRACTICE_GAMES.filter(g => g.id !== 'RANDOM');
            actualGameId = games[Math.floor(Math.random() * games.length)].id;
        }

        const notes = profile?.practice_notes ?? 0;
        if (notes < 1) {
            playSound('error');
            setShowAdModal(true);
            return;
        }

        playSound('click');
        setLoading(true);

        try {
            // Call create_practice_session RPC
            const { data: roomId, error } = await supabase
                .rpc('create_practice_session', {
                    p_player_id: user.id,
                    p_game_type: actualGameId
                });

            if (error) {
                if (error.message?.toLowerCase().includes('practice notes')) {
                    playSound('error');
                    setShowAdModal(true);
                    return;
                }
                throw error;
            }

            await refreshProfile();
            navigate(`/game/${roomId}`, {
                state: {
                    roomId,
                    myId: user.id,
                    opponentId: 'practice_solo',
                    mode: 'practice'
                }
            });

        } catch (error: any) {
            console.error('Error starting practice:', error);
            showToast(t('common.error'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleAdReward = async (): Promise<'ok' | 'limit' | 'error'> => {
        if (!user) return 'error';
        if (adRemaining <= 0) {
            showToast(t('ad.limitReached', 'Daily ad limit reached.'), 'info');
            return 'limit';
        }
        try {
            const { error } = await supabase.rpc('reward_ad_practice_notes', { user_id: user.id });
            if (!error) {
                await refreshProfile();
                playSound('level_complete');
                return 'ok';
            }
            if (error?.message?.toLowerCase().includes('daily ad reward limit')) {
                showToast(t('ad.limitReached', 'Daily ad limit reached.'), 'info');
                return 'limit';
            }
            showToast(t('common.error'), 'error');
            return 'error';
        } catch (err) {
            console.error(err);
            showToast(t('common.error'), 'error');
            return 'error';
        }
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.05
            }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 }
    };
    const selectedGuide = useMemo(
        () => (guideGameId ? PRACTICE_GUIDES[guideGameId] : null),
        [guideGameId]
    );
    const selectedGuideGame = useMemo(
        () => (guideGameId ? PRACTICE_GAMES.find((game) => game.id === guideGameId) ?? null : null),
        [guideGameId]
    );

    return (
        <div className={`h-[100dvh] flex flex-col p-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] relative overflow-hidden bg-slate-50 dark:bg-gray-900 text-slate-900 dark:text-white`}>
            {/* Background Effects */}
            <div className={`absolute top-0 left-0 w-full h-full pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white via-slate-100 to-slate-200 dark:from-gray-800 dark:via-gray-900 dark:to-black`} />

            {/* Header */}
            <div className="w-full max-w-5xl mx-auto flex items-center justify-between z-10 mb-8 pt-4">
                <button onClick={handleBack} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                    <ArrowLeft className="w-8 h-8" />
                </button>
                <h1 className="text-3xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500 drop-shadow-lg">
                    {t('menu.practice.title', '연습 모드')}
                </h1>
                {user ? (
                    <button
                        onClick={() => setShowAdModal(true)}
                        className="bg-white dark:bg-gray-800/80 backdrop-blur-md border border-gray-700 rounded-full py-2 px-4 flex items-center gap-3 hover:bg-slate-100 dark:bg-gray-700 transition-all shadow-lg active:scale-95"
                    >
                        <div className="flex flex-col items-end leading-none">
                            <div className="flex items-center gap-1.5">
                                <span className={`text-lg font-black ${profile?.practice_notes < 1 ? 'text-red-400' : 'text-green-300'}`}>
                                    {profile?.practice_notes ?? NOTE_MAX}
                                </span>
                                <span className="text-gray-500 text-xs font-bold">/ {NOTE_MAX}</span>
                            </div>
                            {profile?.practice_notes < NOTE_MAX && profile?.practice_last_recharge_at && (
                                <div className="text-[10px] text-slate-500 dark:text-gray-400 font-mono flex items-center gap-1.5 mt-0.5">
                                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                    <PracticeRechargeTimer lastRecharge={profile.practice_last_recharge_at} />
                                </div>
                            )}
                        </div>
                        <img src="/images/icon/icon_note.png" alt="Practice Note" className="w-5 h-5 object-contain" />
                    </button>
                ) : (
                    <div className="w-10" />
                )}
            </div>

            {/* Content */}
            <div className="flex-1 w-full max-w-5xl mx-auto z-10 overflow-y-auto pb-8 scrollbar-hide">
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
                >
                    {PRACTICE_GAMES.map((game) => (
                        <motion.div
                            key={game.id}
                            variants={itemVariants}
                            className="bg-white dark:bg-gray-800/50 backdrop-blur-sm border border-gray-700 hover:border-green-500 hover:bg-slate-100 dark:bg-gray-700/80 rounded-2xl p-0 flex flex-col items-center justify-between transition-all group relative overflow-hidden"
                        >
                            <button
                                type="button"
                                onClick={() => handleGameSelect(game.id)}
                                onMouseEnter={() => playSound('hover')}
                                disabled={loading}
                                className="w-full h-full flex flex-col items-center justify-between text-left"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-0" />

                                <div className="w-full aspect-[4/3] bg-slate-50 dark:bg-gray-900/50 flex items-center justify-center overflow-hidden z-0">
                                    <div className="w-4/5 h-4/5 group-hover:scale-105 transition-transform duration-300 flex items-center justify-center">
                                        {game.icon || game.defaultIcon}
                                    </div>
                                </div>

                                <div className="text-center p-3 w-full bg-black/20 backdrop-blur-md z-10 border-t border-white/5">
                                    <h3 className="font-bold text-base text-slate-700 dark:text-gray-200 group-hover:text-slate-900 dark:text-white transition-colors truncate w-full">
                                        {t(game.title)}
                                    </h3>
                                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">
                                        {game.type}
                                    </p>
                                </div>

                                <div className="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity transform -translate-y-2 group-hover:translate-y-0 text-green-400 z-20 shadow-lg border border-white/10">
                                    <Play size={16} fill="currentColor" />
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    playSound('click');
                                    setGuideGameId(game.id);
                                }}
                                className="absolute top-2 left-2 z-20 rounded-full bg-black/50 border border-white/10 p-1.5 text-slate-900 dark:text-white/80 hover:text-slate-900 dark:text-white hover:bg-black/70 transition-colors"
                                aria-label={`${t(game.title)} 설명`}
                            >
                                <HelpCircle size={15} />
                            </button>
                        </motion.div>
                    ))}
                </motion.div>
            </div>

            {loading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
                </div>
            )}

            <AdModal
                isOpen={showAdModal}
                onClose={() => setShowAdModal(false)}
                onReward={handleAdReward}
                adRemaining={adRemaining}
                adLimit={AD_DAILY_LIMIT}
                adsRemoved={!!profile?.ads_removed}
                variant="practice_notes"
            />

            {selectedGuide && selectedGuideGame && (
                <div
                    className="absolute inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-end sm:items-center sm:justify-center p-4"
                    onClick={() => setGuideGameId(null)}
                >
                    <div
                        className="w-full max-w-lg max-h-[78vh] overflow-hidden rounded-3xl border border-white/10 bg-slate-50 dark:bg-gray-900 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-3 p-5 border-b border-white/10 bg-slate-50 dark:bg-gray-900/95">
                            <div className="min-w-0">
                                <div className="text-xs uppercase tracking-[0.24em] text-emerald-300/80 mb-1">Practice Guide</div>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white truncate">{t(selectedGuideGame.title)}</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setGuideGameId(null)}
                                className="rounded-full p-2 text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:text-white hover:bg-white/10 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="overflow-y-auto max-h-[calc(78vh-5rem)] p-5 space-y-5">
                            <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                                <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-300 mb-2">한눈에 보기</div>
                                <p className="text-sm leading-relaxed text-slate-700 dark:text-gray-100">{selectedGuide.summary}</p>
                            </section>

                            <section className="space-y-2">
                                <div className="text-sm font-semibold text-blue-600 dark:text-blue-300">목표</div>
                                <p className="text-sm leading-relaxed text-slate-600 dark:text-gray-300">{selectedGuide.objective}</p>
                            </section>

                            <section className="space-y-3">
                                <div className="text-sm font-semibold text-purple-600 dark:text-purple-300">플레이 방법</div>
                                <div className="space-y-2">
                                    {selectedGuide.howTo.map((step: string, index: number) => (
                                        <div key={`${selectedGuideGame.id}-${index}`} className="flex items-start gap-3 rounded-2xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-white/5 p-3">
                                            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-xs font-black text-purple-600 dark:text-purple-200">
                                                {index + 1}
                                            </div>
                                            <p className="text-sm leading-relaxed text-slate-700 dark:text-gray-200">{step}</p>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
                                <div className="text-sm font-semibold text-amber-600 dark:text-amber-300 mb-2">팁</div>
                                <p className="text-sm leading-relaxed text-slate-700 dark:text-gray-100">{selectedGuide.tip}</p>
                            </section>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PracticeMode;

const PracticeRechargeTimer = ({ lastRecharge }: { lastRecharge: string }) => {
    const [timeLeft, setTimeLeft] = useState<string>('');

    useEffect(() => {
        const calculateTime = () => {
            if (!lastRecharge) return;
            const last = new Date(lastRecharge).getTime();
            const now = new Date().getTime();
            const diff = now - last;
            const thirtyMinutes = 30 * 60 * 1000;
            const remaining = thirtyMinutes - diff;

            if (remaining <= 0) {
                setTimeLeft('00:00');
            } else {
                const m = Math.floor(remaining / 60000);
                const s = Math.floor((remaining % 60000) / 1000);
                setTimeLeft(`${m}:${s.toString().padStart(2, '0')}`);
            }
        };

        calculateTime();
        const interval = setInterval(calculateTime, 1000);
        return () => clearInterval(interval);
    }, [lastRecharge]);

    return (
        <span className="ml-0 text-[10px] text-slate-500 dark:text-gray-400 font-mono">
            +{timeLeft}
        </span>
    );
};
