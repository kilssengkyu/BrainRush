import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';

interface MakeTenProps {
    seed: string | null;
    onScore: (amount: number) => void;
}

const MakeTen: React.FC<MakeTenProps> = ({ seed, onScore }) => {
    const { t } = useTranslation();
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

    const currentPanel = useMemo(() => {
        if (!seed) return null;

        const rng = new SeededRandom(`${seed}_ten_${panelIndex}`);
        const level = getLevel(panelIndex);

        // 1. Determine Count (3 or 4)
        const count = level === 1 ? 3 : 4;

        // 2. Generate a valid "Target Subset" that sums to 10
        const subsetSize = Math.floor(rng.next() * (count - 1)) + 2; // 2 to count

        // Generate Numbers summing to 10
        let currentSum = 0;
        const targetNumbers: number[] = [];

        if (level < 3) {
            // Positive Integers only
            let remaining = 10;
            for (let i = 0; i < subsetSize - 1; i++) {
                const maxVal = remaining - (subsetSize - 1 - i);
                const n = Math.floor(rng.next() * (maxVal - 1)) + 1;
                targetNumbers.push(n);
                remaining -= n;
            }
            targetNumbers.push(remaining);
        } else {
            // Level 3: Negatives allowed
            for (let i = 0; i < subsetSize - 1; i++) {
                const n = Math.floor(rng.next() * 20) - 5; // -5 to 14
                targetNumbers.push(n);
                currentSum += n;
            }
            targetNumbers.push(10 - currentSum);
        }

        // 3. Fill remaining slots with distractors
        const finalNumbers = [...targetNumbers];
        while (finalNumbers.length < count) {
            const distractor = Math.floor(rng.next() * 9) + 1;
            finalNumbers.push(distractor);
        }

        // 4. Shuffle position
        const shuffled = rng.shuffle(finalNumbers);

        return {
            numbers: shuffled,
            level
        };

    }, [seed, panelIndex]);

    // Handle Selection
    const toggleSelection = (index: number) => {
        if (isSolved) return; // Disable interaction when solved
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
        if (!currentPanel || isSolved) return;

        let sum = 0;
        selectedIndices.forEach(idx => {
            sum += currentPanel.numbers[idx];
        });

        if (sum === 10 && selectedIndices.size > 0) {
            // Correct!
            setIsSolved(true);
            onScore(100); // Fixed 100 points

            // Transition
            setTimeout(() => {
                setPanelIndex(prev => prev + 1);
                setSelectedIndices(new Set());
                setIsSolved(false); // Reset
                setAnimationKey(prev => prev + 1);
            }, 150);
        } else if (sum > 10) {
            // Penalty! (Only if positive sum exceeds 10. Dealing with negatives is tricky, but "Sum > 10" is a fair fail condition for Make 10)
            // Wait, if we have negatives, sum > 10 is possible transiently? 
            // Example: 5 + 6 (11) ... + (-1) = 10.
            // If user clicks 5 then 6, sum is 11. Should we fail immediately? 
            // Yes, "Make 10" usually implies "don't exceed 10" in simple versions, but with negatives it's harder.
            // Let's stick to "If sum > 10 AND no negatives in the level" OR just loose check?
            // Actually, if level 3 uses negatives, exceeding 10 temporarily MIGHT be valid if the next number is -2.
            // BUT, usually these games require you to pick positive numbers to reach 10.
            // Let's look at level logic.
            // Level 3 allows negatives. If I have 15, and I pick -5, I get 10.
            // So immediate failure on > 10 is BAD for Level 3.

            // Revised Plan:
            // Only penalize if ALL remaining numbers are positive? Or just don't penalize on intermediate sums.
            // But User ASKED for penalty. 
            // Maybe penalize if matching is "Finalized"? But we don't have a submit button.
            // Alternative: Penalize only if Sum > 10 AND Level < 3 (No negatives).
            // For Level 3, maybe we just don't penalize overflow? Or we penalize if Sum > 20 (way off)?

            // Let's implement: Penalty if Sum > 10 AND Level < 3. 
            // For Level 3, we simply can't auto-fail easily without more logic.

            if (currentPanel.level < 3) {
                onScore(-20);
                setSelectedIndices(new Set()); // Reset to force retry
                // Visual feedback needed? They will see the selection clear.
            }
        }
    }, [selectedIndices, currentPanel, panelIndex, onScore, isSolved]);

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
                            onClick={() => toggleSelection(idx)}
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
