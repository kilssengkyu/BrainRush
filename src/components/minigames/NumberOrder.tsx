import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SeededRandom } from '../../utils/seededRandom';

interface NumberOrderProps {
    seed: string | null;
    onScore: (amount: number) => void;
}

const NumberOrder: React.FC<NumberOrderProps> = ({ seed, onScore }) => {

    const [panelIndex, setPanelIndex] = useState(0);
    const [clearedNumbers, setClearedNumbers] = useState<number[]>([]);
    const [shakeId, setShakeId] = useState<number | null>(null);
    const [animationKey, setAnimationKey] = useState(0);

    // Generate Current Panel Data
    const { numbers, type } = useMemo(() => {
        if (!seed) return { numbers: [], type: 'ASC' };

        const rng = new SeededRandom(`${seed}_num_${panelIndex}`);

        // 1. Generate 1-9
        const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        // 2. Shuffle
        const shuffled = rng.shuffle(nums);
        // 3. Determine Type (ASC or DESC) - 50/50
        const isAsc = rng.next() > 0.5; // True = ASC, False = DESC

        return { numbers: shuffled, type: isAsc ? 'ASC' : 'DESC' };
    }, [seed, panelIndex]);

    const handleNumberClick = (num: number) => {
        if (clearedNumbers.includes(num)) return;

        const currentStep = clearedNumbers.length; // 0 to 8
        // Expected number depends on Type
        // If ASC: 1, 2, 3... -> Expected = currentStep + 1
        // If DESC: 9, 8, 7... -> Expected = 9 - currentStep
        const expected = type === 'ASC' ? (currentStep + 1) : (9 - currentStep);

        if (num === expected) {
            // Correct
            onScore(20); // 20 Points per digit
            const newCleared = [...clearedNumbers, num];
            setClearedNumbers(newCleared);

            // Check if Panel Cleared
            if (newCleared.length === 9) {
                // Bonus for clearing panel?
                onScore(100);
                // Delay slightly for visual satisfaction then next panel
                setTimeout(() => {
                    setPanelIndex(prev => prev + 1);
                    setClearedNumbers([]);
                    setAnimationKey(prev => prev + 1);
                }, 250);
            }
        } else {
            // Wrong
            setShakeId(num);
            setTimeout(() => setShakeId(null), 400);
        }
    };

    if (!seed) return <div className="text-white">Loading...</div>;

    return (
        <div className="flex flex-col items-center justify-center w-full h-full gap-6 relative">
            {/* Header / Instructions */}
            <div className="flex flex-col items-center gap-2">
                <h2 className={`text-2xl font-bold ${type === 'ASC' ? 'text-blue-400' : 'text-orange-400'}`}>
                    {type === 'ASC' ? "1 → 9" : "9 → 1"}
                </h2>
                <div className="text-gray-500 font-mono text-sm">
                    Panel: {panelIndex + 1}
                </div>
            </div>

            {/* Grid Area */}
            <div className="w-80 h-80 relative">
                <AnimatePresence mode="popLayout">
                    <motion.div
                        key={animationKey}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 1.1, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="grid grid-cols-3 gap-3 w-full h-full"
                    >
                        {numbers.map((num) => (
                            <motion.button
                                key={`${panelIndex}-${num}`}
                                onMouseDown={() => handleNumberClick(num)}
                                animate={
                                    shakeId === num
                                        ? { x: [-5, 5, -5, 5, 0], backgroundColor: '#ef4444' }
                                        : clearedNumbers.includes(num)
                                            ? { scale: 0.9, opacity: 0, backgroundColor: '#22c55e' } // Green when cleared (or hide?)
                                            // Actually hiding them makes it easier. Let's Fade them out.
                                            : { scale: 1, opacity: 1 }
                                }
                                // If cleared, we can also just visibility: hidden or opacity 0
                                style={{
                                    opacity: clearedNumbers.includes(num) ? 0.2 : 1,
                                    pointerEvents: clearedNumbers.includes(num) ? 'none' : 'auto'
                                }}
                                className="rounded-xl flex items-center justify-center text-4xl font-bold text-white border-2 border-gray-600 bg-gray-800 hover:border-white shadow-lg active:scale-95 transition-colors"
                            >
                                {num}
                            </motion.button>
                        ))}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
};

export default NumberOrder;
