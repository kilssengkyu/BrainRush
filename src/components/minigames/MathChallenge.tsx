import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';
import { useSound } from '../../contexts/SoundContext';

interface MathChallengeProps {
    seed: string | null;
    onScore: (amount: number) => void;
}

const MathChallenge: React.FC<MathChallengeProps> = ({ seed, onScore }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [panelIndex, setPanelIndex] = useState(0);
    const [shakeId, setShakeId] = useState<number | null>(null);
    const [animationKey, setAnimationKey] = useState(0);

    // Difficulty Configuration
    // Level 1 (0-2): 1d + 1d (3 opts)
    // Level 2 (3-5): 1d + 1d + 1d (3 opts)
    // Level 3 (6-8): Add Subtraction (3 opts)
    // Level 4 (9-11): Add 2-digit (one) (3 opts)
    // Level 5 (12-14): Add 2-digit (two) (3 opts)
    // Level 6 (15+): 4 Options
    const getLevel = (index: number) => {
        if (index < 3) return 1;
        if (index < 6) return 2;
        if (index < 9) return 3;
        if (index < 12) return 4;
        if (index < 15) return 5;
        return 6;
    };

    const currentProblem = useMemo(() => {
        if (!seed) return null;

        const rng = new SeededRandom(`${seed}_math_${panelIndex}`);
        const level = getLevel(panelIndex);

        let expression = '';
        let answer = 0;

        // --- Equation Generation Logic ---
        if (level === 1) {
            // 1d + 1d
            const a = Math.floor(rng.next() * 9) + 1;
            const b = Math.floor(rng.next() * 9) + 1;
            expression = `${a} + ${b}`;
            answer = a + b;
        } else if (level === 2) {
            // 1d + 1d + 1d
            const a = Math.floor(rng.next() * 9) + 1;
            const b = Math.floor(rng.next() * 9) + 1;
            const c = Math.floor(rng.next() * 9) + 1;
            expression = `${a} + ${b} + ${c}`;
            answer = a + b + c;
        } else if (level === 3) {
            // Add Subtraction (1d +/- 1d +/- 1d)
            let a = Math.floor(rng.next() * 9) + 1;
            let b = Math.floor(rng.next() * 9) + 1;
            const op = rng.next() > 0.5 ? '+' : '-';

            // Ensure first result is non-negative
            if (op === '-' && b > a) [a, b] = [b, a];

            expression = `${a} ${op} ${b}`;
            answer = op === '+' ? a + b : a - b;

            // Add 3rd term
            let c = Math.floor(rng.next() * 9) + 1;
            let op2 = rng.next() > 0.5 ? '+' : '-';

            // Ensure final result is non-negative
            if (op2 === '-' && c > answer) {
                // Option A: Flip to addition
                op2 = '+';
                // Option B: Reduce c to be <= answer? (Might restrict randomness too much)
                // Flipping to + is safer and keeps flow
            }

            expression += ` ${op2} ${c}`;
            answer = op2 === '+' ? answer + c : answer - c;

        } else if (level === 4) {
            // Add one 2-digit (10-99)
            const isFirstTwoDigit = rng.next() > 0.5;
            let a = isFirstTwoDigit ? Math.floor(rng.next() * 90) + 10 : Math.floor(rng.next() * 9) + 1;
            let b = isFirstTwoDigit ? Math.floor(rng.next() * 9) + 1 : Math.floor(rng.next() * 90) + 10;

            const op = (level >= 3 && rng.next() > 0.5) ? '-' : '+';

            if (op === '-' && b > a) [a, b] = [b, a];

            expression = `${a} ${op} ${b}`;
            answer = op === '+' ? a + b : a - b;

        } else if (level >= 5) {
            // Two 2-digit numbers
            let a = Math.floor(rng.next() * 90) + 10;
            let b = Math.floor(rng.next() * 90) + 10;
            const op = rng.next() > 0.5 ? '+' : '-';

            if (op === '-' && b > a) [a, b] = [b, a];

            expression = `${a} ${op} ${b}`;
            answer = op === '+' ? a + b : a - b;
        }

        // --- Option Generation Logic ---
        const optionCount = level >= 6 ? 4 : 3;
        const options = new Set<number>();
        options.add(answer);

        while (options.size < optionCount) {
            // Generate distractors close to answer
            const distractor = answer + (rng.next() > 0.5 ? 1 : -1) * (Math.floor(rng.next() * 5) + 1);

            if (distractor !== answer) {
                options.add(distractor);
            }
        }

        return {
            expression,
            answer,
            options: rng.shuffle(Array.from(options)),
            level
        };

    }, [seed, panelIndex]);


    const handleOptionClick = (selected: number) => {
        if (!currentProblem) return;

        const scoreBase = 20 + (panelIndex * 5);

        if (selected === currentProblem.answer) {
            // Correct
            onScore(scoreBase);
            playSound('correct');
            setTimeout(() => {
                setPanelIndex(prev => prev + 1);
                setAnimationKey(prev => prev + 1);
            }, 150);
        } else {
            // Wrong
            onScore(-scoreBase); // Penalty
            playSound('error');
            setShakeId(selected);
            setTimeout(() => setShakeId(null), 400);
        }
    };

    if (!currentProblem) return <div className="text-white">{t('common.loading')}</div>;

    return (
        <div className="flex flex-col items-center justify-center w-full h-full gap-8 relative">

            {/* Header Info */}
            {/* Header Info - REMOVED */}

            <h2 className="text-3xl font-black text-white mb-2 drop-shadow-md">
                {t('math.title')}
            </h2>
            <div className="text-yellow-400 font-bold text-lg mb-8">{t('math.instruction')}</div>

            {/* Equation Display */}
            <AnimatePresence mode="popLayout">
                <motion.div
                    key={animationKey}
                    initial={{ scale: 0.8, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 1.2, opacity: 0, y: -20 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center justify-center w-full h-40"
                >
                    <div className="text-6xl font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] tracking-wider">
                        {currentProblem.expression.replace(/\*/g, '×').replace(/\-/g, '−')}
                        {/* Use nicer unicode symbols if needed */}
                        <span className="ml-4 text-gray-400">= ?</span>
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Options Grid */}
            <div className={`grid gap-4 w-full max-w-md ${currentProblem.options.length === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {currentProblem.options.map((opt) => (
                    <motion.button
                        key={`${panelIndex}-${opt}`}
                        onMouseDown={() => handleOptionClick(opt)}
                        animate={shakeId === opt ? { x: [-5, 5, -5, 5, 0], backgroundColor: '#ef4444' } : {}}
                        whileTap={{ scale: 0.95 }}
                        className={`h-24 rounded-2xl flex items-center justify-center text-4xl font-bold bg-gray-800 border-b-4 border-gray-950 active:border-b-0 active:translate-y-1 hover:bg-gray-700 transition-all ${currentProblem.options.length === 4 ? 'text-3xl' : 'text-4xl'
                            }`}
                    >
                        {opt}
                    </motion.button>
                ))}
            </div>
        </div>
    );
};

export default MathChallenge;
