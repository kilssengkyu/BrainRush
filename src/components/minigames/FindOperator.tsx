import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';

import { useSound } from '../../contexts/SoundContext';

interface FindOperatorProps {
    seed: string | null;
    onScore: (amount: number) => void;
    isPlaying: boolean;
}

const FindOperator: React.FC<FindOperatorProps> = ({ seed, onScore, isPlaying }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [panelIndex, setPanelIndex] = useState(0);
    const [shakeId, setShakeId] = useState<string | null>(null);
    const [animationKey, setAnimationKey] = useState(0);

    // Difficulty Configuration
    // Level 1 (0-2): Addition / Subtraction (2 options: +, -)
    // Level 2 (3-5): Add Multiplication (3 options: +, -, ×)
    // Level 3 (6+): Add Division (4 options: +, -, ×, ÷)
    const getLevel = (index: number) => {
        if (index < 3) return 1;
        if (index < 6) return 2;
        return 3;
    };

    const currentProblem = useMemo(() => {
        if (!seed) return null;

        const rng = new SeededRandom(`${seed}_operator_${panelIndex}`);
        const level = getLevel(panelIndex);

        let a = 0;
        let b = 0;
        let c = 0;
        let operator = ''; // The answer character: '+', '-', '×', '÷'

        // Determine available operators for this level
        const ops = ['+', '-'];
        if (level >= 2) ops.push('×');
        if (level >= 3) ops.push('÷');

        // Pick an operator
        operator = ops[Math.floor(rng.next() * ops.length)];

        // Generate numbers based on operator
        if (operator === '+') {
            // A + B = C
            a = Math.floor(rng.next() * 9) + 1;
            b = Math.floor(rng.next() * 9) + 1;
            c = a + b;
        } else if (operator === '-') {
            // A - B = C
            b = Math.floor(rng.next() * 9) + 1;
            c = Math.floor(rng.next() * 9) + 1;
            a = b + c; // Ensure A - B > 0
        } else if (operator === '×') {
            // A * B = C
            a = Math.floor(rng.next() * 8) + 2; // 2~9
            b = Math.floor(rng.next() * 8) + 2;
            c = a * b;
        } else if (operator === '÷') {
            // A / B = C -> Generated as C * B = A
            const divisor = Math.floor(rng.next() * 8) + 2; // B (2~9)
            const quotient = Math.floor(rng.next() * 8) + 2; // C (2~9)
            a = divisor * quotient; // A
            b = divisor;
            c = quotient;
            // Display: A ? B = C
        }

        // --- Option Generation Logic ---
        // Level 1: +, - (2 opts)
        // Level 2: +, -, × (3 opts)
        // Level 3: +, -, ×, ÷ (4 opts)
        // Instead of random distractors, simpler logic: just use the pool of operators for that level as options.
        // Or to make it harder/standard, always show standard set?
        // User requested: "Location of options must change". 
        // We will just use the `ops` array as correct options for that level.

        // BUT wait, level 2 has 3 options? +, -, *.
        // Ideally we want consistent button layout or dynamic?
        // Let's generate options from the available pool for that level.

        let options = [...ops];
        options = rng.shuffle(options);

        // Position changes randomly because shuffle.

        return {
            a,
            b,
            c,
            operator,
            options,
            level
        };

    }, [seed, panelIndex]);


    const handleOptionClick = (selected: string) => {
        if (!currentProblem || !isPlaying) return;

        const scoreBase = 30 + (panelIndex * 5);

        if (selected === currentProblem.operator) {
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

            <h2 className="text-3xl font-black text-white mb-2 drop-shadow-md">
                {t('findOperator.title')}
            </h2>
            <div className="text-yellow-400 font-bold text-lg mb-8">
                {t('findOperator.instruction')}
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
                    <div className="text-6xl font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] tracking-wider flex items-center gap-4">
                        <span>{currentProblem.a}</span>
                        <span className="text-yellow-400 border-b-4 border-yellow-400 px-2 bg-white/10 rounded w-16 h-20 flex items-center justify-center">?</span>
                        <span>{currentProblem.b}</span>
                        <span className="text-gray-400">=</span>
                        <span>{currentProblem.c}</span>
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Options Grid */}
            <div className={`grid gap-4 w-full max-w-md ${currentProblem.options.length === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {currentProblem.options.map((opt) => (
                    <motion.button
                        key={`${panelIndex}-${opt}`}
                        onPointerDown={(e) => {
                            e.preventDefault();
                            if (e.currentTarget.setPointerCapture) {
                                try {
                                    e.currentTarget.setPointerCapture(e.pointerId);
                                } catch {
                                    // Ignore capture errors on unsupported pointer types
                                }
                            }
                            handleOptionClick(opt);
                        }}
                        animate={shakeId === opt ? { x: [-5, 5, -5, 5, 0], backgroundColor: '#ef4444' } : {}}
                        whileTap={{ scale: 0.95 }}
                        className={`h-24 rounded-2xl flex items-center justify-center text-5xl font-bold bg-gray-800 border-b-4 border-gray-950 active:border-b-0 active:translate-y-1 hover:bg-gray-700 transition-all ${opt === '×' || opt === '÷' ? 'text-blue-400' : 'text-white'
                            }`}
                    >
                        {opt}
                    </motion.button>
                ))}
            </div>
        </div>
    );
};

export default FindOperator;
