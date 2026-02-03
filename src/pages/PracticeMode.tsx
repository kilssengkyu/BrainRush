import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Play, Zap, Brain, Hash, MousePointer2, Star, Ghost, Route, CircleDot, EyeOff } from 'lucide-react';
import { useSound } from '../contexts/SoundContext';
import { useAuth } from '../contexts/AuthContext';
import { useUI } from '../contexts/UIContext';
import { supabase } from '../lib/supabaseClient';

// Minigame Metadata
const MINIGAMES = [
    { id: 'RPS', title: 'rps.title', icon: <img src="/icons/rps.png" alt="RPS" className="w-8 h-8" onError={(e) => e.currentTarget.style.display = 'none'} />, defaultIcon: <MousePointer2 className="w-8 h-8 text-yellow-400" />, type: 'speed' },
    { id: 'NUMBER', title: 'number.title', icon: null, defaultIcon: <Hash className="w-8 h-8 text-blue-400" />, type: 'speed' },
    { id: 'NUMBER_DESC', title: 'number.titleDesc', icon: null, defaultIcon: <Hash className="w-8 h-8 text-red-400" />, type: 'speed' },
    { id: 'MATH', title: 'math.title', icon: null, defaultIcon: <Brain className="w-8 h-8 text-purple-400" />, type: 'brain' },
    { id: 'TEN', title: 'ten.title', icon: null, defaultIcon: <Hash className="w-8 h-8 text-green-400" />, type: 'brain' },
    { id: 'COLOR', title: 'color.title', icon: null, defaultIcon: <Zap className="w-8 h-8 text-pink-400" />, type: 'speed' },
    { id: 'MEMORY', title: 'memory.title', icon: null, defaultIcon: <Brain className="w-8 h-8 text-orange-400" />, type: 'brain' },
    { id: 'SEQUENCE', title: 'sequence.title', icon: null, defaultIcon: <Hash className="w-8 h-8 text-cyan-400" />, type: 'brain' },
    { id: 'SEQUENCE_NORMAL', title: 'sequence.titleNormal', icon: null, defaultIcon: <Hash className="w-8 h-8 text-blue-300" />, type: 'brain' },
    { id: 'LARGEST', title: 'largest.title', icon: null, defaultIcon: <Hash className="w-8 h-8 text-indigo-400" />, type: 'speed' },
    { id: 'PAIR', title: 'pair.title', icon: null, defaultIcon: <Brain className="w-8 h-8 text-teal-400" />, type: 'brain' },
    { id: 'UPDOWN', title: 'updown.title', icon: null, defaultIcon: <Hash className="w-8 h-8 text-lime-400" />, type: 'brain' },
    { id: 'SLIDER', title: 'slider.title', icon: null, defaultIcon: <Hash className="w-8 h-8 text-amber-400" />, type: 'brain' },
    { id: 'ARROW', title: 'arrow.title', icon: null, defaultIcon: <MousePointer2 className="w-8 h-8 text-sky-400" />, type: 'speed' },
    { id: 'BLANK', title: 'fillBlanks.title', icon: null, defaultIcon: <Brain className="w-8 h-8 text-teal-300" />, type: 'brain' },
    { id: 'OPERATOR', title: 'findOperator.title', icon: null, defaultIcon: <Brain className="w-8 h-8 text-indigo-300" />, type: 'brain' },
    { id: 'LADDER', title: 'ladder.title', icon: null, defaultIcon: <Brain className="w-8 h-8 text-yellow-300" />, type: 'brain' },
    { id: 'PATH', title: 'path.title', icon: null, defaultIcon: <Route className="w-8 h-8 text-emerald-300" />, type: 'brain' },
    { id: 'BLIND_PATH', title: 'blindPath.title', icon: null, defaultIcon: <EyeOff className="w-8 h-8 text-rose-300" />, type: 'brain' },
    { id: 'BALLS', title: 'balls.title', icon: null, defaultIcon: <CircleDot className="w-8 h-8 text-sky-300" />, type: 'brain' },
    { id: 'TAP_COLOR', title: 'tapTheColor.title', icon: null, defaultIcon: <Brain className="w-8 h-8 text-pink-300" />, type: 'brain' },
    { id: 'AIM', title: 'aim.title', icon: null, defaultIcon: <MousePointer2 className="w-8 h-8 text-red-500" />, type: 'speed' },
    { id: 'MOST_COLOR', title: 'mostColor.title', icon: null, defaultIcon: <Zap className="w-8 h-8 text-yellow-500" />, type: 'speed' },
    { id: 'SORTING', title: 'sorting.title', icon: null, defaultIcon: <Star className="w-8 h-8 text-purple-500" />, type: 'brain' },
    { id: 'SPY', title: 'spy.title', icon: null, defaultIcon: <Ghost className="w-8 h-8 text-gray-500" />, type: 'brain' },
];

const PracticeMode = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { playSound } = useSound();
    const { user } = useAuth();
    const { showToast } = useUI();
    const [loading, setLoading] = useState(false);

    const handleBack = () => {
        playSound('click');
        navigate('/');
    };

    const handleGameSelect = async (gameId: string) => {
        if (!user) {
            showToast(t('auth.loginRequired'), 'error');
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

            if (error) throw error;

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
        <div className="h-[100dvh] bg-gray-900 text-white flex flex-col p-4 relative overflow-hidden">
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
                <div className="w-10" /> {/* Spacer */}
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
        </div>
    );
};

export default PracticeMode;
