import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import GameLayout from '../components/GameLayout';
import RockPaperScissors from '../components/minigames/RockPaperScissors';
import { useTranslation } from 'react-i18next';
import { motion, animate, AnimatePresence } from 'framer-motion';
import NumberOrder from '../components/minigames/NumberOrder';
import { useGameState } from '../hooks/useGameState';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

const Game = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { profile } = useAuth();

    // Retrieve state from navigation
    const { roomId, myId, opponentId } = location.state || {};

    // Redirect if no roomId
    useEffect(() => {
        if (!roomId || !myId || !opponentId) {
            navigate('/');
        }
    }, [roomId, myId, opponentId, navigate]);

    // Use Game Hook
    const { gameState, submitMove, isReconnecting, reconnectTimer, serverOffset, isWaitingTimeout } = useGameState(roomId, myId, opponentId);

    // Profile State
    const [opponentProfile, setOpponentProfile] = useState<any>(null);

    // ... (existing code)

    // Handle Waiting Timeout
    if (isWaitingTimeout) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white gap-8 font-sans">
                <div className="text-4xl font-bold text-red-500">{t('matchmaking.timeout')}</div>
                <p className="text-xl text-gray-400">{t('matchmaking.timeoutDesc')}</p>
                <button
                    onClick={() => navigate('/')}
                    className="px-8 py-4 bg-gray-700 hover:bg-gray-600 rounded-xl font-bold transition-colors"
                >
                    {t('game.returnMenu')}
                </button>
            </div>
        );
    }

    // Fetch Opponent Profile
    useEffect(() => {
        if (!opponentId) return;

        const fetchOpponent = async () => {
            // Guest Check
            if (opponentId.startsWith('guest_')) {
                setOpponentProfile({
                    nickname: t('game.guest') + ' ' + opponentId.slice(-4),
                    isGuest: true
                });
                return;
            }

            // Real User Fetch
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', opponentId)
                .single();

            if (data && !error) {
                setOpponentProfile(data);
            } else {
                // Fallback if profile missing
                setOpponentProfile({ nickname: t('game.unknownPlayer'), isGuest: true });
            }
        };

        fetchOpponent();
    }, [opponentId]);


    // Animation State for MMR
    const [displayMMR, setDisplayMMR] = useState(profile?.mmr || 1000);

    useEffect(() => {
        if (gameState && gameState.mmrChange !== null) {
            const start = profile?.mmr || 1000;
            const end = start + gameState.mmrChange;
            // animate
            animate(start, end, {
                duration: 2.5,
                ease: "circOut",
                onUpdate: (latest) => setDisplayMMR(Math.floor(latest))
            });
        }
    }, [gameState?.mmrChange, profile?.mmr]);

    // Construct Player Objects
    const PLAYER_ME = {
        name: profile?.nickname || t('game.you'),
        score: gameState.scores.me,
        avatar: profile?.avatar_url,
        mmr: profile?.mmr,
        wins: profile?.wins,
        losses: profile?.losses,
        isGuest: false // Assuming 'me' is logged in if we have profile. If guest, profile is null?
    };

    // If I am guest? (AuthContext profile might be null)
    if (!profile) {
        PLAYER_ME.name = `${t('game.guest')} (${t('game.you')})`;
        PLAYER_ME.isGuest = true;
    }

    const PLAYER_OPPONENT = {
        name: opponentProfile?.nickname || t('game.opponent'),
        score: gameState.scores.opponent,
        avatar: opponentProfile?.avatar_url,
        mmr: opponentProfile?.mmr,
        wins: opponentProfile?.wins,
        losses: opponentProfile?.losses,
        isGuest: opponentProfile?.isGuest || false
    };

    return (
        <GameLayout
            opponent={PLAYER_OPPONENT}
            me={PLAYER_ME}
        >
            {/* Reconnection Overlay */}
            <AnimatePresence>
                {isReconnecting && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-8"
                    >
                        <div className="bg-gray-800 p-8 rounded-3xl border border-red-500/50 flex flex-col items-center text-center shadow-2xl max-w-md w-full">
                            <span className="loading loading-ring loading-lg text-red-500 mb-6 w-20 h-20"></span>
                            <h2 className="text-3xl font-bold mb-2 text-white">{t('game.reconnecting')}</h2>
                            <p className="text-gray-400 mb-6">{t('game.reconnectingDesc')}</p>

                            <div className="w-full h-4 bg-gray-700 rounded-full overflow-hidden mb-4 relative">
                                <motion.div
                                    className="absolute top-0 left-0 h-full bg-red-500"
                                    initial={{ width: '100%' }}
                                    animate={{ width: '0%' }}
                                    transition={{ duration: 30, ease: 'linear' }}
                                />
                            </div>
                            <p className="text-3xl font-mono font-bold text-red-400">{reconnectTimer}s</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {!gameState.gameType ? (
                // Generic Loading / Waiting Screen
                <div className="flex flex-col items-center justify-center h-full gap-4 text-blue-400">
                    <div className="text-2xl font-bold animate-pulse">{t('game.waiting')}</div>
                    <span className="loading loading-spinner loading-lg"></span>
                </div>


            ) : gameState.scores.me < 3 && gameState.scores.opponent < 3 ? (
                (gameState.gameType === 'RPS' || gameState.gameType === 'RPS_LOSE') ? (
                    <RockPaperScissors
                        round={gameState.round}
                        targetMove={gameState.targetMove as any}
                        phase={
                            gameState.status === 'countdown' ? 'countdown' :
                                gameState.status === 'round_end' ? 'result' :
                                    'playing'
                        }
                        resultMessage={gameState.resultMessage}
                        onMoveSelected={(move) => submitMove(move)}
                        phaseEndAt={gameState.phaseEndAt}
                        serverOffset={serverOffset}
                        isReverse={gameState.gameType === 'RPS_LOSE'}
                    />
                ) : (
                    <NumberOrder
                        gameType={gameState.gameType}
                        seed={gameState.gameData?.seed || 0}
                        phase={
                            gameState.status === 'countdown' ? 'countdown' :
                                gameState.status === 'round_end' ? 'result' :
                                    'playing'
                        }
                        resultMessage={gameState.resultMessage}
                        onGameComplete={(duration) => submitMove(`DONE:${duration}`)}
                        phaseEndAt={gameState.phaseEndAt}
                        serverOffset={serverOffset}
                    />
                )
            ) : (
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-8 p-12 bg-gray-800/80 backdrop-blur-xl rounded-3xl border border-white/10 text-center z-50"
                >
                    <h2 className={`text-6xl font-black ${gameState.scores.me >= 3 ? 'text-green-400' : 'text-red-500'}`}>
                        {gameState.scores.me >= 3 ? t('game.victory') : t('game.defeat')}
                    </h2>

                    {/* Display MMR Change with Animation (Rank Only) */}
                    {gameState.mode === 'rank' && gameState.mmrChange !== null && gameState.mmrChange !== undefined && (
                        <div className="flex flex-col items-center gap-2 mb-8">
                            <motion.div
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="text-4xl font-bold text-white flex items-center gap-2"
                            >
                                MMR {displayMMR}
                            </motion.div>
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.5 }}
                                className={`text-2xl font-bold ${gameState.mmrChange >= 0 ? 'text-blue-400' : 'text-red-400'}`}
                            >
                                ({gameState.mmrChange >= 0 ? '+' : ''}{gameState.mmrChange})
                            </motion.div>
                        </div>
                    )}
                    <div className="flex gap-4">
                        <button
                            onClick={() => navigate('/')}
                            className="px-8 py-4 bg-gray-700 hover:bg-gray-600 rounded-xl font-bold transition-colors"
                        >
                            {t('game.returnMenu')}
                        </button>
                    </div>
                </motion.div>
            )}
        </GameLayout >
    );
};

export default Game;
