import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import GameLayout from '../components/GameLayout';
import RockPaperScissors from '../components/minigames/RockPaperScissors';
import { useTranslation } from 'react-i18next';
import { motion, animate, AnimatePresence } from 'framer-motion';
import NumberOrder from '../components/minigames/NumberOrder';
import { useGameState } from '../hooks/useGameState';
import { useAuth } from '../contexts/AuthContext';

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
    const { gameState, submitMove, isReconnecting, reconnectTimer, serverOffset } = useGameState(roomId, myId, opponentId);

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
    }, [gameState?.mmrChange]);

    // Mock Names
    const PLAYER_ME = { name: 'You', score: gameState.scores.me, avatar: undefined };
    const PLAYER_OPPONENT = { name: 'Opponent', score: gameState.scores.opponent, avatar: undefined };

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
                gameState.gameType === 'RPS' ? (
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

                    {/* Display MMR Change with Animation */}
                    {gameState.mmrChange !== null && gameState.mmrChange !== undefined && (
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
