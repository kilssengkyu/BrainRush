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
}

const MOVES: Move[] = ['rock', 'paper', 'scissors'];

const RockPaperScissors: React.FC<RPSProps> = ({
    onMoveSelected,
    targetMove,
    phase,
    resultMessage,
    round,
    phaseEndAt,
    serverOffset
}) => {
    const { t } = useTranslation();
    const [shake, setShake] = useState<Move | null>(null);
    const [countdown, setCountdown] = useState<string | null>(null);

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
                    setCountdown('START!');
                }
            };

            animationFrameId = requestAnimationFrame(animate);
            return () => cancelAnimationFrame(animationFrameId);
        } else {
            setCountdown(null);
        }
    }, [phase, phaseEndAt, serverOffset]);

    const handlePress = (move: Move) => {
        if (phase !== 'playing' || !targetMove) return;

        // Determine correct move
        let correctMove: Move;
        if (targetMove === 'rock') correctMove = 'paper';
        else if (targetMove === 'paper') correctMove = 'scissors';
        else correctMove = 'rock';

        if (move === correctMove) {
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
            <h2 className="absolute top-4 text-2xl font-bold text-gray-500">{t('rps.round')} {round}</h2>

            {/* Central Area: Info based on Phase */}
            <div className="relative flex items-center justify-center w-64 h-64">
                <AnimatePresence mode="wait">
                    {phase === 'countdown' && (
                        <motion.div
                            key="waiting"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1, textShadow: "0 0 10px #3b82f6" }}
                            exit={{ scale: 2, opacity: 0 }}
                            className="text-6xl font-black text-blue-400 text-center font-mono"
                        >
                            {countdown || t('rps.ready')}
                        </motion.div>
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
                            <p className="mt-4 text-xl font-bold text-red-500 animate-pulse">{t('rps.beatIt')}</p>
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

        </div>
    );
};

export default RockPaperScissors;
