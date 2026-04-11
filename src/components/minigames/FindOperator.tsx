import React, { useState, useMemo } from 'react';
import { usePanelProgress } from '../../hooks/usePanelProgress';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';

import { useSound } from '../../contexts/SoundContext';

interface FindOperatorProps {
    seed: string | null;
    onScore: (amount: number) => void;
    isPlaying: boolean;
}

const evaluateOperator = (a: number, b: number, op: string): number | null => {
    if (op === '+') return a + b;
    if (op === '-') return a - b;
    if (op === '×') return a * b;
    if (op === '÷') {
        if (b === 0) return null;
        const div = a / b;
        return Number.isInteger(div) ? div : null;
    }
    return null;
};

const FindOperator: React.FC<FindOperatorProps> = ({ seed, onScore, isPlaying }) => {
    const WRONG_COOLDOWN_MS = 400;
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [panelIndex, setPanelIndex] = usePanelProgress(seed);
    const [shakeId, setShakeId] = useState<string | null>(null);
    const [animationKey, setAnimationKey] = useState(0);
    const [isInputLocked, setIsInputLocked] = useState(false);
    const [isWrongFlash, setIsWrongFlash] = useState(false);

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

        // Determine available operators for this level
        const ops = ['+', '-'];
        if (level >= 2) ops.push('×');
        if (level >= 3) ops.push('÷');

        let a = 0;
        let b = 0;
        let c = 0;
        let operator = ''; // The single correct answer symbol
        const maxAttempts = 120;
        let found = false;

        // Generate only problems that have exactly one correct operator in current option pool.
        for (let i = 0; i < maxAttempts; i += 1) {
            const picked = ops[Math.floor(rng.next() * ops.length)];
            let nextA = 0;
            let nextB = 0;
            let nextC = 0;

            if (picked === '+') {
                nextA = Math.floor(rng.next() * 9) + 1;
                nextB = Math.floor(rng.next() * 9) + 1;
                nextC = nextA + nextB;
            } else if (picked === '-') {
                nextB = Math.floor(rng.next() * 9) + 1;
                nextC = Math.floor(rng.next() * 9) + 1;
                nextA = nextB + nextC;
            } else if (picked === '×') {
                nextA = Math.floor(rng.next() * 8) + 2; // 2~9
                nextB = Math.floor(rng.next() * 8) + 2;
                nextC = nextA * nextB;
            } else if (picked === '÷') {
                const divisor = Math.floor(rng.next() * 8) + 2; // 2~9
                const quotient = Math.floor(rng.next() * 8) + 2; // 2~9
                nextA = divisor * quotient;
                nextB = divisor;
                nextC = quotient;
            }

            const validOps = ops.filter((op) => evaluateOperator(nextA, nextB, op) === nextC);
            if (validOps.length === 1) {
                a = nextA;
                b = nextB;
                c = nextC;
                operator = validOps[0];
                found = true;
                break;
            }
        }

        // Fallback (extremely rare): force a unique subtraction problem.
        if (!found) {
            b = 9;
            c = 8;
            a = b + c; // 17 ? 9 = 8  => only '-'
            operator = '-';
        }

        const options = rng.shuffle([...ops]);

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
        if (!currentProblem || !isPlaying || isInputLocked) return;

        const scoreBase = 60 + (panelIndex * 5);

        if (selected === currentProblem.operator) {
            // Correct
            setIsInputLocked(true);
            onScore(scoreBase);
            playSound('correct');
            setTimeout(() => {
                setPanelIndex(prev => prev + 1);
                setAnimationKey(prev => prev + 1);
                setIsInputLocked(false);
            }, 150);
        } else {
            // Wrong
            setIsInputLocked(true);
            setIsWrongFlash(true);
            onScore(-scoreBase); // Penalty
            playSound('error');
            setShakeId(selected);
            setTimeout(() => {
                setShakeId(null);
                setIsInputLocked(false);
                setIsWrongFlash(false);
            }, WRONG_COOLDOWN_MS);
        }
    };

    if (!currentProblem) return <div className="text-slate-900 dark:text-white">{t('common.loading')}</div>;

    return (
        <div className="flex flex-col items-center justify-center w-full h-full gap-8 relative">
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
                    <div className="text-6xl font-black text-slate-900 dark:text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] tracking-wider flex items-center gap-4">
                        <span>{currentProblem.a}</span>
                        <span className="text-yellow-400 border-b-4 border-yellow-400 px-2 bg-white/10 rounded w-16 h-20 flex items-center justify-center">?</span>
                        <span>{currentProblem.b}</span>
                        <span className="text-slate-500 dark:text-gray-400">=</span>
                        <span>{currentProblem.c}</span>
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Options Grid */}
            <div className={`grid gap-4 w-full max-w-md ${currentProblem.options.length === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {currentProblem.options.map((opt) => (
                    <motion.button
                        key={`${panelIndex}-${opt}`}
                        disabled={isInputLocked || !isPlaying}
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
                        animate={
                            isWrongFlash
                                ? { backgroundColor: '#ef4444' }
                                : shakeId === opt
                                    ? { x: [-5, 5, -5, 5, 0], backgroundColor: '#ef4444' }
                                    : {}
                        }
                        whileTap={{ scale: 0.95 }}
                        className={`h-24 rounded-2xl flex items-center justify-center text-5xl font-bold bg-white dark:bg-gray-800 border-b-4 border-slate-300 dark:border-gray-950 active:border-b-0 active:translate-y-1 hover:bg-slate-100 dark:hover:bg-gray-700 transition-all ${opt === '×' || opt === '÷' ? 'text-blue-500 dark:text-blue-400' : 'text-slate-900 dark:text-white'
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
