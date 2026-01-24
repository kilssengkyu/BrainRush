import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';

import { useSound } from '../../contexts/SoundContext';

interface FillBlanksProps {
    seed: string | null;
    onScore: (amount: number) => void;
}

const FillBlanks: React.FC<FillBlanksProps> = ({ seed, onScore }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [panelIndex, setPanelIndex] = useState(0);
    const [shakeId, setShakeId] = useState<number | null>(null);
    const [animationKey, setAnimationKey] = useState(0);

    // Difficulty Configuration
    // Level 1 (0-2): Addition (2 options)
    // Level 2 (3-5): Subtraction (3 options)
    // Level 3 (6+): Multiplication (4 options)
    const getLevel = (index: number) => {
        if (index < 3) return 1;
        if (index < 6) return 2;
        return 3;
    };

    const currentProblem = useMemo(() => {
        if (!seed) return null;

        const rng = new SeededRandom(`${seed}_blank_${panelIndex}`);
        const level = getLevel(panelIndex);

        let expression = '';
        let answer = 0;

        // --- Equation Generation Logic ---
        // Determine operation type
        let opType = 'add';
        if (level === 1) opType = 'add';
        else if (level === 2) opType = 'sub';
        else {
            // Level 3+: Mix Add, Sub, Mul
            const types = ['add', 'sub', 'mul'];
            opType = types[Math.floor(rng.next() * types.length)];
        }

        // --- Equation Generation Logic ---
        if (opType === 'add') {
            // Addition: A + B = C
            const a = Math.floor(rng.next() * 9) + 1;
            const b = Math.floor(rng.next() * 9) + 1;
            const c = a + b;

            // Randomly hide A or B
            if (rng.next() > 0.5) {
                // Hide A: ? + B = C
                answer = a;
                expression = `? + ${b} = ${c}`;
            } else {
                // Hide B: A + ? = C
                answer = b;
                expression = `${a} + ? = ${c}`;
            }
        } else if (opType === 'sub') {
            // Subtraction: A - B = C
            // Ensure positive result: A > B
            const b = Math.floor(rng.next() * 9) + 1;
            const c = Math.floor(rng.next() * 9) + 1;
            const a = b + c; // So A - B = C is valid

            // Randomly hide A or B (We usually don't hide result C in "fill blank", usually middle terms)
            // Pattern 1: ? - B = C (Ans A)
            // Pattern 2: A - ? = C (Ans B)
            if (rng.next() > 0.5) {
                answer = a;
                expression = `? - ${b} = ${c}`;
            } else {
                answer = b;
                expression = `${a} - ? = ${c}`;
            }
        } else {
            // Multiplication: A * B = C
            const a = Math.floor(rng.next() * 8) + 2; // 2~9
            const b = Math.floor(rng.next() * 8) + 2; // 2~9
            const c = a * b;

            // Randomly hide A or B
            if (rng.next() > 0.5) {
                answer = a;
                expression = `? × ${b} = ${c}`;
            } else {
                answer = b;
                expression = `${a} × ? = ${c}`;
            }
        }

        // --- Option Generation Logic ---
        // Level 1: 2 options
        // Level 2: 3 options
        // Level 3: 4 options
        const optionCount = level === 1 ? 2 : (level === 2 ? 3 : 4);
        const options = new Set<number>();
        options.add(answer);

        while (options.size < optionCount) {
            // Generate distractors close to answer
            const offset = (rng.next() > 0.5 ? 1 : -1) * (Math.floor(rng.next() * 3) + 1);
            let distractor = answer + offset;

            // Avoid negative numbers if appropriate (though inputs are positive integers here)
            if (distractor <= 0) distractor = answer + Math.abs(offset) + 1;

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

            <h2 className="text-3xl font-black text-white mb-2 drop-shadow-md">
                {t('fillBlanks.title')}
            </h2>
            <div className="text-yellow-400 font-bold text-lg mb-8">
                {t('fillBlanks.instruction')}
            </div>

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
                    <div className="text-5xl font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] tracking-wider">
                        {/* Highlight the question mark */}
                        {currentProblem.expression.split('?').map((part, i, arr) => (
                            <React.Fragment key={i}>
                                {part}
                                {i < arr.length - 1 && (
                                    <span className="text-yellow-400 border-b-4 border-yellow-400 px-2 mx-1 inline-block bg-white/10 rounded">?</span>
                                )}
                            </React.Fragment>
                        ))}
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
                        className={`h-24 rounded-2xl flex items-center justify-center font-bold bg-gray-800 border-b-4 border-gray-950 active:border-b-0 active:translate-y-1 hover:bg-gray-700 transition-all ${currentProblem.options.length === 4 ? 'text-3xl' : 'text-4xl'}`}
                    >
                        {opt}
                    </motion.button>
                ))}
            </div>
        </div>
    );
};

export default FillBlanks;
