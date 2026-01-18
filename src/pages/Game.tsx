import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { useGameState } from '../hooks/useGameState';
import { supabase } from '../lib/supabaseClient';
import RockPaperScissors from '../components/minigames/RockPaperScissors';
import NumberOrder from '../components/minigames/NumberOrder';
import MathChallenge from '../components/minigames/MathChallenge';
import MakeTen from '../components/minigames/MakeTen';
import ColorMatch from '../components/minigames/ColorMatch';
import MemoryMatch from '../components/minigames/MemoryMatch';
import ReverseSequence from '../components/minigames/ReverseSequence';
import ScoreProgressBar from '../components/ui/ScoreProgressBar';
import Flag from '../components/ui/Flag';

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
    const isCountdownActive = Boolean(
        gameState.startAt && new Date(gameState.startAt).getTime() > (Date.now() + serverOffset)
    );

    const [isButtonEnabled, setIsButtonEnabled] = useState(false);

    useEffect(() => {
        if (isFinished) {
            // Wait for animations to finish (approx 4.5s)
            const timer = setTimeout(() => setIsButtonEnabled(true), 4500);
            return () => clearTimeout(timer);
        } else {
            setIsButtonEnabled(false);
        }
    }, [isFinished]);

    // MMR Animation Logic
    const [displayMMR, setDisplayMMR] = useState<number | null>(null);
    const [mmrDelta, setMmrDelta] = useState<number | null>(null);

    useEffect(() => {
        if (isFinished && gameState.mode === 'rank' && myProfile?.id) {
            // Delay MMR animation to start AFTER the main result animations (approx 3.5s)
            const startDelay = setTimeout(() => {
                // Fetch latest MMR
                supabase.from('profiles').select('mmr').eq('id', myProfile.id).single()
                    .then(({ data }) => {
                        if (data && myProfile.mmr) {
                            const start = myProfile.mmr;
                            const end = data.mmr;
                            setMmrDelta(end - start);
                            setDisplayMMR(start);

                            // Animate
                            const duration = 2000;
                            const steps = 60;
                            const intervalTime = duration / steps;
                            const stepValue = (end - start) / steps;
                            let output = start;
                            let count = 0;

                            const timer = setInterval(() => {
                                count++;
                                output += stepValue;
                                if (count >= steps) {
                                    setDisplayMMR(end);
                                    clearInterval(timer);
                                } else {
                                    setDisplayMMR(Math.round(output));
                                }
                            }, intervalTime);
                        }
                    });
            }, 3500);

            return () => clearTimeout(startDelay);
        }
    }, [isFinished, gameState.mode, myProfile]);

    const getWinnerMessage = () => {
        if (!gameState.winnerId) return t('game.draw');
        return gameState.winnerId === myId ? t('game.victory') : t('game.defeat');
    };

    return (
        <div className="relative w-full h-[100dvh] bg-gray-900 text-white overflow-hidden flex flex-col font-sans select-none">

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
                        <div className="font-bold text-lg flex items-center gap-2">
                            <Flag code={myProfile?.country} />
                            <span className="hidden sm:inline">{myProfile?.nickname}</span>
                        </div>
                        <div className="text-3xl font-black text-blue-400 font-mono transition-all">
                            {gameState.myScore.toLocaleString()}
                        </div>
                    </div>
                </div>

                {/* Center Timer */}
                <div className="flex flex-col items-center w-1/3 pt-2">
                    <div className="text-sm font-bold text-blue-300 tracking-widest uppercase mb-1">
                        Round {gameState.currentRound}/{gameState.totalRounds}
                    </div>
                    <div className={`text-5xl font-black font-mono tracking-widest ${gameState.remainingTime <= 10 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>
                        {Math.floor(gameState.remainingTime)}
                    </div>
                    <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Time Left</div>
                </div>

                {/* Opponent Profile */}
                <div className="flex items-center justify-end gap-4 w-1/3 text-right pt-2">
                    <div>
                        <div className="font-bold text-lg flex items-center justify-end gap-2">
                            <span className="hidden sm:inline">{opponentProfile?.nickname}</span>
                            <Flag code={opponentProfile?.country} />
                        </div>
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

                            // 1. Intermediate Result Phase (First 3 seconds of warmup for Rounds 2 & 3)
                            // Show result of the PREVIOUS round.
                            // Round 2 Starts -> Show Round 1 Result.
                            if (diff > 3 && gameState.currentRound > 1) {
                                const prevRoundIndex = gameState.currentRound - 2; // currentRound is 1-based, array is 0-based. Prev round is index-2.
                                const prevRound = gameState.roundScores[prevRoundIndex];

                                if (prevRound) {
                                    const p1Score = prevRound.p1_score || 0;
                                    const p2Score = prevRound.p2_score || 0;

                                    const myRoundScore = gameState.isPlayer1 ? p1Score : p2Score;
                                    const opRoundScore = gameState.isPlayer1 ? p2Score : p1Score;

                                    const isWin = myRoundScore > opRoundScore;
                                    const isDraw = myRoundScore === opRoundScore;

                                    return (
                                        <div className="absolute inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-8 text-center backdrop-blur-sm">
                                            <motion.div
                                                initial={{ scale: 0.8, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                className="flex flex-col items-center"
                                            >
                                                <h2 className="text-4xl text-gray-300 mb-2 font-bold uppercase tracking-widest">{t('game.roundResult', { round: gameState.currentRound - 1 })}</h2>
                                                <div className={`text-6xl font-black mb-8 ${isWin ? 'text-blue-400' : isDraw ? 'text-gray-400' : 'text-red-400'}`}>
                                                    {isWin ? t('game.victory') : isDraw ? t('game.draw') : t('game.defeat')}
                                                </div>

                                                <div className="flex gap-12 text-4xl font-mono font-bold">
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-sm text-gray-500 mb-1">{t('game.you')}</span>
                                                        <span className="text-blue-400">{myRoundScore}</span>
                                                    </div>
                                                    <div className="flex flex-col items-center justify-center">
                                                        <span className="text-2xl text-gray-600">VS</span>
                                                    </div>
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-sm text-gray-500 mb-1">{t('game.opponent')}</span>
                                                        <span className="text-red-400">{opRoundScore}</span>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        </div>
                                    );
                                }
                            }

                            if (diff > 0) {
                                return (
                                    <div className="absolute inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-8 text-center backdrop-blur-sm">
                                        <motion.div
                                            initial={{ scale: 0.5, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 2, opacity: 0 }}
                                            className="flex flex-col items-center"
                                        >
                                            <h2 className="text-6xl font-black text-yellow-400 mb-6 drop-shadow-lg flex flex-col items-center">
                                                <span className="text-3xl text-white mb-2">Round {gameState.currentRound}</span>
                                                {gameState.gameType === 'RPS' && t('rps.title')}
                                                {gameState.gameType === 'NUMBER' && t('number.title')}
                                                {gameState.gameType === 'MATH' && t('math.title')}
                                                {gameState.gameType === 'TEN' && t('ten.title')}
                                                {gameState.gameType === 'COLOR' && t('color.title')}
                                                {gameState.gameType === 'MEMORY' && t('memory.title')}
                                                {gameState.gameType === 'SEQUENCE' && t('sequence.title')}
                                            </h2>
                                            <p className="text-2xl text-white mb-12 font-bold max-w-2xl">
                                                {gameState.gameType === 'RPS' && t('rps.instruction')}
                                                {gameState.gameType === 'NUMBER' && t('number.instruction')}
                                                {gameState.gameType === 'MATH' && t('math.instruction')}
                                                {gameState.gameType === 'TEN' && t('ten.instruction')}
                                                {gameState.gameType === 'COLOR' && t('color.instruction')}
                                                {gameState.gameType === 'MEMORY' && t('memory.instruction')}
                                                {gameState.gameType === 'SEQUENCE' && t('sequence.instruction')}
                                            </p>

                                            <div className="text-9xl font-black font-mono text-white animate-pulse">
                                                {Math.ceil(diff)}
                                            </div>
                                            <div className="text-sm text-gray-400 mt-2 font-bold tracking-widest uppercase">{t('game.startingIn')}</div>
                                        </motion.div>
                                    </div>
                                );
                            }
                            return null;
                        })()}

                        <div className={`w-full h-full ${isCountdownActive ? 'blur-sm pointer-events-none' : ''}`}>
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
                            {gameState.gameType === 'MEMORY' && (
                                <MemoryMatch seed={gameState.seed || ''} onScore={incrementScore} />
                            )}
                            {gameState.gameType === 'SEQUENCE' && (
                                <ReverseSequence
                                    seed={gameState.seed || ''}
                                    onScore={incrementScore}
                                    isPlaying={isPlaying && !isCountdownActive}
                                />
                            )}
                        </div>
                    </motion.div>
                )}

                {/* Result Overlay */}
                {isFinished && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-50">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-gray-800 p-8 rounded-3xl border-4 border-white/10 shadow-2xl text-center max-w-2xl w-full"
                        >
                            <h2 className="text-5xl font-black mb-8 text-yellow-400 tracking-wider flex justify-center gap-4">
                                {t('game.matchResult').split('').map((char, i) => (
                                    <motion.span
                                        key={i}
                                        initial={{ opacity: 0, y: -20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.1 }}
                                    >
                                        {char}
                                    </motion.span>
                                ))}
                            </h2>

                            {/* VICTORY / DEFEAT TEXT - SLAM ANIMATION (After Rounds) */}
                            <motion.div
                                initial={{ scale: 5, opacity: 0, rotate: -10 }}
                                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                transition={{
                                    delay: 0.5 + (gameState.roundScores.length + 1) * 0.6,
                                    type: "spring", stiffness: 200, damping: 15
                                }}
                                className="mb-8"
                            >
                                <h3 className={`text-6xl font-black drop-shadow-2xl ${getWinnerMessage() === t('game.victory') ? 'text-blue-500' : 'text-red-500'}`}>
                                    {getWinnerMessage()}
                                </h3>
                            </motion.div>

                            {/* Scoreboard Table */}
                            <div className="w-full bg-gray-900/50 rounded-xl overflow-hidden mb-8 border border-white/5">
                                <div className="grid grid-cols-4 bg-gray-800 p-3 text-xs font-bold text-gray-400 uppercase tracking-widest">
                                    <div className="text-left pl-4">{t('game.table.round')}</div>
                                    <div>{t('game.table.myScore')}</div>
                                    <div>{t('game.table.opScore')}</div>
                                    <div>{t('game.table.result')}</div>
                                </div>
                                {gameState.roundScores.map((round, idx) => {
                                    const myS = gameState.isPlayer1 ? round.p1_score : round.p2_score;
                                    const opS = gameState.isPlayer1 ? round.p2_score : round.p1_score;
                                    const win = myS > opS;
                                    const totalS = myS + opS;
                                    const myRatio = totalS > 0 ? (myS / totalS) * 100 : 50;

                                    return (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, x: -50 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.5 + idx * 0.6 }}
                                            className="grid grid-cols-4 p-4 border-t border-white/5 items-center font-mono relative overflow-hidden"
                                        >
                                            {/* Background Bar */}
                                            <div className="absolute inset-0 z-0 opacity-10">
                                                {/* Left (Blue) - Anchored Left */}
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${myRatio}%` }}
                                                    transition={{ delay: 0.5 + idx * 0.6, duration: 1, ease: "easeOut" }}
                                                    className="absolute left-0 top-0 h-full bg-blue-500"
                                                />
                                                {/* Right (Red) - Anchored Right */}
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${100 - myRatio}%` }}
                                                    transition={{ delay: 0.5 + idx * 0.6, duration: 1, ease: "easeOut" }}
                                                    className="absolute right-0 top-0 h-full bg-red-500"
                                                />
                                            </div>

                                            <div className="text-left pl-4 text-white font-bold relative z-10">#{round.round}</div>
                                            <div className="text-blue-400 font-bold text-lg relative z-10">{myS}</div>
                                            <div className="text-red-400 font-bold text-lg relative z-10">{opS}</div>
                                            <div className="relative z-10">
                                                <motion.div
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                    transition={{ delay: 0.8 + idx * 0.6, type: "spring" }}
                                                >
                                                    {win ? (
                                                        <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded">{t('game.table.win')}</span>
                                                    ) : myS === opS ? (
                                                        <span className="text-xs bg-gray-500/20 text-gray-400 px-2 py-1 rounded">{t('game.table.draw')}</span>
                                                    ) : (
                                                        <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded">{t('game.table.lose')}</span>
                                                    )}
                                                </motion.div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                                {/* TOTAL */}
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.5 + gameState.roundScores.length * 0.6 }}
                                    className="grid grid-cols-4 p-4 bg-white/5 border-t-2 border-white/10 items-center font-mono"
                                >
                                    <div className="text-left pl-4 text-yellow-400 font-black">{t('game.total')}</div>
                                    <div className="text-blue-400 font-black text-2xl">{gameState.myScore}</div>
                                    <div className="text-red-400 font-black text-2xl">{gameState.opScore}</div>
                                    <div>
                                        {gameState.myScore > gameState.opScore ? (
                                            <Trophy className="w-6 h-6 text-yellow-400 mx-auto animate-bounce" />
                                        ) : (
                                            <span className="text-gray-500">-</span>
                                        )}
                                    </div>
                                </motion.div>
                            </div>

                            {/* Rank Result Animation */}
                            {gameState.mode === 'rank' && displayMMR !== null && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 1.2 + (gameState.roundScores.length + 1) * 0.6 }}
                                    className="mb-8 p-4 bg-white/10 rounded-xl border border-white/20"
                                >
                                    <div className="text-gray-400 text-sm font-bold uppercase tracking-widest mb-2">{t('game.rankScore')}</div>
                                    <div className="flex items-center justify-center gap-4 text-4xl font-black">
                                        <div className="text-white">{displayMMR}</div>
                                        {mmrDelta !== null && mmrDelta !== 0 && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.5 }} // local delay
                                                className={`text-2xl ${mmrDelta > 0 ? 'text-green-400' : 'text-red-400'}`}
                                            >
                                                {mmrDelta > 0 ? `+${mmrDelta}` : mmrDelta}
                                            </motion.div>
                                        )}
                                    </div>
                                </motion.div>
                            )}

                            <motion.button
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 2.0 + (gameState.roundScores.length + 1) * 0.6 }}
                                onClick={() => navigate('/')}
                                disabled={!isButtonEnabled}
                                className={`w-full py-4 font-bold text-xl rounded-xl transition-all ${isButtonEnabled
                                    ? 'bg-white text-black hover:bg-gray-200'
                                    : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'
                                    }`}
                            >
                                {isButtonEnabled ? t('game.returnMenu') : t('common.loading')}
                            </motion.button>
                        </motion.div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default Game;
