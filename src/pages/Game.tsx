import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useGameState } from '../hooks/useGameState';
import { supabase } from '../lib/supabaseClient';
import RockPaperScissors from '../components/minigames/RockPaperScissors';
import NumberOrder from '../components/minigames/NumberOrder';
import MathChallenge from '../components/minigames/MathChallenge';
import MakeTen from '../components/minigames/MakeTen';
import ColorMatch from '../components/minigames/ColorMatch';
import ScoreProgressBar from '../components/ui/ScoreProgressBar';

const Game: React.FC = () => {
    const { t } = useTranslation();
    const { roomId: routeRoomId } = useParams<{ roomId: string }>();
    const location = useLocation();
    const navigate = useNavigate();

    // Route state check
    const { roomId: stateRoomId, myId, opponentId } = location.state || {};
    const roomId = routeRoomId || stateRoomId;

    // Profiles
    const [myProfile, setMyProfile] = useState<any>(null);
    const [opponentProfile, setOpponentProfile] = useState<any>(null);

    // Game Hook
    const { gameState, incrementScore, serverOffset, isWaitingTimeout } = useGameState(roomId!, myId, opponentId);

    useEffect(() => {
        if (!roomId) {
            navigate('/');
        }
    }, [roomId, navigate]);

    // Fetch Profiles
    useEffect(() => {
        const fetchProfiles = async () => {
            if (myId) {
                const { data } = await supabase.from('profiles').select('*').eq('id', myId).single();
                setMyProfile(data || { nickname: 'Me', avatar_url: null });
            }
            if (opponentId) {
                const { data } = await supabase.from('profiles').select('*').eq('id', opponentId).single();
                setOpponentProfile(data || { nickname: 'Opponent', avatar_url: null });
            }
        };
        fetchProfiles();
    }, [myId, opponentId]);

    // Handle Timeout / Exit
    useEffect(() => {
        if (isWaitingTimeout) {
            navigate('/');
        }
    }, [isWaitingTimeout, navigate]);


    // Determine Status Logic
    const isPlaying = gameState.status === 'playing';
    const isFinished = gameState.status === 'finished';
    const isWaiting = gameState.status === 'waiting';

    const getWinnerMessage = () => {
        if (!gameState.winnerId) return t('game.draw');
        return gameState.winnerId === myId ? t('game.victory') : t('game.defeat');
    };

    return (
        <div className="relative w-full h-screen bg-gray-900 text-white overflow-hidden flex flex-col font-sans select-none">

            {/* Top Info Bar (Timer & Scores) */}
            <header className="h-24 w-full bg-gray-800/80 backdrop-blur-md flex items-center justify-between px-6 shadow-lg z-50 relative">

                {/* Score Progress Bar - Bottom, 100% Width */}
                <div className="absolute bottom-0 left-0 w-full px-0">
                    <div className="w-full h-1.5 bg-gray-900/50 overflow-hidden backdrop-blur-sm">
                        <ScoreProgressBar myScore={gameState.myScore} opScore={gameState.opScore} />
                    </div>
                </div>

                {/* My Profile */}
                <div className="flex items-center gap-4 w-1/3 pt-2">
                    <img src={myProfile?.avatar_url || '/default-avatar.png'} className="w-12 h-12 rounded-full border-2 border-blue-500" />
                    <div>
                        <div className="font-bold text-lg">{myProfile?.nickname}</div>
                        <div className="text-3xl font-black text-blue-400 font-mono transition-all">
                            {gameState.myScore.toLocaleString()}
                        </div>
                    </div>
                </div>

                {/* Center Timer */}
                <div className="flex flex-col items-center w-1/3 pt-2">
                    <div className={`text-5xl font-black font-mono tracking-widest ${gameState.remainingTime <= 10 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>
                        {Math.floor(gameState.remainingTime)}
                    </div>
                    <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Time Left</div>
                </div>

                {/* Opponent Profile */}
                <div className="flex items-center justify-end gap-4 w-1/3 text-right pt-2">
                    <div>
                        <div className="font-bold text-lg">{opponentProfile?.nickname}</div>
                        <div className="text-3xl font-black text-red-400 font-mono transition-all">
                            {gameState.opScore.toLocaleString()}
                        </div>
                    </div>
                    <img src={opponentProfile?.avatar_url || '/default-avatar.png'} className="w-12 h-12 rounded-full border-2 border-red-500" />
                </div>
            </header>


            {/* Main Game Area */}
            <main className="flex-1 relative flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black">

                {/* Waiting Screen */}
                {isWaiting && (
                    <div className="flex flex-col items-center animate-pulse">
                        <div className="text-2xl font-bold mb-4">{t('game.opponentWaiting')}</div>
                        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                )}

                {/* Playing Area */}
                {isPlaying && gameState.gameType && (
                    <motion.div
                        key="gameContainer"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full h-full p-4 relative"
                    >
                        {/* WARM UP OVERLAY */}
                        {(() => {
                            const now = Date.now() + serverOffset;
                            const start = gameState.startAt ? new Date(gameState.startAt).getTime() : 0;
                            const diff = (start - now) / 1000;

                            if (diff > 0) {
                                return (
                                    <div className="absolute inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-8 text-center backdrop-blur-sm">
                                        <motion.div
                                            initial={{ scale: 0.5, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 2, opacity: 0 }}
                                            className="flex flex-col items-center"
                                        >
                                            <h2 className="text-6xl font-black text-yellow-400 mb-6 drop-shadow-lg">
                                                {gameState.gameType === 'RPS' && t('rps.title')}
                                                {gameState.gameType === 'NUMBER' && t('number.title')}
                                                {gameState.gameType === 'MATH' && t('math.title')}
                                                {gameState.gameType === 'TEN' && t('ten.title')}
                                                {gameState.gameType === 'COLOR' && t('color.title')}
                                            </h2>
                                            <p className="text-2xl text-white mb-12 font-bold max-w-2xl">
                                                {gameState.gameType === 'RPS' && t('rps.instruction')}
                                                {gameState.gameType === 'NUMBER' && t('number.instruction')}
                                                {gameState.gameType === 'MATH' && t('math.instruction')}
                                                {gameState.gameType === 'TEN' && t('ten.instruction')}
                                                {gameState.gameType === 'COLOR' && t('color.instruction')}
                                            </p>

                                            <div className="text-9xl font-black font-mono text-white animate-pulse">
                                                {Math.ceil(diff)}
                                            </div>
                                            <div className="text-sm text-gray-400 mt-2 font-bold tracking-widest uppercase">Starting in</div>
                                        </motion.div>
                                    </div>
                                );
                            }
                            return null;
                        })()}

                        <div className={`w-full h-full ${(gameState.startAt && new Date(gameState.startAt).getTime() > (Date.now() + serverOffset)) ? 'blur-sm pointer-events-none' : ''}`}>
                            {gameState.gameType === 'RPS' && (
                                <RockPaperScissors seed={gameState.seed} onScore={incrementScore} />
                            )}
                            {gameState.gameType === 'NUMBER' && (
                                <NumberOrder seed={gameState.seed} onScore={incrementScore} />
                            )}
                            {gameState.gameType === 'MATH' && (
                                <MathChallenge seed={gameState.seed} onScore={incrementScore} />
                            )}
                            {gameState.gameType === 'TEN' && (
                                <MakeTen seed={gameState.seed} onScore={incrementScore} />
                            )}
                            {gameState.gameType === 'COLOR' && (
                                <ColorMatch seed={gameState.seed} onScore={incrementScore} />
                            )}
                        </div>
                    </motion.div>
                )}

                {/* Result Overlay */}
                {isFinished && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-50">
                        <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-gray-800 p-12 rounded-3xl border-4 border-white/10 shadow-2xl text-center"
                        >
                            <h2 className="text-6xl font-black mb-6">
                                {getWinnerMessage()}
                            </h2>

                            <div className="flex gap-12 text-3xl font-mono mb-8">
                                <div className="text-blue-400">
                                    Me: <span className="font-bold text-white">{gameState.myScore}</span>
                                </div>
                                <div className="text-red-400">
                                    Op: <span className="font-bold text-white">{gameState.opScore}</span>
                                </div>
                            </div>

                            <button
                                onClick={() => navigate('/')}
                                className="px-8 py-4 bg-white text-black font-bold text-xl rounded-xl hover:scale-105 transition-transform"
                            >
                                {t('game.returnMenu')}
                            </button>
                        </motion.div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default Game;
