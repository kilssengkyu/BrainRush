import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';
import { useSound } from '../../contexts/SoundContext';

interface MakeTenProps {
    seed: string | null;
    onScore: (amount: number) => void;
    isPlaying: boolean;
}

const MakeTen: React.FC<MakeTenProps> = ({ seed, onScore, isPlaying }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [panelIndex, setPanelIndex] = useState(0);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [animationKey, setAnimationKey] = useState(0);
    const [isSolved, setIsSolved] = useState(false); // Prevent double scoring

    // Difficulty Configuration
    // Level 1 (0-4): 3 numbers. Target subset sums to 10.
    // Level 2 (5-14): 4 numbers. Target subset sums to 10.
    // Level 3 (15+): 4 numbers. Includes negative numbers.
    const getLevel = (index: number) => {
        if (index < 5) return 1;
        if (index < 15) return 2;
        return 3;
    };

    const countTenSolutions = (numbers: number[]) => {
        let totalSolutions = 0;
        let pairSolutions = 0;
        const n = numbers.length;

        for (let mask = 1; mask < (1 << n); mask += 1) {
            let sum = 0;
            let size = 0;
            for (let i = 0; i < n; i += 1) {
                if (mask & (1 << i)) {
                    sum += numbers[i];
                    size += 1;
                }
            }
            if (sum === 10) {
                totalSolutions += 1;
                if (size === 2) pairSolutions += 1;
            }
        }

        return { totalSolutions, pairSolutions };
    };

    const currentPanel = useMemo(() => {
        if (!seed) return null;

        const rng = new SeededRandom(`${seed}_ten_${panelIndex} `);
        const level = getLevel(panelIndex);

        // 1. Determine Count (3 or 4)
        const count = level === 1 ? 3 : 4;

        // Build panels so "make 10" usually uses exactly two numbers
        // and the valid combination is unique.
        const candidatePairs: Array<[number, number]> = [[1, 9], [2, 8], [3, 7], [4, 6]];
        const distractorPool = level < 3
            ? [1, 2, 3, 4, 5, 6, 7, 8, 9]
            : [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15];

        let validNumbers: number[] | null = null;
        for (let attempt = 0; attempt < 500; attempt += 1) {
            const [a, b] = candidatePairs[Math.floor(rng.next() * candidatePairs.length)];
            const picked = new Set<number>([a, b]);

            while (picked.size < count) {
                const candidate = distractorPool[Math.floor(rng.next() * distractorPool.length)];
                if (candidate === 10 || picked.has(candidate)) continue;
                picked.add(candidate);
            }

            const numbers = Array.from(picked);
            const { totalSolutions, pairSolutions } = countTenSolutions(numbers);
            if (pairSolutions === 1 && totalSolutions === 1) {
                validNumbers = numbers;
                break;
            }
        }

        const fallback = count === 3 ? [1, 9, 4] : [1, 9, 4, 7];
        const shuffled = rng.shuffle(validNumbers ?? fallback);

        return {
            numbers: shuffled,
            level
        };

    }, [seed, panelIndex]);

    // Handle Selection
    const toggleSelection = (index: number) => {
        if (isSolved || !isPlaying) return; // Disable interaction when solved or not playing
        const newSet = new Set(selectedIndices);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        setSelectedIndices(newSet);
    };

    // Check Sum Effect
    useEffect(() => {
        if (!currentPanel || isSolved || !isPlaying) return;
        if (selectedIndices.size === 0) return;

        let sum = 0;
        selectedIndices.forEach(idx => {
            sum += currentPanel.numbers[idx];
        });

        if (sum === 10) {
            // Correct!
            setIsSolved(true);
            onScore(100); // Fixed 100 points
            playSound('correct');

            // Transition
            setTimeout(() => {
                setPanelIndex(prev => prev + 1);
                setSelectedIndices(new Set());
                setIsSolved(false); // Reset
                setAnimationKey(prev => prev + 1);
            }, 150);
        } else if (sum > 10) {
            if (currentPanel.level < 3) {
                onScore(-80);
                playSound('error');
                setSelectedIndices(new Set()); // Reset to force retry
            }
        }
    }, [selectedIndices, currentPanel, panelIndex, onScore, isSolved, isPlaying]);

    if (!currentPanel) return <div className="text-white">{t('common.loading')}</div>;

    return (
        <div className="flex flex-col items-center justify-center w-full h-full gap-8 relative">

            {/* Header Info */}
            <div className="absolute top-0 text-gray-500 font-mono text-sm mt-2">
                Level: {currentPanel.level} | Panel: {panelIndex + 1}
            </div>

            {/* Title / Help */}
            <h2 className="text-4xl font-black text-white drop-shadow-[0_0_10px_rgba(255,215,0,0.5)]">
                {t('ten.title')}
            </h2>
            <div className="text-gray-400 text-sm mb-4">{t('ten.instruction')}</div>

            {/* Numbers Grid */}
            <div className={`grid gap-6 ${currentPanel.numbers.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <AnimatePresence mode="popLayout">
                    {currentPanel.numbers.map((num, idx) => (
                        <motion.button
                            key={`${panelIndex}-${idx}-${animationKey}`} // Updated Key
                            layout
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{
                                scale: selectedIndices.has(idx) ? 1.1 : 1,
                                opacity: 1,
                                backgroundColor: selectedIndices.has(idx) ? '#3b82f6' : '#1f2937',
                                boxShadow: selectedIndices.has(idx) ? '0 0 20px rgba(59, 130, 246, 0.5)' : 'none'
                            }}
                            exit={{ scale: 0, opacity: 0 }}
                            whileTap={{ scale: 0.95 }}
                            onPointerDown={(e) => {
                                e.preventDefault();
                                if (e.currentTarget.setPointerCapture) {
                                    try {
                                        e.currentTarget.setPointerCapture(e.pointerId);
                                    } catch {
                                        // Ignore capture errors on unsupported pointer types
                                    }
                                }
                                toggleSelection(idx);
                            }}
                            className={`w-28 h-28 rounded-3xl flex items-center justify-center text-5xl font-bold text-white border-4 border-gray-700 transition-colors shadow-xl`}
                        >
                            {num}
                        </motion.button>
                    ))}
                </AnimatePresence>
            </div>

            {/* Current Sum Indicator */}
            <div className="mt-8 text-xl font-mono text-gray-500">
                Sum: <span className={
                    Array.from(selectedIndices).reduce((a, b) => a + currentPanel.numbers[b], 0) === 10 ? 'text-green-400 font-bold' : 'text-white'
                }>
                    {Array.from(selectedIndices).reduce((a, b) => a + currentPanel.numbers[b], 0)}
                </span>
            </div>

        </div>
    );
};

export default MakeTen;
