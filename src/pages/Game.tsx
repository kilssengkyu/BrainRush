import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import GameLayout from '../components/GameLayout';
import RockPaperScissors from '../components/minigames/RockPaperScissors';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import NumberOrder from '../components/minigames/NumberOrder';
import { useGameState } from '../hooks/useGameState';

const Game = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { t } = useTranslation();

    // Retrieve state from navigation
    const { roomId, myId, opponentId } = location.state || {};

    // Redirect if no roomId (e.g., direct access)
    useEffect(() => {
        if (!roomId || !myId || !opponentId) {
            navigate('/');
        }
    }, [roomId, myId, opponentId, navigate]);

    // Use Game Hook
    const { gameState, submitMove } = useGameState(myId, opponentId);

    // Mock Names
    const PLAYER_ME = { name: 'You', score: gameState.scores.me, avatar: undefined };
    const PLAYER_OPPONENT = { name: 'Opponent', score: gameState.scores.opponent, avatar: undefined };

    return (
        <GameLayout
            opponent={PLAYER_OPPONENT}
            me={PLAYER_ME}
        >
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
                        // Map status to legacy 'phase' or update component. 
                        // RPS component expects 'countdown' | 'playing' | 'result'
                        phase={
                            gameState.status === 'countdown' ? 'countdown' :
                                gameState.status === 'round_end' ? 'result' :
                                    'playing'
                        }
                        resultMessage={gameState.resultMessage}
                        onMoveSelected={(move) => submitMove(move)}
                    />
                ) : (
                    <NumberOrder
                        gameType={gameState.gameType}
                        seed={gameState.gameData?.seed || 0}
                        // Map status for NumberOrder
                        phase={
                            gameState.status === 'countdown' ? 'countdown' :
                                gameState.status === 'round_end' ? 'result' :
                                    'playing'
                        }
                        resultMessage={gameState.resultMessage}
                        onGameComplete={(duration) => submitMove(`DONE:${duration}`)}
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
        </GameLayout>
    );
};

export default Game;
