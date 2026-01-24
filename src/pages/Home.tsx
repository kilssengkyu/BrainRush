import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Settings, User, Trophy, Zap, Loader2, Lock, AlertTriangle, Dumbbell } from 'lucide-react';
import { useMatchmaking } from '../hooks/useMatchmaking';
import { useSound } from '../contexts/SoundContext';
import { useAuth } from '../contexts/AuthContext';
// COUNTRIES import removed as it's no longer needed for direct emoji lookup if we use Flag component
import Flag from '../components/ui/Flag';
import AdModal from '../components/ui/AdModal';
import { supabase } from '../lib/supabaseClient';

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
        <span className="ml-2 text-[10px] text-gray-500 font-mono bg-gray-900/50 px-1 rounded">
            +{timeLeft}
        </span>
    );
};

const Home = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { playSound } = useSound();
    const { user, profile, refreshProfile } = useAuth();

    // Refresh profile on mount to get latest MMR after game
    useEffect(() => {
        refreshProfile();
    }, []);

    // Calculate Level from MMR (Temporary: MMR / 100)
    const level = profile?.mmr ? Math.floor(profile.mmr / 100) : 1;
    const rank = profile?.mmr || 1000;
    const nickname = profile?.nickname || user?.email?.split('@')[0] || t('game.unknownPlayer');
    const avatarUrl = profile?.avatar_url;
    const countryCode = profile?.country;

    // Track selected mode for navigation callback
    const currentMode = useRef('rank');

    // Matchmaking Hook
    const { status, startSearch, cancelSearch, searchRange, elapsedTime, playerId } = useMatchmaking((roomId, opponentId) => {
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

    const handleAdReward = async () => {
        if (!user) return;
        try {
            const { error } = await supabase.rpc('reward_ad_pencils', { user_id: user.id });
            if (!error) {
                // Success
                await refreshProfile();
                // Don't close modal yet, let AdModal show success state
                playSound('level_complete');
            }
        } catch (err) {
            console.error(err);
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
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-800 via-gray-900 to-black pointer-events-none" />

            {/* Authenticated User Header */}
            {user && (
                <motion.div
                    initial={{ opacity: 0, y: -50 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute top-0 left-0 w-full p-4 flex justify-between items-center z-50 pointer-events-none"
                >
                    <div className="flex items-center gap-4 bg-gray-800/80 backdrop-blur-md p-2 pr-6 rounded-full border border-gray-700 shadow-lg pointer-events-auto">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 p-[2px]">
                            <div className="w-full h-full rounded-full bg-gray-900 flex items-center justify-center overflow-hidden">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-6 h-6 text-gray-400" />
                                )}
                            </div>
                        </div>
                        <div>
                            <div className="font-bold text-white leading-none flex items-center gap-2">
                                <div>
                                    <div className="font-bold text-white leading-none flex items-center gap-2">
                                        <Flag code={countryCode} />
                                        {nickname}
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1 flex gap-3">
                                        <span className="text-blue-400">{t('user.level')} {level}</span>
                                        <span className="text-purple-400">{t('user.rank')} {rank}</span>
                                    </div>
                                    {/* Pencil Display */}
                                    <button
                                        onClick={() => setShowAdModal(true)}
                                        className="text-xs text-gray-300 mt-1 flex items-center gap-1 hover:bg-white/10 px-2 py-1 rounded transition-colors"
                                    >
                                        <span>✏️</span>
                                        <span className={profile?.pencils < 1 ? "text-red-400 font-bold" : "text-yellow-400 font-bold"}>
                                            {profile?.pencils ?? 5}
                                        </span>
                                        <span className="text-gray-500">/ 5</span>

                                        {profile?.pencils < 5 && (
                                            <RechargeTimer lastRecharge={profile?.last_recharge_at} />
                                        )}
                                        {profile?.pencils < 5 && (
                                            <div className="ml-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-[10px] text-white animate-pulse">
                                                +
                                            </div>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Ad Modal */}
            <AdModal
                isOpen={showAdModal}
                onClose={() => setShowAdModal(false)}
                onReward={handleAdReward}
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
                                    <p className="text-sm text-blue-400 mb-8 font-mono">Range: ±{searchRange}</p>
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
                        className={`group relative w-full p-6 bg-gray-800/50 backdrop-blur-md border border-gray-700 rounded-2xl overflow-hidden transition-all duration-300 ${user ? 'hover:border-purple-500 hover:shadow-[0_0_20px_rgba(168,85,247,0.5)] active:scale-95 cursor-pointer' : 'opacity-50 grayscale cursor-not-allowed'} flex items-center gap-4 text-left`}
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
                <motion.div variants={itemVariants} className="flex gap-4 w-full justify-between mt-4">
                    <button
                        onMouseEnter={() => playSound('hover')}
                        onClick={() => { playSound('click'); navigate('/settings'); }}
                        className="flex-1 p-4 bg-gray-800/30 rounded-xl border border-gray-700 hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 group cursor-pointer"
                    >
                        <Settings className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
                        <span className="text-gray-300 group-hover:text-white transition-colors">{t('menu.settings')}</span>
                    </button>
                    {user ? (
                        <button
                            onMouseEnter={() => playSound('hover')}
                            onClick={() => { playSound('click'); navigate('/profile'); }}
                            className="flex-1 p-4 bg-gray-800/30 rounded-xl border border-gray-700 hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 group cursor-pointer"
                        >
                            <User className="w-5 h-5 text-blue-400 group-hover:text-white transition-colors" />
                            <span className="text-blue-300 group-hover:text-white transition-colors">{t('menu.profile')}</span>
                        </button>
                    ) : (
                        <button
                            onMouseEnter={() => playSound('hover')}
                            onClick={() => { playSound('click'); navigate('/login'); }}
                            className="flex-1 p-4 bg-gray-800/30 rounded-xl border border-gray-700 hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 group cursor-pointer"
                        >
                            <User className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
                            <span className="text-gray-300 group-hover:text-white transition-colors">{t('menu.login')}</span>
                        </button>
                    )}
                </motion.div>

            </motion.div>
        </div>
    );
};

export default Home;
