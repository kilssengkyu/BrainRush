import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { usePanelProgress } from '../../hooks/usePanelProgress';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';
import { useSound } from '../../contexts/SoundContext';
import { useTheme } from '../../contexts/ThemeContext';

interface MakeZeroProps {
    seed: string | null;
    onScore: (amount: number) => void;
    isPlaying: boolean;
}

// Difficulty configuration
// Level 1 (0-2):   (a+b)-(c+d)     4 buttons (exact)
// Level 2 (3-5):   (a+b)-(c+d)     5 buttons (1 dummy)
// Level 3 (6-9):   (a+b)-(c+d)     6 buttons (2 dummies)
// Level 4 (10-14): (a+b+c)-(d+e+f) 6 buttons (exact)
// Level 5 (15+):   (a+b+c)-(d+e+f) 8 buttons (2 dummies)

interface LevelConfig {
    slotsPerSide: number; // 2 or 3
    buttonCount: number;  // total buttons shown
    minNum: number;
    maxNum: number;
}

function getLevelConfig(panelIndex: number): LevelConfig {
    if (panelIndex < 3) return { slotsPerSide: 2, buttonCount: 4, minNum: 1, maxNum: 9 };
    if (panelIndex < 6) return { slotsPerSide: 2, buttonCount: 5, minNum: 1, maxNum: 15 };
    if (panelIndex < 10) return { slotsPerSide: 2, buttonCount: 6, minNum: 1, maxNum: 20 };
    if (panelIndex < 15) return { slotsPerSide: 3, buttonCount: 6, minNum: 1, maxNum: 20 };
    return { slotsPerSide: 3, buttonCount: 8, minNum: 5, maxNum: 30 };
}

function generatePuzzle(rng: SeededRandom, config: LevelConfig) {
    const { slotsPerSide, buttonCount, minNum, maxNum } = config;
    const totalSlots = slotsPerSide * 2;
    const dummyCount = buttonCount - totalSlots;

    // Generate answer numbers where left sum === right sum
    for (let attempt = 0; attempt < 500; attempt++) {
        // Generate left side numbers, prefer unique values
        const left: number[] = [];
        for (let i = 0; i < slotsPerSide; i++) {
            let val: number;
            let tries = 0;
            do {
                val = Math.floor(rng.next() * (maxNum - minNum + 1)) + minNum;
                tries++;
            } while (left.includes(val) && tries < 5);
            left.push(val);
        }
        const targetSum = left.reduce((a, b) => a + b, 0);

        // Generate right side numbers that sum to same value
        const right: number[] = [];
        let remaining = targetSum;
        let valid = true;

        for (let i = 0; i < slotsPerSide - 1; i++) {
            const maxVal = Math.min(maxNum, remaining - (slotsPerSide - 1 - i) * minNum);
            const minVal = Math.max(minNum, remaining - (slotsPerSide - 1 - i) * maxNum);
            if (minVal > maxVal) { valid = false; break; }
            const val = Math.floor(rng.next() * (maxVal - minVal + 1)) + minVal;
            right.push(val);
            remaining -= val;
        }

        if (!valid || remaining < minNum || remaining > maxNum) continue;
        right.push(remaining);

        const answerNumbers = [...left, ...right];

        // Check for duplicate numbers — retry most of the time to keep puzzles varied
        const uniqueCount = new Set(answerNumbers).size;
        if (uniqueCount < answerNumbers.length && rng.next() < 0.85) continue;

        // Generate dummy numbers that don't form valid alternatives
        const dummies: number[] = [];
        let dummyAttempts = 0;
        while (dummies.length < dummyCount && dummyAttempts < 200) {
            dummyAttempts++;
            const d = Math.floor(rng.next() * (maxNum - minNum + 1)) + minNum;
            if (answerNumbers.includes(d) || dummies.includes(d)) continue;
            // Ensure dummy can't replace any answer number to form valid solution
            let canReplace = false;
            for (let i = 0; i < totalSlots; i++) {
                const test = [...answerNumbers];
                test[i] = d;
                const leftSum = test.slice(0, slotsPerSide).reduce((a, b) => a + b, 0);
                const rightSum = test.slice(slotsPerSide).reduce((a, b) => a + b, 0);
                if (leftSum === rightSum) { canReplace = true; break; }
            }
            if (!canReplace) dummies.push(d);
        }

        // Fill remaining dummies if needed (fallback: just use numbers far from range)
        while (dummies.length < dummyCount) {
            const d = maxNum + dummies.length + 1;
            if (!answerNumbers.includes(d) && !dummies.includes(d)) {
                dummies.push(d);
            }
        }

        const allButtons = rng.shuffle([...answerNumbers, ...dummies]);

        return {
            answerNumbers, // [left0, left1, ..., right0, right1, ...]
            buttons: allButtons,
            slotsPerSide,
            targetSum,
        };
    }

    // Fallback
    const fallback = slotsPerSide === 2
        ? { answerNumbers: [3, 7, 4, 6], buttons: [3, 7, 4, 6], slotsPerSide: 2, targetSum: 10 }
        : { answerNumbers: [2, 3, 5, 1, 4, 5], buttons: [2, 3, 5, 1, 4, 5], slotsPerSide: 3, targetSum: 10 };
    fallback.buttons = rng.shuffle([...fallback.buttons]);
    return fallback;
}

const MakeZero: React.FC<MakeZeroProps> = ({ seed, onScore, isPlaying }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const { themeMode } = useTheme();
    const isDark = themeMode === 'dark';
    const [panelIndex, setPanelIndex] = usePanelProgress(seed);
    const [filledSlots, setFilledSlots] = useState<(number | null)[]>([]);
    const [usedButtonIndices, setUsedButtonIndices] = useState<Set<number>>(new Set());
    const [animationKey, setAnimationKey] = useState(0);
    const [isSolved, setIsSolved] = useState(false);
    const [showWrong, setShowWrong] = useState(false);

    const puzzle = useMemo(() => {
        if (!seed) return null;
        const rng = new SeededRandom(`${seed}_zero_${panelIndex}`);
        const config = getLevelConfig(panelIndex);
        return generatePuzzle(rng, config);
    }, [seed, panelIndex]);

    const totalSlots = puzzle ? puzzle.slotsPerSide * 2 : 4;

    // Reset filled slots when puzzle changes
    useEffect(() => {
        setFilledSlots(new Array(totalSlots).fill(null));
        setUsedButtonIndices(new Set());
        setIsSolved(false);
        setShowWrong(false);
    }, [panelIndex, totalSlots]);

    // Handle button press — fills next empty slot
    const handleButtonPress = useCallback((buttonIndex: number) => {
        if (isSolved || !isPlaying || !puzzle || showWrong) return;
        if (usedButtonIndices.has(buttonIndex)) return;

        const nextSlot = filledSlots.findIndex(s => s === null);
        if (nextSlot === -1) return;

        const newFilled = [...filledSlots];
        newFilled[nextSlot] = puzzle.buttons[buttonIndex];

        const newUsed = new Set(usedButtonIndices);
        newUsed.add(buttonIndex);

        setFilledSlots(newFilled);
        setUsedButtonIndices(newUsed);
        playSound('click');
    }, [isSolved, isPlaying, puzzle, showWrong, usedButtonIndices, filledSlots, playSound]);

    // Handle slot tap — removes last filled number
    const handleSlotTap = useCallback(() => {
        if (isSolved || !isPlaying || !puzzle || showWrong) return;

        // Find last filled slot
        let lastFilledIdx = -1;
        for (let i = filledSlots.length - 1; i >= 0; i--) {
            if (filledSlots[i] !== null) { lastFilledIdx = i; break; }
        }
        if (lastFilledIdx === -1) return;

        const removedValue = filledSlots[lastFilledIdx];
        const newFilled = [...filledSlots];
        newFilled[lastFilledIdx] = null;

        // Find which button had this value and un-use it
        const newUsed = new Set(usedButtonIndices);
        for (const bi of usedButtonIndices) {
            if (puzzle.buttons[bi] === removedValue) {
                newUsed.delete(bi);
                break;
            }
        }

        setFilledSlots(newFilled);
        setUsedButtonIndices(newUsed);
    }, [isSolved, isPlaying, puzzle, showWrong, filledSlots, usedButtonIndices]);

    // Check answer when all slots filled
    useEffect(() => {
        if (!puzzle || isSolved || showWrong || !isPlaying) return;
        if (filledSlots.length === 0 || filledSlots.some(s => s === null)) return;

        const leftSum = filledSlots.slice(0, puzzle.slotsPerSide).reduce((a, b) => a! + b!, 0)!;
        const rightSum = filledSlots.slice(puzzle.slotsPerSide).reduce((a, b) => a! + b!, 0)!;

        if (leftSum === rightSum) {
            // Correct! 90 points per slot (4 slots=360, 6 slots=540)
            setIsSolved(true);
            onScore(filledSlots.length * 90);
            playSound('correct');
            setTimeout(() => {
                setPanelIndex(prev => prev + 1);
                setAnimationKey(prev => prev + 1);
            }, 300);
        } else {
            // Wrong — show error, reset
            setShowWrong(true);
            onScore(-100);
            playSound('error');
            setTimeout(() => {
                setFilledSlots(new Array(totalSlots).fill(null));
                setUsedButtonIndices(new Set());
                setShowWrong(false);
            }, 400);
        }
    }, [filledSlots, puzzle, isSolved, showWrong, onScore, playSound, totalSlots]);

    if (!puzzle) return <div className="text-slate-900 dark:text-white">{t('common.loading')}</div>;

    const sps = puzzle.slotsPerSide;

    // Build equation display
    const leftSlots = filledSlots.slice(0, sps);
    const rightSlots = filledSlots.slice(sps);

    return (
        <div className="flex flex-col items-center justify-center w-full h-full gap-4 relative select-none">
            {/* Equation */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={`eq-${panelIndex}-${animationKey}`}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="flex items-center gap-1 text-slate-900 dark:text-white font-bold text-lg flex-wrap justify-center"
                    onClick={handleSlotTap}
                >
                    <span className="text-slate-500 dark:text-gray-400 text-2xl">(</span>
                    {leftSlots.map((val, i) => (
                        <React.Fragment key={`l${i}`}>
                            {i > 0 && <span className="text-blue-400 text-xl mx-0.5">+</span>}
                            <motion.span
                                animate={{
                                    backgroundColor: val !== null
                                        ? (showWrong ? '#ef4444' : '#3b82f6')
                                        : (isDark ? '#374151' : '#e2e8f0'),
                                    scale: val !== null ? [1, 1.1, 1] : 1,
                                }}
                                transition={{ duration: 0.15 }}
                                className={`inline-flex items-center justify-center w-12 h-12 rounded-xl text-2xl font-black border-2 border-slate-300 dark:border-gray-600 ${val !== null ? 'text-white' : 'text-slate-500 dark:text-gray-400'}`}
                            >
                                {val !== null ? val : '?'}
                            </motion.span>
                        </React.Fragment>
                    ))}
                    <span className="text-slate-500 dark:text-gray-400 text-2xl">)</span>

                    <span className="text-red-400 text-3xl font-black mx-1">−</span>

                    <span className="text-slate-500 dark:text-gray-400 text-2xl">(</span>
                    {rightSlots.map((val, i) => (
                        <React.Fragment key={`r${i}`}>
                            {i > 0 && <span className="text-blue-400 text-xl mx-0.5">+</span>}
                            <motion.span
                                animate={{
                                    backgroundColor: val !== null
                                        ? (showWrong ? '#ef4444' : '#3b82f6')
                                        : (isDark ? '#374151' : '#e2e8f0'),
                                    scale: val !== null ? [1, 1.1, 1] : 1,
                                }}
                                transition={{ duration: 0.15 }}
                                className={`inline-flex items-center justify-center w-12 h-12 rounded-xl text-2xl font-black border-2 border-slate-300 dark:border-gray-600 ${val !== null ? 'text-white' : 'text-slate-500 dark:text-gray-400'}`}
                            >
                                {val !== null ? val : '?'}
                            </motion.span>
                        </React.Fragment>
                    ))}
                    <span className="text-slate-500 dark:text-gray-400 text-2xl">)</span>

                    <span className="text-yellow-400 text-2xl font-black mx-1">=</span>
                    <span className="text-yellow-400 text-3xl font-black">0</span>
                </motion.div>
            </AnimatePresence >

            {/* Hint: tap to undo — always takes space to prevent layout shift */}
            < div className={`text-xs h-4 ${usedButtonIndices.size > 0 && !isSolved ? 'text-gray-600' : 'text-transparent'}`}>
                {t('zero.undoHint', '수식을 터치하면 되돌립니다')}
            </div >

            {/* Number Buttons */}
            < div className={`grid gap-3 mt-4 ${puzzle.buttons.length <= 4 ? 'grid-cols-4' :
                puzzle.buttons.length <= 6 ? 'grid-cols-3' :
                    'grid-cols-4'
                }`}>
                <AnimatePresence mode="popLayout">
                    {puzzle.buttons.map((num, idx) => {
                        const isUsed = usedButtonIndices.has(idx);
                        return (
                            <motion.button
                                key={`${panelIndex}-btn-${idx}-${animationKey}`}
                                layout
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{
                                    opacity: isUsed ? 0.3 : 1,
                                    backgroundColor: isUsed ? (isDark ? '#111827' : '#cbd5e1') : (isDark ? '#1f2937' : '#f1f5f9'),
                                }}
                                exit={{ scale: 0, opacity: 0 }}
                                whileTap={{ scale: 0.9 }}
                                onPointerDown={(e) => {
                                    e.preventDefault();
                                    if (e.currentTarget.setPointerCapture) {
                                        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ }
                                    }
                                    handleButtonPress(idx);
                                }}
                                disabled={isUsed}
                                className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold text-slate-900 dark:text-white border-2 border-slate-300 dark:border-gray-700 shadow-lg transition-colors"
                            >
                                {num}
                            </motion.button>
                        );
                    })}
                </AnimatePresence>
            </div >
        </div >
    );
};

export default MakeZero;
