import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';
import { useSound } from '../../contexts/SoundContext';

interface NumberSortGameProps {
    seed: string | null;
    onScore: (amount: number) => void;
    mode: 'asc' | 'desc';
}

const NumberSortGame: React.FC<NumberSortGameProps> = ({ seed, onScore, mode }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [panelIndex, setPanelIndex] = useState(0);
    const [clearedNumbers, setClearedNumbers] = useState<number[]>([]);
    const [shakeId, setShakeId] = useState<number | null>(null);
    const [animationKey, setAnimationKey] = useState(0);

    // Difficulty Logic
    // Level 1: 3 panels (0-2) -> Count 3, Max 9
    // Level 2: 4 panels (3-6) -> Count 3, Max 50
    // Level 3: 5 panels (7-11) -> Count 4, Max 99
    // Level 4: 6+ panels (12+) -> Count 4, Max 999
    const getDifficulty = (index: number) => {
        if (index < 3) return { count: 3, max: 9, level: 1 };
        if (index < 7) return { count: 3, max: 50, level: 2 };
        if (index < 12) return { count: 4, max: 99, level: 3 };
        return { count: 4, max: 999, level: 4 };
    };

    // Generate Current Panel Data
    const { gridItems, sortedAnswer } = useMemo(() => {
        if (!seed) return { gridItems: [], sortedAnswer: [] };

        const rng = new SeededRandom(`${seed}_${mode}_num_${panelIndex}`);
        const { count, max } = getDifficulty(panelIndex);

        // Generate 'count' unique random numbers
        const nums = new Set<number>();
        while (nums.size < count) {
            const n = Math.floor(rng.next() * max) + 1;
            nums.add(n);
        }

        const numberArray = Array.from(nums);

        // Sort based on mode
        const sorted = [...numberArray].sort((a, b) => mode === 'asc' ? a - b : b - a);

        // Create Sparse Grid (9 slots)
        // Fill remaining slots with null
        const totalSlots = 9;
        const slots: (number | null)[] = [
            ...numberArray,
            ...Array(totalSlots - numberArray.length).fill(null)
        ];

        // Shuffle positions
        const shuffledGrid = rng.shuffle(slots);

        return { gridItems: shuffledGrid, sortedAnswer: sorted };
    }, [seed, panelIndex, mode]);

    const handleNumberClick = (num: number) => {
        if (clearedNumbers.includes(num)) return;

        // Current target is the next number in the sorted answer key
        const nextExpectedIndex = clearedNumbers.length;
        const expected = sortedAnswer[nextExpectedIndex];

        const scoreAmount = 20 + (panelIndex * 5);

        if (num === expected) {
            // Correct
            onScore(scoreAmount);
            const newCleared = [...clearedNumbers, num];
            setClearedNumbers(newCleared);

            // Check if Panel Cleared (Compare length against answer key length)
            if (newCleared.length === sortedAnswer.length) {
                // Bonus
                onScore(100);
                setTimeout(() => {
                    setPanelIndex(prev => prev + 1);
                    setClearedNumbers([]);
                    setAnimationKey(prev => prev + 1);
                }, 250);
            }
        } else {
            // Wrong
            onScore(-scoreAmount); // Penalty Logic
            playSound('error');
            setShakeId(num);
            setTimeout(() => setShakeId(null), 400);
        }
    };

    if (!seed) return <div className="text-white">{t('common.loading')}</div>;

    // Theme Colors
    const titleColor = mode === 'asc' ? 'text-blue-300' : 'text-red-300';
    const cellDefaultColor = 'bg-gray-800';
    const cellErrorColor = '#ef4444'; // Red
    const cellSuccessColor = mode === 'asc' ? '#22c55e' : '#f59e0b'; // Green vs Amber for success? Or just Green/Red separation? 
    // Let's use Green for Asc success, and maybe Amber/Orange for Desc success to differentiate visuals? 
    // Or standard Green is fine for "Correct", but the vibe is different.
    // Let's keep success green for consistency, but maybe the border/hover is different.

    return (
        <div className="flex flex-col items-center justify-center w-full h-full gap-6 relative">
            {/* Header / Instructions */}
            <h2 className={`text-4xl font-black drop-shadow-md mb-2 ${titleColor}`}>
                {mode === 'asc' ? t('number.title') : t('number.titleDesc')}
            </h2>
            <div className={`text-sm mb-4 font-bold ${mode === 'asc' ? 'text-blue-400' : 'text-red-400'} animate-pulse`}>
                {mode === 'asc' ? t('number.instruction') : t('number.instructionDesc')}
            </div>

            {/* Grid Area */}
            <div className="w-80 h-80 relative flex items-center justify-center">
                <AnimatePresence mode="popLayout">
                    <motion.div
                        key={animationKey}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 1.1, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="grid grid-cols-3 gap-3 w-full h-full"
                    >
                        {gridItems.map((item, idx) => {
                            if (item === null) {
                                return <div key={`empty-${idx}`} className="w-full h-full" />;
                            }
                            const num = item;
                            return (
                                <motion.button
                                    key={`${panelIndex}-${num}`}
                                    onMouseDown={() => handleNumberClick(num)}
                                    animate={
                                        shakeId === num
                                            ? { x: [-5, 5, -5, 5, 0], backgroundColor: cellErrorColor }
                                            : clearedNumbers.includes(num)
                                                ? { scale: 0.9, opacity: 0, backgroundColor: cellSuccessColor }
                                                : { scale: 1, opacity: 1 }
                                    }
                                    style={{
                                        opacity: clearedNumbers.includes(num) ? 0.2 : 1,
                                        pointerEvents: clearedNumbers.includes(num) ? 'none' : 'auto'
                                    }}
                                    className={`
                                        w-full h-full rounded-2xl flex items-center justify-center text-4xl font-bold text-white border-2 
                                        ${mode === 'asc' ? 'border-blue-900/50 hover:border-blue-400' : 'border-red-900/50 hover:border-red-400'} 
                                        ${cellDefaultColor} shadow-lg active:scale-95 transition-colors
                                    `}
                                >
                                    {num}
                                </motion.button>
                            );
                        })}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
};

export default NumberSortGame;
