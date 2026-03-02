import React, { useState, useMemo, useEffect } from 'react';
import { usePanelProgress } from '../../hooks/usePanelProgress';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';
import { useSound } from '../../contexts/SoundContext';

interface MakeTenProps {
    seed: string | null;
    onScore: (amount: number) => void;
    isPlaying: boolean;
}

type PanelConfig = {
    level: number;
    count: number;
    minAnswerSize: number;
    maxAnswerSize: number;
    allowNegative: boolean;
};

const TARGET_COMBINATIONS: Record<number, number[][]> = {
    2: [[1, 9], [2, 8], [3, 7], [4, 6]],
    3: [[1, 2, 7], [1, 3, 6], [1, 4, 5], [2, 3, 5]],
    4: [[1, 2, 3, 4]]
};

const MakeTen: React.FC<MakeTenProps> = ({ seed, onScore, isPlaying }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [panelIndex, setPanelIndex] = usePanelProgress(seed);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [animationKey, setAnimationKey] = useState(0);
    const [isSolved, setIsSolved] = useState(false); // Prevent double scoring

    const getPanelConfig = (index: number): PanelConfig => {
        if (index < 5) {
            return { level: 1, count: 3, minAnswerSize: 2, maxAnswerSize: 2, allowNegative: false };
        }
        if (index < 15) {
            return { level: 2, count: 4, minAnswerSize: 2, maxAnswerSize: 2, allowNegative: false };
        }
        if (index < 30) {
            return { level: 3, count: 6, minAnswerSize: 2, maxAnswerSize: 3, allowNegative: false };
        }
        return { level: 4, count: 8, minAnswerSize: 2, maxAnswerSize: 4, allowNegative: true };
    };

    const countTenSolutions = (numbers: number[]) => {
        let totalSolutions = 0;
        const n = numbers.length;
        const solutionSizes: number[] = [];

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
                solutionSizes.push(size);
            }
        }

        return { totalSolutions, solutionSizes };
    };

    const currentPanel = useMemo(() => {
        if (!seed) return null;

        const rng = new SeededRandom(`${seed}_ten_${panelIndex} `);
        const config = getPanelConfig(panelIndex);
        const distractorPool = config.allowNegative
            ? [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17]
            : [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15];

        let validNumbers: number[] | null = null;
        let answerSize = config.minAnswerSize;
        for (let attempt = 0; attempt < 1200; attempt += 1) {
            answerSize = config.minAnswerSize + Math.floor(rng.next() * (config.maxAnswerSize - config.minAnswerSize + 1));
            const candidates = TARGET_COMBINATIONS[answerSize];
            const targetCombo = candidates[Math.floor(rng.next() * candidates.length)];
            const picked = new Set<number>(targetCombo);

            while (picked.size < config.count) {
                const candidate = distractorPool[Math.floor(rng.next() * distractorPool.length)];
                if (candidate === 10 || picked.has(candidate)) continue;
                picked.add(candidate);
            }

            const numbers = Array.from(picked);
            const { totalSolutions, solutionSizes } = countTenSolutions(numbers);
            if (totalSolutions === 1 && solutionSizes[0] === answerSize) {
                validNumbers = numbers;
                break;
            }
        }

        const fallbackByCount: Record<number, number[]> = {
            3: [1, 9, 4],
            4: [1, 9, 4, 7],
            6: [1, 2, 7, 4, 11, 13],
            8: [1, 2, 3, 4, -2, 11, 14, 16]
        };
        const fallback = fallbackByCount[config.count] ?? [1, 9, 4];
        const shuffled = rng.shuffle(validNumbers ?? fallback);

        return {
            numbers: shuffled,
            level: config.level,
            count: config.count,
            allowNegative: config.allowNegative,
            answerSize
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
            if (!currentPanel.allowNegative) {
                onScore(-80);
                playSound('error');
                setSelectedIndices(new Set()); // Reset to force retry
            }
        }
    }, [selectedIndices, currentPanel, panelIndex, onScore, isSolved, isPlaying]);

    if (!currentPanel) return <div className="text-white">{t('common.loading')}</div>;

    return (
        <div className="flex flex-col items-center justify-center w-full h-full gap-8 relative">
            {/* Numbers Grid */}
            <div className={`grid gap-4 md:gap-6 ${currentPanel.count === 8 ? 'grid-cols-4' : currentPanel.count === 6 ? 'grid-cols-3' : currentPanel.numbers.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
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
                            className={`rounded-3xl flex items-center justify-center font-bold text-white border-4 border-gray-700 transition-colors shadow-xl
                                ${currentPanel.count >= 8 ? 'w-20 h-20 md:w-24 md:h-24 text-3xl md:text-4xl' : currentPanel.count >= 6 ? 'w-[5.5rem] h-[5.5rem] md:w-[6.5rem] md:h-[6.5rem] text-4xl md:text-[2.7rem]' : 'w-28 h-28 text-5xl'}`}
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
