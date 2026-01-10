import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface NumberOrderProps {
    gameType: 'NUMBER_ASC' | 'NUMBER_DESC';
    seed: number;
    onGameComplete: (duration?: number) => void;
    phase: 'countdown' | 'playing' | 'result';
    resultMessage: string | null;
}

const NumberOrder: React.FC<NumberOrderProps> = ({
    gameType,
    seed,
    onGameComplete,
    phase,
    resultMessage
}) => {
    const { t } = useTranslation();
    const [numbers, setNumbers] = useState<number[]>([]);
    const [currentStep, setCurrentStep] = useState<number>(0); // 0 to 8
    const [panelCount, setPanelCount] = useState<number>(1);   // 1 or 2
    const [shakeId, setShakeId] = useState<number | null>(null);
    const [clearedNumbers, setClearedNumbers] = useState<number[]>([]);
    const startTimeRef = React.useRef<number>(0);

    // Initialize/Reset Panel
    useEffect(() => {
        if (phase === 'playing') {
            setPanelCount(1);
            generateGrid(1); // Explicitly start with Panel 1
            setCurrentStep(0);
            setClearedNumbers([]);
            startTimeRef.current = Date.now(); // Start Timer
        }
    }, [phase, seed]);

    const generateGrid = (targetPanel: number = panelCount) => {
        // Simple deterministic shuffle using seed + panelCount
        // A simple pseudo-random generator
        let currentSeed = seed + targetPanel * 1357;
        const rng = () => {
            const x = Math.sin(currentSeed++) * 10000;
            return x - Math.floor(x);
        };

        const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        // Fisher-Yates shuffle
        for (let i = nums.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [nums[i], nums[j]] = [nums[j], nums[i]];
        }
        setNumbers(nums);
    };

    const handleNumberClick = (num: number) => {
        if (phase !== 'playing') return;
        if (clearedNumbers.includes(num)) return; // Already cleared

        const isAsc = gameType === 'NUMBER_ASC';
        // Expected number logic
        // ASC: 1 -> 2 -> ... -> 9
        // DESC: 9 -> 8 -> ... -> 1

        const expected = isAsc ? (currentStep + 1) : (9 - currentStep);

        if (num === expected) {
            // Correct
            setClearedNumbers(prev => [...prev, num]);
            const nextStep = currentStep + 1;
            setCurrentStep(nextStep);

            // Check if panel complete
            if (nextStep === 9) {
                // Panel Complete
                if (panelCount === 1) {
                    // Go to panel 2
                    setTimeout(() => {
                        setPanelCount(2);
                        setClearedNumbers([]);
                        setCurrentStep(0);
                        generateGrid(2); // Explicitly generate for Panel 2
                    }, 500); // Brief pause before next panel
                } else {
                    // Game Complete: Send elapsed time
                    const endTime = Date.now();
                    const duration = endTime - startTimeRef.current;
                    onGameComplete(duration);
                }
            }
        } else {
            // Incorrect
            setShakeId(num);
            setTimeout(() => setShakeId(null), 500);
        }
    };

    // Helper to format result message
    const getResultText = (msg: string | null) => {
        if (!msg) return '';
        if (msg === 'WIN') return t('game.victory');
        if (msg === 'LOSE') return t('game.defeat');
        if (msg === 'DRAW') return t('game.draw');
        return msg;
    };

    return (
        <div className="flex flex-col items-center justify-center w-full h-full gap-8">

            {/* Header / Instructions */}
            <div className="absolute top-4 flex flex-col items-center">
                <h2 className="text-xl font-bold text-gray-400">
                    {gameType === 'NUMBER_ASC' ? t('number.asc') : t('number.desc')}
                </h2>
                <div className="flex gap-2 mt-2">
                    <span className={`px-3 py-1 rounded-full text-sm font-bold transition-colors ${panelCount === 1 ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-500'}`}>{t('number.panel')} 1</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-bold transition-colors ${panelCount === 2 ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-500'}`}>{t('number.panel')} 2</span>
                </div>
            </div>

            {/* Grid Area */}
            <div className="relative w-80 h-80">
                <AnimatePresence mode="wait">
                    {phase === 'countdown' && (
                        <motion.div
                            key="countdown"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 1.5, opacity: 0 }}
                            className="absolute inset-0 flex flex-col items-center justify-center z-20"
                        >
                            <h3 className="text-2xl font-bold text-white mb-4 text-center px-4">
                                {gameType === 'NUMBER_ASC' ? t('number.asc') : t('number.desc')}
                            </h3>
                            <div className="text-6xl font-black text-blue-500 animate-pulse">
                                {t('number.ready')}
                            </div>
                        </motion.div>
                    )}

                    {phase === 'result' && (
                        <motion.div
                            key="result"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className={`absolute inset-0 flex items-center justify-center text-6xl font-black z-10 ${resultMessage === 'WIN' ? 'text-green-500' : 'text-red-500'}`}
                        >
                            {getResultText(resultMessage)}
                        </motion.div>
                    )}

                    {phase === 'playing' && (
                        <div className="grid grid-cols-3 gap-3 w-full h-full">
                            {numbers.map((num) => (
                                <motion.button
                                    key={`${panelCount}-${num}`}
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={
                                        shakeId === num
                                            ? { x: [-5, 5, -5, 5, 0], backgroundColor: '#ef4444', scale: 1, opacity: 1 }
                                            : clearedNumbers.includes(num)
                                                ? { scale: 0.9, opacity: 0, backgroundColor: '#22c55e' }
                                                : { scale: 1, opacity: 1, backgroundColor: '#1f2937' } // gray-800
                                    }
                                    transition={{ duration: 0.2 }}
                                    onClick={() => handleNumberClick(num)}
                                    disabled={clearedNumbers.includes(num)}
                                    className="rounded-xl flex items-center justify-center text-4xl font-bold text-white border-2 border-gray-700 hover:border-blue-500 shadow-lg active:scale-95"
                                >
                                    {num}
                                </motion.button>
                            ))}
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default NumberOrder;
