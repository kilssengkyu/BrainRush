import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';

interface NumberOrderProps {
    seed: string | null;
    onScore: (amount: number) => void;
}

const NumberOrder: React.FC<NumberOrderProps> = ({ seed, onScore }) => {
    const { t } = useTranslation();
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
    const { gridItems, sortedAnswer, currentLevel } = useMemo(() => {
        if (!seed) return { gridItems: [], sortedAnswer: [], currentLevel: 1 };

        const rng = new SeededRandom(`${seed}_num_${panelIndex}`);
        const { count, max, level } = getDifficulty(panelIndex);

        // Generate 'count' unique random numbers
        const nums = new Set<number>();
        while (nums.size < count) {
            const n = Math.floor(rng.next() * max) + 1;
            nums.add(n);
        }

        const numberArray = Array.from(nums);
        const sorted = [...numberArray].sort((a, b) => a - b); // Answer key (ASC)

        // Create Sparse Grid (9 slots)
        // Fill remaining slots with null
        const totalSlots = 9;
        const slots: (number | null)[] = [
            ...numberArray,
            ...Array(totalSlots - numberArray.length).fill(null)
        ];

        // Shuffle positions
        const shuffledGrid = rng.shuffle(slots);

        return { gridItems: shuffledGrid, sortedAnswer: sorted, currentLevel: level };
    }, [seed, panelIndex]);

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
            setShakeId(num);
            setTimeout(() => setShakeId(null), 400);
        }
    };

    if (!seed) return <div className="text-white">Loading...</div>;

    return (
        <div className="flex flex-col items-center justify-center w-full h-full gap-6 relative">
            {/* Header / Instructions */}
            <div className="flex flex-col items-center gap-2">
                <h2 className="text-2xl font-bold text-blue-400">
                    {t('number.title')}
                </h2>
                <div className="text-gray-400 text-sm">{t('number.instruction')}</div>
                <div className="text-gray-500 font-mono text-sm">
                    Level: {currentLevel} | Panel: {panelIndex + 1}
                </div>
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
                                            ? { x: [-5, 5, -5, 5, 0], backgroundColor: '#ef4444' }
                                            : clearedNumbers.includes(num)
                                                ? { scale: 0.9, opacity: 0, backgroundColor: '#22c55e' }
                                                : { scale: 1, opacity: 1 }
                                    }
                                    style={{
                                        opacity: clearedNumbers.includes(num) ? 0.2 : 1,
                                        pointerEvents: clearedNumbers.includes(num) ? 'none' : 'auto'
                                    }}
                                    className="w-full h-full rounded-2xl flex items-center justify-center text-4xl font-bold text-white border-2 border-gray-600 bg-gray-800 hover:border-white shadow-lg active:scale-95 transition-colors"
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

export default NumberOrder;
