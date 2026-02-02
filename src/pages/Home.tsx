import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Settings, User, Trophy, Zap, Loader2, Lock, AlertTriangle, Dumbbell, ShoppingBag } from 'lucide-react';
import { useMatchmaking } from '../hooks/useMatchmaking';
import { useSound } from '../contexts/SoundContext';
import { useAuth } from '../contexts/AuthContext';
import { useUI } from '../contexts/UIContext';
// COUNTRIES import removed as it's no longer needed for direct emoji lookup if we use Flag component
import Flag from '../components/ui/Flag';
import AdModal from '../components/ui/AdModal';
import LeaderboardModal from '../components/ui/LeaderboardModal';
import { supabase } from '../lib/supabaseClient';
import { getTierFromMMR, getTierColor, getTierIcon } from '../utils/rankUtils';
import LevelBadge from '../components/ui/LevelBadge';
import { getLevelFromXp } from '../utils/levelUtils';

// Simple Timer Component
const RechargeTimer = ({ lastRecharge }: { lastRecharge: string }) => {
    const [timeLeft, setTimeLeft] = useState<string>('');

    useEffect(() => {
        const calculateTime = () => {
            if (!lastRecharge) return;
            const last = new Date(lastRecharge).getTime();
            const now = new Date().getTime();
            const diff = now - last;
            const tenMinutes = 10 * 60 * 1000;

            // Time passed since last recharge
            // If we have < 5 pencils, the next one comes at (last_recharge + 10min)
            // Wait, if multiple intervals passed but not synced? 
            // The DB syncs on load. We assume 'lastRecharge' is the start of the CURRENT 10m cycle.

            const remaining = tenMinutes - diff;

            if (remaining <= 0) {
                setTimeLeft('00:00'); // Ready to sync?
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
        <span className="ml-0 text-[10px] text-gray-400 font-mono">
            +{timeLeft}
        </span>
    );
};

const Home = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { playSound } = useSound();
    const { user, profile, refreshProfile, loading: authLoading } = useAuth();
    const { showToast } = useUI();
    const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
    const [unreadChatCount, setUnreadChatCount] = useState(0);

    // Refresh profile on mount to get latest MMR after game
    useEffect(() => {
        refreshProfile();
    }, []);

    useEffect(() => {
        if (!user) {
            setPendingRequestsCount(0);
            setUnreadChatCount(0);
            return;
        }

        const fetchPendingRequestsCount = async () => {
            const { count, error } = await supabase
                .from('friendships')
                .select('id', { count: 'exact', head: true })
                .eq('friend_id', user.id)
                .eq('status', 'pending');
            if (!error) setPendingRequestsCount(count || 0);
        };

        const fetchUnreadChatCount = async () => {
            const { count, error } = await supabase
                .from('chat_messages')
                .select('id', { count: 'exact', head: true })
                .eq('receiver_id', user.id)
                .eq('is_read', false);
            if (!error) setUnreadChatCount(count || 0);
        };

        fetchPendingRequestsCount();
        fetchUnreadChatCount();

        const friendRequestChannel = supabase
            .channel(`home_friend_requests_${user.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'friendships',
                filter: `friend_id=eq.${user.id}`
            }, () => {
                fetchPendingRequestsCount();
            })
            .subscribe();

        const unreadChatChannel = supabase
            .channel(`home_unread_chats_${user.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'chat_messages',
                filter: `receiver_id=eq.${user.id}`
            }, () => {
                fetchUnreadChatCount();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(friendRequestChannel);
            supabase.removeChannel(unreadChatChannel);
        };
    }, [user]);

    // Calculate Level from MMR (Temporary: MMR / 100)
    // const level = profile?.mmr ? Math.floor(profile.mmr / 100) : 1; 
    // Wait, let's just remove it if really unused. But wait, did I remove the usage in the UI? 
    // Yes, in the last refactor I swapped the Profile UI and might have removed the level display.
    // Let's check the view first to be safe, but user says it is unused.
    // Actually, I should remove the line.
    const rank = profile?.mmr || 1000;
    const tier = getTierFromMMR(rank);
    const tierColor = getTierColor(tier);
    const TierIcon = getTierIcon(tier);
    const level = typeof profile?.level === 'number'
        ? profile.level
        : typeof profile?.xp === 'number'
            ? getLevelFromXp(profile.xp)
            : 1;
    const requiredRankLevel = 5;
    const isRankUnlocked = level >= requiredRankLevel;
    const canPlayRank = Boolean(user) && isRankUnlocked;
    const nickname = profile?.nickname || user?.email?.split('@')[0] || t('game.unknownPlayer');
    const avatarUrl = profile?.avatar_url;
    const countryCode = profile?.country;
    const hasSocialNotifications = pendingRequestsCount > 0 || unreadChatCount > 0;
    const AD_DAILY_LIMIT = 5;
    const today = new Date().toISOString().slice(0, 10);
    const adRewardDay = profile?.ad_reward_day;
    const adRewardCount = profile?.ad_reward_count ?? 0;
    const adRemaining = user
        ? (!adRewardDay || adRewardDay !== today)
            ? AD_DAILY_LIMIT
            : Math.max(0, AD_DAILY_LIMIT - adRewardCount)
        : AD_DAILY_LIMIT;

    // Track selected mode for navigation callback
    const currentMode = useRef('rank');

    // Matchmaking Hook
    const { status, startSearch, cancelSearch, elapsedTime, playerId } = useMatchmaking((roomId, opponentId) => {
        playSound('match_found');
        navigate(`/game/${roomId}`, { state: { roomId, myId: playerId, opponentId, mode: currentMode.current } });
    });

    // Animation variants
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.2,
                delayChildren: 0.3
            }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 }
    };

    const [showAdModal, setShowAdModal] = useState(false);
    const [showLeaderboard, setShowLeaderboard] = useState(false);

    const handleAdReward = async (): Promise<'ok' | 'limit' | 'error'> => {
        if (!user) return 'error';
        if (adRemaining <= 0) {
            showToast(t('ad.limitReached', 'Daily ad limit reached.'), 'info');
            return 'limit';
        }
        try {
            const { error } = await supabase.rpc('reward_ad_pencils', { user_id: user.id });
            if (!error) {
                // Success
                await refreshProfile();
                // Don't close modal yet, let AdModal show success state
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

    const handleModeSelect = async (mode: string) => {
        playSound('click');
        currentMode.current = mode;

        // Pencil Check Logic
        // Only for Rank/Online modes? Or all modes?
        // User requested: "Need a pencil to play game".
        // Let's enforce for 'rank' and 'normal' (standard online).
        // Practice might be free? User said "5 pencils given, use 1 per game". Usually implies main loops.
        // Let's apply to Rank/Normal. Free/Practice is debatable, usually practice is free or costs less.
        // Let's make Practice FREE for now as it's separate.

        if (mode === 'rank' || mode === 'normal') {
            if (!user) {
                if (mode === 'rank') {
                    navigate('/login');
                    return;
                }
                // Guest playing Normal? Logic for Guest Pencils?
                // For now, guest has no persistent pencils. Infinite or 0?
                // Let's assume Guests have infinite or we skip check.
                // Assuming Authentication is main.
            } else {
                // Authenticated: Check Pencils
                const pencils = profile?.pencils ?? 0;
                if (pencils < 1) {
                    // Not enough
                    playSound('error');
                    // Show Ad Modal prompting for recharge
                    setShowAdModal(true);
                    return;
                }
            }
        }

        if (mode === 'rank') {
            if (!user) {
                navigate('/login');
                return;
            }
            if (!isRankUnlocked) {
                playSound('error');
                showToast(t('matchmaking.rankLevelRequired', { level: requiredRankLevel }), 'info');
                return;
            }
            startSearch('rank');
        } else if (mode === 'normal') {
            // "Normal" mode supports both Guests and Logged-in users.
            // Hybrid logic handles the rest in useMatchmaking.
            startSearch('normal');
        } else {
            console.log(`Selected mode: ${mode} `);
            navigate('/game', { state: { mode } });
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 pt-[calc(env(safe-area-inset-top)+1rem)] relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-800 via-gray-900 to-black pointer-events-none" />

            {/* Authenticated User Header (Top Left - Profile) */}
            {user && (
                <motion.div
                    initial={{ opacity: 0, y: -50 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute top-4 left-4 z-50 flex items-center"
                >
                    <div className="flex items-center gap-4 bg-gray-800/80 backdrop-blur-md p-2 pr-6 rounded-full border border-gray-700 shadow-lg cursor-pointer hover:bg-gray-800 transition-colors" onClick={() => navigate('/profile')}>
                        <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 p-[2px]">
                            <div className="w-full h-full rounded-full bg-gray-900 flex items-center justify-center overflow-hidden">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-7 h-7 text-gray-400" />
                                )}
                            </div>
                            <LevelBadge level={level} size="sm" className="absolute -bottom-1 -right-1 ring-2 ring-gray-900" />
                            {hasSocialNotifications && (
                                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-gray-900" aria-hidden="true"></span>
                            )}
                        </div>
                        <div>
                            <div className="font-bold text-white text-lg leading-none flex items-center gap-2">
                                <Flag code={countryCode} />
                                {nickname}
                            </div>
                            <div className="mt-1.5 flex gap-3 items-center">
                                {/* Tier Badge - Larger Size */}
                                <div className={`px-2.5 py-1 rounded-lg text-sm font-black bg-gradient-to-r ${tierColor} text-black flex items-center gap-1.5 shadow-md transform hover:scale-105 transition-transform`}>
                                    <TierIcon className="w-4 h-4" />
                                    <span>{tier}</span>
                                    <span className="opacity-60">|</span>
                                    <span className="font-mono">{rank}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Pencil Display (Top Right) */}
            {user && (
                <div className="absolute top-4 right-4 z-50">
                    <button
                        onClick={() => setShowAdModal(true)}
                        className="bg-gray-800/80 backdrop-blur-md border border-gray-700 rounded-full py-2 px-5 flex items-center gap-3 hover:bg-gray-700 transition-all shadow-lg active:scale-95"
                    >
                        <div className="flex flex-col items-end leading-none">
                            <div className="flex items-center gap-1.5">
                                <span className={`text-xl font-black ${profile?.pencils < 1 ? "text-red-400" : "text-yellow-400"}`}>
                                    {profile?.pencils ?? 5}
                                </span>
                                <span className="text-gray-500 text-sm font-bold">/ 5</span>
                            </div>
                            {profile?.pencils < 5 && (
                                <div className="text-xs text-gray-400 font-mono flex items-center gap-1.5 mt-0.5">
                                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                    <RechargeTimer lastRecharge={profile?.last_recharge_at} />
                                </div>
                            )}
                        </div>
                        <img
                            src="/images/icon/icon_pen.png"
                            alt="Pencil"
                            className="w-6 h-6 object-contain"
                        />
                    </button>
                </div>
            )}

            {/* Auth Loading Overlay */}
            {authLoading && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
                    <div className="flex items-center gap-3 bg-gray-900/80 border border-white/10 rounded-2xl px-5 py-4 shadow-xl">
                        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                        <span className="text-sm font-bold text-gray-200">{t('common.loading')}</span>
                    </div>
                </div>
            )}

            {/* Modals */}
            <AdModal
                isOpen={showAdModal}
                onClose={() => setShowAdModal(false)}
                onReward={handleAdReward}
                adRemaining={adRemaining}
                adLimit={AD_DAILY_LIMIT}
                adsRemoved={!!profile?.ads_removed}
            />

            <LeaderboardModal
                isOpen={showLeaderboard}
                onClose={() => setShowLeaderboard(false)}
            />

            {/* Matchmaking Overlay */}
            <AnimatePresence>
                {(status === 'searching' || status === 'matched' || status === 'timeout') && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-auto"
                    >
                        <motion.div
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            className="bg-gray-800 p-8 rounded-3xl border border-blue-500/50 flex flex-col items-center text-center shadow-2xl min-w-[300px]"
                        >
                            {status === 'searching' ? (
                                <>
                                    <Loader2 className="w-16 h-16 text-blue-500 animate-spin mb-6" />
                                    <h2 className="text-3xl font-bold mb-2">{t('matchmaking.searching')}</h2>
                                    <p className="text-gray-400 mb-2">{t('matchmaking.description')}</p>
                                    <p className="text-2xl font-mono text-white mb-2">
                                        {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}
                                    </p>
                                    <button
                                        onClick={() => { playSound('click'); cancelSearch(); }}
                                        className="px-6 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 font-bold transition-colors"
                                    >
                                        {t('common.cancel')}
                                    </button>
                                </>
                            ) : status === 'timeout' ? (
                                <>
                                    <AlertTriangle className="w-16 h-16 text-red-500 mb-6" />
                                    <h2 className="text-2xl font-bold mb-2 text-white">{t('matchmaking.timeout')}</h2>
                                    <p className="text-gray-400 mb-8">{t('matchmaking.timeoutDesc')}</p>
                                    <div className="flex gap-4">
                                        <button
                                            onClick={() => { playSound('click'); cancelSearch(); }}
                                            className="px-6 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 font-bold transition-colors"
                                        >
                                            {t('common.close')}
                                        </button>
                                        <button
                                            onClick={() => { playSound('click'); cancelSearch(); handleModeSelect(currentMode.current); }}
                                            className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold transition-colors"
                                        >
                                            {t('common.retry')}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <Trophy className="w-16 h-16 text-yellow-400 mb-6 animate-bounce" />
                                    <h2 className="text-3xl font-bold mb-2 text-white">{t('matchmaking.found')}</h2>
                                    <p className="text-gray-400 mb-0">{t('matchmaking.entering')}</p>
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Content */}
            <motion.div
                className="z-10 w-full max-w-md flex flex-col items-center gap-8"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                {/* Title */}
                <motion.div variants={itemVariants} className="text-center">
                    <h1 className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 drop-shadow-lg">
                        {t('app.title')}
                    </h1>
                    <p className="text-gray-400 mt-2 text-sm uppercase tracking-widest">{t('app.subtitle')}</p>
                </motion.div>

                {/* Game Modes */}
                <motion.div variants={itemVariants} className="w-full flex flex-col gap-4">

                    {/* Normal Mode */}
                    <button
                        onMouseEnter={() => playSound('hover')}
                        onClick={() => handleModeSelect('normal')}
                        className={`group relative w-full p-6 bg-gray-800/50 backdrop-blur-md border border-gray-700 rounded-2xl overflow-hidden transition-all duration-300 hover:border-blue-500 hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] active:scale-95 cursor-pointer flex items-center gap-4 text-left`}
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        <div className="p-3 rounded-full bg-blue-500/20 group-hover:bg-blue-500/30 transition-colors">
                            <Zap className="w-8 h-8 text-blue-400" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-bold group-hover:text-blue-400 transition-colors">{t('menu.normal.title')}</h3>
                            <p className="text-gray-500 text-sm mt-1">{t('menu.normal.subtitle')}</p>
                        </div>
                    </button>

                    {/* Rank Mode */}
                    <button
                        onMouseEnter={() => playSound('hover')}
                        onClick={() => handleModeSelect('rank')}
                        className={`group relative w-full p-6 bg-gray-800/50 backdrop-blur-md border border-gray-700 rounded-2xl overflow-hidden transition-all duration-300 ${canPlayRank ? 'hover:border-purple-500 hover:shadow-[0_0_20px_rgba(168,85,247,0.5)] active:scale-95 cursor-pointer' : 'opacity-50 grayscale cursor-not-allowed'} flex items-center gap-4 text-left`}
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        <div className="p-3 rounded-full bg-purple-500/20 group-hover:bg-purple-500/30 transition-colors">
                            <Trophy className="w-8 h-8 text-purple-400" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-bold group-hover:text-purple-400 transition-colors">{t('menu.rank.title')}</h3>
                            <p className="text-gray-500 text-sm mt-1">{t('menu.rank.subtitle')}</p>
                        </div>

                        {!user && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                                <Lock className="w-8 h-8 text-white/80" />
                            </div>
                        )}
                    </button>

                    {/* Practice Mode */}
                    <button
                        onMouseEnter={() => playSound('hover')}
                        onClick={() => { playSound('click'); navigate('/practice'); }}
                        className={`group relative w-full p-6 bg-gray-800/50 backdrop-blur-md border border-gray-700 rounded-2xl overflow-hidden transition-all duration-300 hover:border-green-500 hover:shadow-[0_0_20px_rgba(34,197,94,0.5)] active:scale-95 cursor-pointer flex items-center gap-4 text-left`}
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-green-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        <div className="p-3 rounded-full bg-green-500/20 group-hover:bg-green-500/30 transition-colors">
                            <Dumbbell className="w-8 h-8 text-green-400" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-bold group-hover:text-green-400 transition-colors">{t('menu.practice.title')}</h3>
                            <p className="text-gray-500 text-sm mt-1">{t('menu.practice.subtitle')}</p>
                        </div>
                    </button>
                </motion.div>

                {/* Footer Buttons */}
                <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4 w-full mt-4">
                    <button
                        onMouseEnter={() => playSound('hover')}
                        onClick={() => { playSound('click'); setShowLeaderboard(true); }}
                        className="p-4 bg-gray-800/30 rounded-xl border border-gray-700 hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 group cursor-pointer"
                    >
                        <Trophy className="w-5 h-5 text-yellow-500 group-hover:text-yellow-400 transition-colors" />
                        <span className="text-gray-300 group-hover:text-white transition-colors">{t('leaderboard.button', 'Ranking')}</span>
                    </button>
                    <button
                        onMouseEnter={() => playSound('hover')}
                        onClick={() => { playSound('click'); navigate('/shop'); }}
                        className="p-4 bg-gray-800/30 rounded-xl border border-gray-700 hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 group cursor-pointer"
                    >
                        <ShoppingBag className="w-5 h-5 text-cyan-400 group-hover:text-white transition-colors" />
                        <span className="text-gray-300 group-hover:text-white transition-colors">{t('menu.shop', 'Shop')}</span>
                    </button>
                    <button
                        onMouseEnter={() => playSound('hover')}
                        onClick={() => { playSound('click'); navigate('/settings'); }}
                        className="p-4 bg-gray-800/30 rounded-xl border border-gray-700 hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 group cursor-pointer"
                    >
                        <Settings className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
                        <span className="text-gray-300 group-hover:text-white transition-colors">{t('menu.settings')}</span>
                    </button>
                    {user ? (
                        <button
                            onMouseEnter={() => playSound('hover')}
                            onClick={() => { playSound('click'); navigate('/profile'); }}
                            className="p-4 bg-gray-800/30 rounded-xl border border-gray-700 hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 group cursor-pointer"
                        >
                            <span className="relative">
                                <User className="w-5 h-5 text-blue-400 group-hover:text-white transition-colors" />
                                {hasSocialNotifications && (
                                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-gray-900" aria-hidden="true"></span>
                                )}
                            </span>
                            <span className="text-blue-300 group-hover:text-white transition-colors">{t('menu.profile')}</span>
                        </button>
                    ) : (
                        <button
                            onMouseEnter={() => playSound('hover')}
                            onClick={() => { playSound('click'); navigate('/login'); }}
                            className="p-4 bg-gray-800/30 rounded-xl border border-gray-700 hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 group cursor-pointer"
                        >
                            <User className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
                            <span className="text-gray-300 group-hover:text-white transition-colors">{t('menu.login')}</span>
                        </button>
                    )}
                </motion.div>

            </motion.div>
        </div >
    );
};

export default Home;
