import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';

type Move = 'rock' | 'paper' | 'scissors';
const MOVES: Move[] = ['rock', 'paper', 'scissors'];

interface RPSProps {
    seed: string | null;
    onScore: (amount: number) => void;
    // We can also pass 'combo' or 'multiplier' if we want fancier scoring later
}

const RockPaperScissors: React.FC<RPSProps> = ({ seed, onScore }) => {
    const { t } = useTranslation();
    const [index, setIndex] = useState(0);
    const [shake, setShake] = useState<Move | null>(null);
    const [animationKey, setAnimationKey] = useState(0);

    // Initialize RNG
    // We strictly depend on `seed` and `index` to be deterministic.
    const currentProblem = useMemo(() => {
        if (!seed) return null;
        // Unique seed for this turn: seed + index
        const rng = new SeededRandom(`${seed}_${index}`);
        const target = rng.pick(MOVES);
        // 30% Chance of Reverse
        const isReverse = rng.next() < 0.3;
        return { target, isReverse };
    }, [seed, index]);

    // Handle Input
    const handlePress = (move: Move) => {
        if (!currentProblem) return;
        const { target, isReverse } = currentProblem;

        let correctMove: Move;
        if (!isReverse) {
            if (target === 'rock') correctMove = 'paper';
            else if (target === 'paper') correctMove = 'scissors';
            else correctMove = 'rock';
        } else {
            if (target === 'rock') correctMove = 'scissors';
            else if (target === 'paper') correctMove = 'rock';
            else correctMove = 'paper';
        }

        if (move === correctMove) {
            // Correct!
            // Play Sound?
            onScore(100); // 100 Points per correct answer
            setIndex(prev => prev + 1);
            setAnimationKey(prev => prev + 1); // Force re-render animation
        } else {
            // Wrong!
            // Shake effect
            setShake(move);
            setTimeout(() => setShake(null), 400);
            // Optional: Penalty? For now just delay/shake.
        }
    };

    if (!currentProblem) return <div className="text-white">Loading...</div>;

    const { target, isReverse } = currentProblem;

    return (
        <div className="flex flex-col items-center justify-center w-full h-full gap-8">

            {/* Instruction / Title overlay */}
            <div className={`text-3xl font-bold ${isReverse ? 'text-red-500' : 'text-blue-500'}`}>
                {isReverse ? t('rps.titleLose') : t('rps.titleWin')}
            </div>

            {/* Target Display Area */}
            <div className="relative flex items-center justify-center w-64 h-64">
                <AnimatePresence mode="popLayout">
                    <motion.div
                        key={animationKey} // Key change triggers animation
                        initial={{ scale: 0.5, opacity: 0, rotate: -45 }}
                        animate={{ scale: 1, opacity: 1, rotate: 0 }}
                        exit={{ scale: 1.5, opacity: 0 }}
                        transition={{ duration: 0.15 }} // Fast transition for "Rush" feel
                        className="flex flex-col items-center"
                    >
                        <div className="text-9xl filter drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]">
                            {target === 'rock' && '✊'}
                            {target === 'paper' && '✋'}
                            {target === 'scissors' && '✌️'}
                        </div>
                        <p className={`mt-4 text-xl font-bold ${isReverse ? 'text-red-500' : 'text-blue-400'}`}>
                            {isReverse ? t('rps.lose') : t('rps.beatIt')}
                        </p>
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Input Buttons */}
            <div className="flex gap-6 mt-8">
                {MOVES.map((move) => (
                    <motion.button
                        key={move}
                        onMouseDown={() => handlePress(move)} // onMouseDown for faster reaction than onClick
                        animate={shake === move ? { x: [-10, 10, -10, 10, 0], backgroundColor: "#ef4444" } : {}}
                        transition={{ duration: 0.4 }}
                        whileTap={{ scale: 0.9 }}
                        className="w-24 h-24 rounded-2xl border-4 border-gray-600 bg-gray-800 hover:border-white hover:bg-gray-700 flex items-center justify-center text-4xl shadow-xl"
                    >
                        {move === 'rock' && '✊'}
                        {move === 'paper' && '✋'}
                        {move === 'scissors' && '✌️'}
                    </motion.button>
                ))}
            </div>

            <div className="text-gray-500 text-sm mt-4 font-mono">
                Combo: {index}
            </div>
        </div>
    );
};

export default RockPaperScissors;
