import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { useGameState } from '../hooks/useGameState';
import { supabase } from '../lib/supabaseClient';
import RockPaperScissors from '../components/minigames/RockPaperScissors';
import NumberSortGame from '../components/minigames/NumberSortGame';
import MathChallenge from '../components/minigames/MathChallenge';
import MakeTen from '../components/minigames/MakeTen';
import ColorMatch from '../components/minigames/ColorMatch';
import MemoryMatch from '../components/minigames/MemoryMatch';
import SequenceGame from '../components/minigames/SequenceGame';
import FindLargest from '../components/minigames/FindLargest';
import FindPair from '../components/minigames/FindPair';
import NumberUpDown from '../components/minigames/NumberUpDown';
import NumberSlider from '../components/minigames/NumberSlider';
import ArrowSlider from '../components/minigames/ArrowSlider';
import FillBlanks from '../components/minigames/FillBlanks';
import FindOperator from '../components/minigames/FindOperator';
import LadderGame from '../components/minigames/LadderGame';
import TapTheColor from '../components/minigames/TapTheColor';
import AimingGame from '../components/minigames/AimingGame';
import FindMostColor from '../components/minigames/FindMostColor';
import SortingGame from '../components/minigames/SortingGame';
import FindTheSpy from '../components/minigames/FindTheSpy';
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
    const { gameState, incrementScore, serverOffset, isWaitingTimeout, isTimeUp, onlineUsers } = useGameState(roomId!, myId, opponentId);

    const isOpponentOnline = !opponentId || opponentId.startsWith('practice') || onlineUsers.includes(opponentId);

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
                if (opponentId === 'practice_solo') {
                    setOpponentProfile(null); // No opponent
                } else if (opponentId === 'practice_bot') {
                    setOpponentProfile({
                        nickname: 'AI Bot',
                        avatar_url: 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=BrainRushBot',
                        country: 'KR' // Or generic
                    });
                } else {
                    const { data } = await supabase.from('profiles').select('*').eq('id', opponentId).single();
                    setOpponentProfile(data || { nickname: 'Opponent', avatar_url: null });
                }
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
    const isCountdown = gameState.status === 'countdown';
    const isCountdownActive = Boolean(
        isCountdown || (gameState.startAt && new Date(gameState.startAt).getTime() > (Date.now() + serverOffset))
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
            // Delay start to sync with "Total Score" appearance
            // Rounds=3 -> 0.3*3 + 0.3 = 1.2s (Total) -> Rank starts at 1.5s
            const startDelay = setTimeout(() => {
                supabase.from('profiles').select('mmr').eq('id', myProfile.id).single()
                    .then(({ data }) => {
                        if (data && myProfile.mmr) {
                            const start = myProfile.mmr;
                            const end = data.mmr;
                            setMmrDelta(end - start);
                            setDisplayMMR(start);

                            // Faster counting: 1.5s duration
                            const duration = 1500;
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
            }, 1000); // Reduced initial wait

            return () => clearTimeout(startDelay);
        }
    }, [isFinished, gameState.mode, myProfile]);

    const getWinnerMessage = () => {
        if (!gameState.winnerId) return t('game.draw');
        return gameState.winnerId === myId ? t('game.victory') : t('game.defeat');
    };

    const totalScores = React.useMemo(() => {
        const rounds = gameState.roundScores || [];
        if (rounds.length === 0) {
            return { my: gameState.myScore, op: gameState.opScore };
        }
        const sum = rounds.reduce(
            (acc, round) => {
                const p1 = Number(round?.p1_score || 0);
                const p2 = Number(round?.p2_score || 0);
                if (gameState.isPlayer1) {
                    acc.my += p1;
                    acc.op += p2;
                } else {
                    acc.my += p2;
                    acc.op += p1;
                }
                return acc;
            },
            { my: 0, op: 0 }
        );
        return sum;
    }, [gameState.roundScores, gameState.isPlayer1, gameState.myScore, gameState.opScore]);

    return (
        <div className="relative w-full h-[100dvh] bg-gray-900 text-white overflow-hidden flex flex-col font-sans select-none">

            {/* Top Info Bar (Timer & Scores) */}
            <header className="h-24 w-full bg-gray-800/80 backdrop-blur-md flex items-center justify-between px-6 shadow-lg z-50 relative">

                {/* Score Progress Bar - Hide in Practice */}
                {gameState.mode !== 'practice' && (
                    <div className="absolute bottom-0 left-0 w-full px-0">
                        <div className="w-full h-1.5 bg-gray-900/50 overflow-hidden backdrop-blur-sm">
                            <ScoreProgressBar myScore={gameState.myScore} opScore={gameState.opScore} />
                        </div>
                    </div>
                )}

                {/* My Profile */}
                <div className="flex items-center gap-4 w-1/3 pt-2">
                    <img src={myProfile?.avatar_url || '/default-avatar.png'} className="w-12 h-12 rounded-full border-2 border-blue-500" />
                    <div>
                        <div className="font-bold text-lg flex items-center gap-2">
                            <Flag code={myProfile?.country} />
                            <span className="hidden sm:inline">{myProfile?.nickname}</span>
                        </div>
                        {gameState.mode !== 'practice' && (
                            <div className="text-3xl font-black text-blue-400 font-mono transition-all">
                                {gameState.myScore.toLocaleString()}
                            </div>
                        )}
                    </div>
                </div>

                {/* Center Timer */}
                <div className="flex flex-col items-center w-1/3 pt-2">
                    {gameState.mode !== 'practice' && (
                        <div className="flex flex-col items-center mb-1">
                            <div className="text-sm font-bold text-blue-300 tracking-widest uppercase">
                                Round {gameState.currentRound}/{gameState.totalRounds}
                            </div>
                            {/* Wins Display Removed */}
                        </div>
                    )}
                    <div
                        key={gameState.remainingTime <= 10 ? 'urgent' : 'normal'}
                        className={`text-5xl font-black font-mono tracking-widest ${gameState.remainingTime <= 10 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}
                    >
                        {Math.floor(gameState.remainingTime)}
                    </div>
                    <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Time Left</div>
                </div>

                {/* Opponent Profile - Hide in Solo Practice */}
                <div className="flex items-center justify-end gap-4 w-1/3 text-right pt-2 relative">
                    {opponentProfile && (
                        <>
                            <div>
                                <div className="font-bold text-lg flex items-center justify-end gap-2">
                                    <span className="hidden sm:inline">{opponentProfile?.nickname}</span>
                                    <Flag code={opponentProfile?.country} />
                                </div>
                                <div className="text-3xl font-black text-red-400 font-mono transition-all">
                                    {gameState.opScore.toLocaleString()}
                                </div>
                            </div>
                            <div className="relative">
                                <img src={opponentProfile?.avatar_url || '/default-avatar.png'} className={`w-12 h-12 rounded-full border-2 ${!isOpponentOnline ? 'border-gray-500 grayscale opacity-50' : 'border-red-500'}`} />
                                {!isOpponentOnline && gameState.status !== 'finished' && (
                                    <div className="absolute -bottom-2 -right-2 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded animate-pulse border border-red-400 whitespace-nowrap z-50">
                                        DISCONNECT
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                    {!opponentProfile && gameState.mode === 'practice' && (
                        <div className="text-gray-500 font-bold uppercase tracking-widest text-sm">
                            Practice Mode
                        </div>
                    )}
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
                {(isPlaying || isCountdown) && gameState.gameType && (
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
                                // Result calculation variables removed as UI is hidden
                                // Result calculation variables removed as UI is hidden
                                // Result calculation variables removed as UI is hidden
                                // Result calculation variables removed as UI is hidden

                                return (
                                    <div className="absolute inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-8 text-center backdrop-blur-sm">
                                        <motion.div
                                            initial={{ scale: 0.5, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 2, opacity: 0 }}
                                            className="flex flex-col items-center"
                                        >
                                            {/* Previous round result removed */}
                                            <h2 className="text-6xl font-black text-yellow-400 mb-6 drop-shadow-lg flex flex-col items-center">
                                                <span className="text-3xl text-white mb-2">Round {gameState.currentRound}</span>
                                                {gameState.gameType === 'RPS' && t('rps.title')}
                                                {gameState.gameType === 'NUMBER' && t('number.title')}
                                                {gameState.gameType === 'NUMBER_DESC' && t('number.titleDesc')}
                                                {gameState.gameType === 'MATH' && t('math.title')}
                                                {gameState.gameType === 'TEN' && t('ten.title')}
                                                {gameState.gameType === 'COLOR' && t('color.title')}
                                                {gameState.gameType === 'MEMORY' && t('memory.title')}
                                                {gameState.gameType === 'SEQUENCE' && t('sequence.title')}
                                                {gameState.gameType === 'SEQUENCE_NORMAL' && t('sequence.titleNormal')}
                                                {gameState.gameType === 'LARGEST' && t('largest.title')}
                                                {gameState.gameType === 'PAIR' && t('pair.title')}
                                                {gameState.gameType === 'UPDOWN' && t('updown.title')}
                                                {gameState.gameType === 'SLIDER' && t('slider.title')}
                                                {gameState.gameType === 'ARROW' && t('arrow.title')}
                                                {gameState.gameType === 'BLANK' && t('fillBlanks.title')}
                                                {gameState.gameType === 'OPERATOR' && t('findOperator.title')}
                                                {gameState.gameType === 'LADDER' && t('ladder.title')}
                                                {gameState.gameType === 'AIM' && t('aim.title')}
                                                {gameState.gameType === 'MOST_COLOR' && t('mostColor.title')}
                                                {gameState.gameType === 'SORTING' && t('sorting.title')}
                                                {gameState.gameType === 'SPY' && t('spy.title')}
                                            </h2>
                                            <p className="text-2xl text-white mb-12 font-bold max-w-2xl">
                                                {gameState.gameType === 'RPS' && t('rps.instruction')}
                                                {gameState.gameType === 'NUMBER' && t('number.instruction')}
                                                {gameState.gameType === 'NUMBER_DESC' && t('number.instructionDesc')}
                                                {gameState.gameType === 'MATH' && t('math.instruction')}
                                                {gameState.gameType === 'TEN' && t('ten.instruction')}
                                                {gameState.gameType === 'COLOR' && t('color.instruction')}
                                                {gameState.gameType === 'MEMORY' && t('memory.instruction')}
                                                {gameState.gameType === 'SEQUENCE' && t('sequence.instruction')}
                                                {gameState.gameType === 'SEQUENCE_NORMAL' && t('sequence.instructionNormal')}
                                                {gameState.gameType === 'LARGEST' && t('largest.instruction')}
                                                {gameState.gameType === 'PAIR' && t('pair.instruction')}
                                                {gameState.gameType === 'UPDOWN' && t('updown.instruction')}
                                                {gameState.gameType === 'SLIDER' && t('slider.instruction')}
                                                {gameState.gameType === 'ARROW' && t('arrow.instruction')}
                                                {gameState.gameType === 'BLANK' && t('fillBlanks.instruction')}
                                                {gameState.gameType === 'OPERATOR' && t('findOperator.instruction')}
                                                {gameState.gameType === 'LADDER' && t('ladder.instruction')}
                                                {gameState.gameType === 'AIM' && t('aim.instruction')}
                                                {gameState.gameType === 'MOST_COLOR' && t('mostColor.instruction')}
                                                {gameState.gameType === 'SORTING' && t('sorting.instruction')}
                                                {gameState.gameType === 'SPY' && t('spy.instruction')}
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

                        {/* Round Finished Overlay (Grace Period) */}
                        {isTimeUp && (
                            <div className="absolute inset-0 bg-black/40 z-40 flex flex-col items-center justify-center p-8 text-center backdrop-blur-sm">
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="text-5xl font-black text-white drop-shadow-lg uppercase tracking-widest border-4 border-white p-6 rounded-2xl bg-white/10"
                                >
                                    {t('game.roundFinished')}
                                </motion.div>
                            </div>
                        )}

                        <div className="w-full h-full select-none minigame-area">
                            {isPlaying && !isCountdownActive && (
                                <>
                                    {gameState.gameType === 'RPS' && (
                                        <RockPaperScissors seed={gameState.seed} onScore={incrementScore} isPlaying />
                                    )}
                                    {gameState.gameType === 'NUMBER' && (
                                        <NumberSortGame mode="asc" seed={gameState.seed} onScore={incrementScore} isPlaying />
                                    )}
                                    {gameState.gameType === 'NUMBER_DESC' && (
                                        <NumberSortGame mode="desc" seed={gameState.seed} onScore={incrementScore} isPlaying />
                                    )}
                                    {gameState.gameType === 'MATH' && (
                                        <MathChallenge seed={gameState.seed} onScore={incrementScore} isPlaying />
                                    )}
                                    {gameState.gameType === 'TEN' && (
                                        <MakeTen seed={gameState.seed} onScore={incrementScore} isPlaying />
                                    )}
                                    {gameState.gameType === 'COLOR' && (
                                        <ColorMatch seed={gameState.seed} onScore={incrementScore} isPlaying />
                                    )}
                                    {gameState.gameType === 'MEMORY' && (
                                        <MemoryMatch seed={gameState.seed || ''} onScore={incrementScore} isPlaying />
                                    )}
                                    {gameState.gameType === 'SEQUENCE' && (
                                        <SequenceGame
                                            mode="reverse"
                                            seed={gameState.seed}
                                            onScore={incrementScore}
                                            isPlaying
                                        />
                                    )}
                                    {gameState.gameType === 'SEQUENCE_NORMAL' && (
                                        <SequenceGame
                                            mode="forward"
                                            seed={gameState.seed}
                                            onScore={incrementScore}
                                            isPlaying
                                        />
                                    )}
                                    {gameState.gameType === 'LARGEST' && (
                                        <FindLargest seed={gameState.seed} onScore={incrementScore} isPlaying />
                                    )}
                                    {gameState.gameType === 'PAIR' && (
                                        <FindPair seed={gameState.seed} onScore={incrementScore} isPlaying />
                                    )}
                                    {gameState.gameType === 'UPDOWN' && (
                                        <NumberUpDown seed={gameState.seed} onScore={incrementScore} isPlaying />
                                    )}
                                    {gameState.gameType === 'SLIDER' && (
                                        <NumberSlider seed={gameState.seed} onScore={incrementScore} isPlaying />
                                    )}
                                    {gameState.gameType === 'ARROW' && (
                                        <ArrowSlider seed={gameState.seed} onScore={incrementScore} isPlaying />
                                    )}
                                    {gameState.gameType === 'BLANK' && (
                                        <FillBlanks seed={gameState.seed} onScore={incrementScore} isPlaying />
                                    )}
                                    {gameState.gameType === 'OPERATOR' && (
                                        <FindOperator seed={gameState.seed} onScore={incrementScore} isPlaying />
                                    )}
                                    {gameState.gameType === 'LADDER' && (
                                        <LadderGame seed={gameState.seed} onScore={incrementScore} isPlaying />
                                    )}
                                    {gameState.gameType === 'TAP_COLOR' && (
                                        <TapTheColor seed={gameState.seed} onScore={incrementScore} isPlaying />
                                    )}
                                    {gameState.gameType === 'AIM' && (
                                        <AimingGame seed={gameState.seed} onScore={incrementScore} isPlaying />
                                    )}
                                    {gameState.gameType === 'MOST_COLOR' && (
                                        <FindMostColor seed={gameState.seed} onScore={incrementScore} isPlaying />
                                    )}
                                    {gameState.gameType === 'SORTING' && (
                                        <SortingGame seed={gameState.seed} onScore={incrementScore} isPlaying />
                                    )}
                                    {gameState.gameType === 'SPY' && (
                                        <FindTheSpy seed={gameState.seed} onScore={incrementScore} isPlaying />
                                    )}
                                </>
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
                            {/* PRACTICE MODE RESULT */}
                            {gameState.mode === 'practice' ? (
                                <div className="text-center">
                                    <h2 className="text-5xl font-black mb-4 text-green-400 tracking-wider">
                                        {t('game.practiceComplete', '연습 완료!')}
                                    </h2>
                                    <div className="text-2xl text-white mb-8">
                                        {/* Show Score or Time based on game type if tracked, currently just completion */}
                                        <p>{t('game.greatJob', '수고하셨습니다!')}</p>
                                    </div>
                                    <motion.button
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.5 }}
                                        onClick={() => navigate('/')}
                                        className="px-8 py-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-xl transition-all shadow-lg hover:shadow-green-500/50"
                                    >
                                        {t('game.returnMenu')}
                                    </motion.button>
                                </div>
                            ) : (
                                /* NORMAL / RANK MODE RESULT */
                                <>
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
                                            delay: 0.2 + (gameState.roundScores.length + 1) * 0.4,
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
                                                    transition={{ delay: 0.5 + idx * 0.4 }}
                                                    className="grid grid-cols-4 p-4 border-t border-white/5 items-center font-mono relative overflow-hidden"
                                                >
                                                    {/* Background Bar */}
                                                    <div className="absolute inset-0 z-0 opacity-10">
                                                        {/* Left (Blue) - Anchored Left */}
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${myRatio}%` }}
                                                            transition={{ delay: 0.5 + idx * 0.4, duration: 0.8, ease: "easeOut" }}
                                                            className="absolute left-0 top-0 h-full bg-blue-500"
                                                        />
                                                        {/* Right (Red) - Anchored Right */}
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${100 - myRatio}%` }}
                                                            transition={{ delay: 0.5 + idx * 0.4, duration: 0.8, ease: "easeOut" }}
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
                                                            transition={{ delay: 0.8 + idx * 0.4, type: "spring" }}
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
                                            transition={{ delay: 0.5 + gameState.roundScores.length * 0.4 }}
                                            className="grid grid-cols-4 p-4 bg-white/5 border-t-2 border-white/10 items-center font-mono"
                                        >
                                            <div className="text-left pl-4 text-yellow-400 font-black">{t('game.total')}</div>
                                            <div className="text-blue-400 font-black text-2xl">{totalScores.my}</div>
                                            <div className="text-red-400 font-black text-2xl">{totalScores.op}</div>
                                            <div>
                                                {totalScores.my > totalScores.op ? (
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
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            transition={{ delay: 0.8 + gameState.roundScores.length * 0.4 }}
                                            className="mb-8 p-4 bg-white/10 rounded-xl border border-white/20 overflow-hidden"
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
                                        transition={{ delay: 1.5 + (gameState.roundScores.length + 1) * 0.4 }}
                                        onClick={() => navigate('/')}
                                        disabled={!isButtonEnabled}
                                        className={`w-full py-4 font-bold text-xl rounded-xl transition-all ${isButtonEnabled
                                            ? 'bg-white text-black hover:bg-gray-200'
                                            : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'
                                            }`}
                                    >
                                        {isButtonEnabled ? t('game.returnMenu') : t('common.loading')}
                                    </motion.button>
                                </>
                            )}
                        </motion.div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default Game;
