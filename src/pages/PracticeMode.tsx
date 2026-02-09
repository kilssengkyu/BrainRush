import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Play, Zap, Brain, Hash, MousePointer2, Star, Ghost, Route, CircleDot, EyeOff, BookOpen } from 'lucide-react';
import { useSound } from '../contexts/SoundContext';
import { useAuth } from '../contexts/AuthContext';
import { useUI } from '../contexts/UIContext';
import { supabase } from '../lib/supabaseClient';
import AdModal from '../components/ui/AdModal';

// Minigame Metadata
const MINIGAMES = [
    { id: 'RPS', title: 'rps.title', icon: <img src="/icons/rps.png" alt="RPS" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <MousePointer2 className="w-8 h-8 text-yellow-400" />, type: 'speed' },
    { id: 'NUMBER', title: 'number.title', icon: <img src="/icons/number_asc.png" alt="Number Asc" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <Hash className="w-8 h-8 text-blue-400" />, type: 'speed' },
    { id: 'NUMBER_DESC', title: 'number.titleDesc', icon: <img src="/icons/number_desc.png" alt="Number Desc" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <Hash className="w-8 h-8 text-red-400" />, type: 'speed' },
    { id: 'MATH', title: 'math.title', icon: <img src="/icons/math.png" alt="Math" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <Brain className="w-8 h-8 text-purple-400" />, type: 'brain' },
    { id: 'TEN', title: 'ten.title', icon: <img src="/icons/make_ten.png" alt="Make Ten" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <Hash className="w-8 h-8 text-green-400" />, type: 'brain' },
    { id: 'COLOR', title: 'color.title', icon: <img src="/icons/color_match.png" alt="Color" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <Zap className="w-8 h-8 text-pink-400" />, type: 'speed' },
    { id: 'MEMORY', title: 'memory.title', icon: <img src="/icons/memory.png" alt="Memory" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <Brain className="w-8 h-8 text-orange-400" />, type: 'brain' },
    { id: 'SEQUENCE', title: 'sequence.title', icon: <img src="/icons/sequence.png" alt="Sequence" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <Hash className="w-8 h-8 text-cyan-400" />, type: 'brain' },
    { id: 'SEQUENCE_NORMAL', title: 'sequence.titleNormal', icon: <img src="/icons/sequence.png" alt="Sequence Normal" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <Hash className="w-8 h-8 text-blue-300" />, type: 'brain' },
    { id: 'LARGEST', title: 'largest.title', icon: <img src="/icons/find_largest.png" alt="Largest" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <Hash className="w-8 h-8 text-indigo-400" />, type: 'speed' },
    { id: 'PAIR', title: 'pair.title', icon: <img src="/icons/find_pair.png" alt="Pair" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <Brain className="w-8 h-8 text-teal-400" />, type: 'brain' },
    { id: 'UPDOWN', title: 'updown.title', icon: <img src="/icons/up_down.png" alt="Up Down" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <Hash className="w-8 h-8 text-lime-400" />, type: 'brain' },
    { id: 'SLIDER', title: 'slider.title', icon: <img src="/icons/slider.png" alt="Slider" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <Hash className="w-8 h-8 text-amber-400" />, type: 'brain' },
    { id: 'ARROW', title: 'arrow.title', icon: <img src="/icons/arrow.png" alt="Arrow" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <MousePointer2 className="w-8 h-8 text-sky-400" />, type: 'speed' },
    { id: 'BLANK', title: 'fillBlanks.title', icon: <img src="/icons/fill_blank.png" alt="Blank" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <Brain className="w-8 h-8 text-teal-300" />, type: 'brain' },
    { id: 'OPERATOR', title: 'findOperator.title', icon: <img src="/icons/operator.png" alt="Operator" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <Brain className="w-8 h-8 text-indigo-300" />, type: 'brain' },
    { id: 'LADDER', title: 'ladder.title', icon: <img src="/icons/ladder.png" alt="Ladder" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <Brain className="w-8 h-8 text-yellow-300" />, type: 'brain' },
    { id: 'PATH', title: 'path.title', icon: <img src="/icons/path.png" alt="Path" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <Route className="w-8 h-8 text-emerald-300" />, type: 'brain' },
    { id: 'BLIND_PATH', title: 'blindPath.title', icon: <img src="/icons/blind_path.png" alt="Blind Path" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <EyeOff className="w-8 h-8 text-rose-300" />, type: 'brain' },
    { id: 'BALLS', title: 'balls.title', icon: <img src="/icons/balls.png" alt="Balls" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <CircleDot className="w-8 h-8 text-sky-300" />, type: 'brain' },
    { id: 'CATCH_COLOR', title: 'catchColor.title', icon: <img src="/icons/catch_color.png" alt="Catch Color" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <CircleDot className="w-8 h-8 text-blue-300" />, type: 'speed' },
    { id: 'TAP_COLOR', title: 'tapTheColor.title', icon: <img src="/icons/tap_color.png" alt="Tap Color" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <Brain className="w-8 h-8 text-pink-300" />, type: 'brain' },
    { id: 'AIM', title: 'aim.title', icon: <img src="/icons/aim.png" alt="Aim" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <MousePointer2 className="w-8 h-8 text-red-500" />, type: 'speed' },
    { id: 'MOST_COLOR', title: 'mostColor.title', icon: <img src="/icons/most_color.png" alt="Most Color" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <Zap className="w-8 h-8 text-yellow-500" />, type: 'speed' },
    { id: 'SORTING', title: 'sorting.title', icon: <img src="/icons/sorting.png" alt="Sorting" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <Star className="w-8 h-8 text-purple-500" />, type: 'brain' },
    { id: 'SPY', title: 'spy.title', icon: <img src="/icons/spy.png" alt="Spy" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <Ghost className="w-8 h-8 text-gray-500" />, type: 'brain' },
    { id: 'TIMING_BAR', title: 'timingBar.title', icon: <img src="/icons/timing.png" alt="Timing" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <BookOpen className="w-8 h-8 text-emerald-400" />, type: 'speed' },
];

const PracticeMode = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { playSound } = useSound();
    const { user, profile, refreshProfile } = useAuth();
    const { showToast } = useUI();
    const [loading, setLoading] = useState(false);
    const [showAdModal, setShowAdModal] = useState(false);

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
            showToast(t('auth.loginRequired'), 'error');
            return;
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
                    p_game_type: gameId
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

    return (
        <div className="h-[100dvh] bg-gray-900 text-white flex flex-col p-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-800 via-gray-900 to-black pointer-events-none" />

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
                        className="bg-gray-800/80 backdrop-blur-md border border-gray-700 rounded-full py-2 px-4 flex items-center gap-3 hover:bg-gray-700 transition-all shadow-lg active:scale-95"
                    >
                        <div className="flex flex-col items-end leading-none">
                            <div className="flex items-center gap-1.5">
                                <span className={`text-lg font-black ${profile?.practice_notes < 1 ? 'text-red-400' : 'text-green-300'}`}>
                                    {profile?.practice_notes ?? NOTE_MAX}
                                </span>
                                <span className="text-gray-500 text-xs font-bold">/ {NOTE_MAX}</span>
                            </div>
                            {profile?.practice_notes < NOTE_MAX && profile?.practice_last_recharge_at && (
                                <div className="text-[10px] text-gray-400 font-mono flex items-center gap-1.5 mt-0.5">
                                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                    <PracticeRechargeTimer lastRecharge={profile.practice_last_recharge_at} />
                                </div>
                            )}
                        </div>
                        <BookOpen className="w-5 h-5 text-green-300" />
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
                    {MINIGAMES.map((game) => (
                        <motion.button
                            key={game.id}
                            variants={itemVariants}
                            onClick={() => handleGameSelect(game.id)}
                            onMouseEnter={() => playSound('hover')}
                            disabled={loading}
                            className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 hover:border-green-500 hover:bg-gray-700/80 rounded-2xl p-6 flex flex-col items-center gap-4 transition-all group relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                            <div className="p-4 rounded-full bg-gray-900/50 group-hover:scale-110 transition-transform duration-300">
                                {game.icon || game.defaultIcon}
                            </div>

                            <div className="text-center">
                                <h3 className="font-bold text-lg text-gray-200 group-hover:text-white transition-colors">
                                    {t(game.title)}
                                </h3>
                                <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">
                                    {game.type}
                                </p>
                            </div>

                            <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0 text-green-400">
                                <Play size={20} fill="currentColor" />
                            </div>
                        </motion.button>
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
        <span className="ml-0 text-[10px] text-gray-400 font-mono">
            +{timeLeft}
        </span>
    );
};
