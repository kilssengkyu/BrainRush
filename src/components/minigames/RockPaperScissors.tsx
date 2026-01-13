import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

type Move = 'rock' | 'paper' | 'scissors';

interface RPSProps {
    onMoveSelected: (move: Move) => void;
    targetMove: Move | null;
    phase: 'countdown' | 'playing' | 'result';
    resultMessage: string | null;
    round: number;
    phaseEndAt: string | null;
    serverOffset: number;
    isReverse?: boolean;
}

const MOVES: Move[] = ['rock', 'paper', 'scissors'];

const RockPaperScissors: React.FC<RPSProps> = ({
    onMoveSelected,
    targetMove,
    phase,
    resultMessage,
    round,
    phaseEndAt,
    serverOffset,
    isReverse = false
}) => {
    const { t } = useTranslation();
    const [shake, setShake] = useState<Move | null>(null);
    const [countdown, setCountdown] = useState<string | null>(null);
    const [elapsedTime, setElapsedTime] = useState<number>(0);
    const [selectedMove, setSelectedMove] = useState<Move | null>(null);
    const startTimeRef = React.useRef<number>(0);

    // Timer Logic
    React.useEffect(() => {
        let animationFrameId: number = 0;

        const updateTimer = () => {
            if (phase === 'playing' && startTimeRef.current > 0 && !selectedMove) {
                const now = Date.now();
                setElapsedTime(now - startTimeRef.current);
                animationFrameId = requestAnimationFrame(updateTimer);
            }
        };

        if (phase === 'playing') {
            startTimeRef.current = Date.now();
            setSelectedItem(null); // Reset selection
            setElapsedTime(0);
            updateTimer();
        } else if (phase === 'result') {
            cancelAnimationFrame(animationFrameId);
        }

        return () => cancelAnimationFrame(animationFrameId);
    }, [phase]);

    // Internal helper to set selection
    const setSelectedItem = (val: Move | null) => setSelectedMove(val);

    // Precise Countdown Logic
    React.useEffect(() => {
        if (phase === 'countdown' && phaseEndAt) {
            let animationFrameId: number;

            const animate = () => {
                const now = Date.now() + serverOffset;
                const target = new Date(phaseEndAt).getTime();
                const diff = (target - now) / 1000;

                if (diff > 0) {
                    setCountdown(diff.toFixed(1)); // Show 1 decimal place
                    animationFrameId = requestAnimationFrame(animate);
                } else {
                    setCountdown(isReverse ? 'LOSE!' : 'START!');
                }
            };

            animationFrameId = requestAnimationFrame(animate);
            return () => cancelAnimationFrame(animationFrameId);
        } else {
            setCountdown(null);
        }
    }, [phase, phaseEndAt, serverOffset, isReverse]);

    const handlePress = (move: Move) => {
        if (phase !== 'playing' || !targetMove || selectedMove) return;

        // Determine correct move
        let correctMove: Move;
        if (!isReverse) {
            // Normal: Win
            if (targetMove === 'rock') correctMove = 'paper';
            else if (targetMove === 'paper') correctMove = 'scissors';
            else correctMove = 'rock';
        } else {
            // Reverse: Lose
            if (targetMove === 'rock') correctMove = 'scissors';
            else if (targetMove === 'paper') correctMove = 'rock';
            else correctMove = 'paper';
        }

        if (move === correctMove) {
            const endTime = Date.now();
            setElapsedTime(endTime - startTimeRef.current);
            setSelectedMove(move);
            onMoveSelected(move);
        } else {
            // Wrong move feedback
            setShake(move);
            setTimeout(() => setShake(null), 500);
        }
    };

    // Helper to format result message
    const getResultText = (msg: string | null) => {
        if (!msg) return '';
        if (msg === 'WIN') return t('game.victory'); // Reuse victory/defeat or win/lose
        if (msg === 'LOSE') return t('game.defeat');
        if (msg === 'DRAW') return t('game.draw');
        return msg;
    };

    return (
        <div className="flex flex-col items-center justify-center w-full h-full gap-12">

            {/* Round Info */}
            <h2 className="absolute top-4 text-2xl font-bold text-gray-500">
                {t('rps.round')} {round}
                {isReverse && <span className="ml-2 text-red-500 font-black">({t('rps.reverse')})</span>}
            </h2>

            {/* Central Area: Info based on Phase */}
            <div className="relative flex items-center justify-center w-64 h-64">
                <AnimatePresence mode="wait">
                    {phase === 'countdown' && (
                        <div className="flex flex-col items-center gap-4">
                            {/* Game Title */}
                            <motion.div
                                initial={{ y: -20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 20, opacity: 0 }}
                                className={`text-3xl font-bold whitespace-nowrap ${isReverse ? 'text-red-500' : 'text-blue-500'}`}
                            >
                                {isReverse ? t('rps.titleLose') : t('rps.titleWin')}
                            </motion.div>

                            {/* Countdown / Start */}
                            <motion.div
                                key="waiting"
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{
                                    scale: 1,
                                    opacity: 1,
                                    textShadow: isReverse ? "0 0 10px #ef4444" : "0 0 10px #3b82f6",
                                    color: isReverse ? "#ef4444" : "#60a5fa"
                                }}
                                exit={{ scale: 2, opacity: 0 }}
                                className="text-6xl font-black text-center font-mono"
                            >
                                {countdown || t('rps.ready')}
                            </motion.div>
                        </div>
                    )}

                    {phase === 'playing' && targetMove && (
                        <motion.div
                            key="target"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1, rotate: [0, -10, 10, 0] }}
                            className="flex flex-col items-center"
                        >
                            <div className="text-9xl filter drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]">
                                {targetMove === 'rock' && '✊'}
                                {targetMove === 'paper' && '✋'}
                                {targetMove === 'scissors' && '✌️'}
                            </div>
                            <p className={`mt-4 text-xl font-bold animate-pulse ${isReverse ? 'text-red-500 text-3xl' : 'text-blue-400'}`}>
                                {isReverse ? t('rps.lose') : t('rps.beatIt')}
                            </p>
                        </motion.div>
                    )}

                    {phase === 'result' && (
                        <motion.div
                            key="result"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1.2, opacity: 1 }}
                            className={`text-6xl font-black ${resultMessage === 'WIN' ? 'text-green-500' : 'text-red-500'}`}
                        >
                            {getResultText(resultMessage)}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Input Buttons */}
            <div className="flex gap-6">
                {MOVES.map((move) => (
                    <motion.button
                        key={move}
                        onClick={() => handlePress(move)}
                        disabled={phase !== 'playing'}
                        animate={shake === move ? { x: [-10, 10, -10, 10, 0], backgroundColor: "#ef4444" } : {}}
                        transition={{ duration: 0.4 }}
                        className={`w-24 h-24 rounded-2xl border-2 flex items-center justify-center text-4xl transition-all duration-100
                    ${phase === 'playing'
                                ? 'bg-gray-800 border-gray-600 hover:border-white hover:bg-gray-700 active:scale-95 cursor-pointer'
                                : 'bg-gray-900 border-gray-800 opacity-50 cursor-not-allowed'}
                  `}
                    >
                        {move === 'rock' && '✊'}
                        {move === 'paper' && '✋'}
                        {move === 'scissors' && '✌️'}
                    </motion.button>
                ))}
            </div>

            {/* Timer Display */}
            <div className={`absolute bottom-8 text-2xl font-mono font-bold transition-all duration-300 ${phase === 'playing' ? 'text-gray-400' :
                (selectedMove) ? 'text-yellow-400 scale-110' : 'opacity-0'
                }`}>
                {phase === 'playing' ? (
                    <span>{(elapsedTime / 1000).toFixed(2)}s</span>
                ) : (selectedMove) ? (
                    <span>{t('game.myTime')}: {(elapsedTime / 1000).toFixed(2)}s</span>
                ) : null}
            </div>

        </div>
    );
};

export default RockPaperScissors;
