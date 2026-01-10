import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Settings, User, Trophy, Zap, Users, Loader2, Lock } from 'lucide-react';
import { useMatchmaking } from '../hooks/useMatchmaking';
import { useSound } from '../contexts/SoundContext';
import { useAuth } from '../contexts/AuthContext';

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
    const nickname = profile?.nickname || user?.email?.split('@')[0] || 'Unknown';
    const avatarUrl = profile?.avatar_url;

    // Track selected mode for navigation callback
    const currentMode = useRef('rank');

    // Matchmaking Hook
    const { status, startSearch, cancelSearch, searchRange, playerId } = useMatchmaking((roomId, opponentId) => {
        playSound('match_found');
        navigate('/game', { state: { roomId, myId: playerId, opponentId, mode: currentMode.current } });
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

    const handleModeSelect = async (mode: string) => {
        playSound('click');
        currentMode.current = mode;

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
                            <div className="font-bold text-white leading-none">{nickname}</div>
                            <div className="text-xs text-gray-400 mt-1 flex gap-3">
                                <span className="text-blue-400">{t('user.level')} {level}</span>
                                <span className="text-purple-400">{t('user.rank')} {rank}</span>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Matchmaking Overlay */}
            <AnimatePresence>
                {(status === 'searching' || status === 'matched') && (
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
                                    <p className="text-sm text-blue-400 mb-8 font-mono">Range: ±{searchRange}</p>
                                    <button
                                        onClick={() => { playSound('click'); cancelSearch(); }}
                                        className="px-6 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 font-bold transition-colors"
                                    >
                                        {t('common.cancel')}
                                    </button>
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

                    {/* Friendly Mode */}
                    <button
                        onMouseEnter={() => playSound('hover')}
                        onClick={() => handleModeSelect('friendly')}
                        className={`group relative w-full p-6 bg-gray-800/50 backdrop-blur-md border border-gray-700 rounded-2xl overflow-hidden transition-all duration-300 ${user ? 'hover:border-green-500 hover:shadow-[0_0_20px_rgba(34,197,94,0.5)] active:scale-95 cursor-pointer' : 'opacity-50 grayscale cursor-not-allowed'} flex items-center gap-4 text-left`}
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-green-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        <div className="p-3 rounded-full bg-green-500/20 group-hover:bg-green-500/30 transition-colors">
                            <Users className="w-8 h-8 text-green-400" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-bold group-hover:text-green-400 transition-colors">{t('menu.friendly.title')}</h3>
                            <p className="text-gray-500 text-sm mt-1">{t('menu.friendly.subtitle')}</p>
                        </div>

                        {!user && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                                <Lock className="w-8 h-8 text-white/80" />
                            </div>
                        )}
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
