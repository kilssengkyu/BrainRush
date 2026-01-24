import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';
import { useSound } from '../../contexts/SoundContext';

interface TapTheColorProps {
    seed: string | null;
    onScore: (amount: number) => void;
}

type Phase = 'memorize' | 'input' | 'result';

// Define available colors
const COLORS = [
    '#ef4444', // red
    '#f97316', // orange
    '#eab308', // yellow
    '#22c55e', // green
    '#3b82f6', // blue
    '#a855f7', // purple
    '#ec4899', // pink
    '#14b8a6', // teal
];

const TapTheColor: React.FC<TapTheColorProps> = ({ seed, onScore }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [panelIndex, setPanelIndex] = useState(0);
    const [phase, setPhase] = useState<Phase>('memorize');
    const [currentStep, setCurrentStep] = useState(0);
    const [shakeId, setShakeId] = useState<number | null>(null);
    const [revealedIndices, setRevealedIndices] = useState<number[]>([]);

    // Difficulty Settings
    const difficulty = useMemo(() => {
        // Level 1-2: 3 tiles
        if (panelIndex < 2) return { tiles: 3, cols: 3 };
        // Level 3-5: 4 tiles
        if (panelIndex < 5) return { tiles: 4, cols: 2 };
        // Level 6+: 6 tiles
        return { tiles: 6, cols: 3 };
    }, [panelIndex]);

    const gameState = useMemo(() => {
        if (!seed) return null;
        const rng = new SeededRandom(`${seed}_tapcolor_${panelIndex}`);

        // 1. Pick colors (duplicate allowed or random selection from palette)
        // User said: "Red Blue Blue Yellow" possible.
        // let's pick N random colors from palette.
        const pickedColors: string[] = [];
        for (let i = 0; i < difficulty.tiles; i++) {
            pickedColors.push(COLORS[Math.floor(rng.next() * COLORS.length)]);
        }

        // 2. Assign these colors to tiles.
        // We need to track the original "pickedColors" composition.
        // Tiles will be a shuffled version of pickedColors.
        const tileColors = [...pickedColors].sort(() => rng.next() - 0.5);

        // 3. Sequence is also a shuffled version of pickedColors (different permutation).
        // But usually sequence is just "the Target order".
        // The user said: "Buttons: Red Blue Blue Yellow. Top: Blue Blue Yellow Red."
        // So the SET of colors is identical.
        const sequenceColors = [...pickedColors].sort(() => rng.next() - 0.5);

        // However, we need to map sequence items to specific Tiles?
        // No, user said: "Color of button matches... cannot be selected anymore".
        // This implies we match by Color Value. Any matching color tile is valid.

        return {
            tileColors,
            sequenceColors
        };
    }, [seed, panelIndex, difficulty]);

    const handleStartClick = () => {
        setPhase('input');
    };

    const handleTileClick = (index: number) => {
        if (phase !== 'input' || !gameState) return;

        const targetColor = gameState.sequenceColors[currentStep];
        const clickedColor = gameState.tileColors[index];

        if (clickedColor === targetColor) {
            // Correct
            const newRevealed = [...revealedIndices, index];
            setRevealedIndices(newRevealed);

            // Advance step
            if (currentStep + 1 >= gameState.sequenceColors.length) {
                // Round Complete
                onScore(30 + panelIndex * 5);
                setPhase('result');
                handleNextRound();
            } else {
                setCurrentStep(prev => prev + 1);
            }
        } else {
            // Wrong
            onScore(-10);
            playSound('error');
            setShakeId(index);
            setTimeout(() => setShakeId(null), 500);
        }
    };

    const handleNextRound = () => {
        setPanelIndex(prev => prev + 1);
        setPhase('memorize');
        setCurrentStep(0);
        setRevealedIndices([]);
    };

    if (!gameState) return <div>Loading...</div>;

    return (
        <div className="flex flex-col items-center justify-center w-full h-full p-4">
            <h2 className="text-3xl font-black text-white mb-2 drop-shadow-md">
                {t('tapTheColor.title', 'Tap the Color')}
            </h2>

            {/* Sequence Bar (Only visible in Input phase) */}
            <div className="h-16 mb-4 flex items-center justify-center space-x-2">
                {phase === 'input' || phase === 'result' ? (
                    gameState.sequenceColors.map((color, seqIdx) => {
                        const isDone = seqIdx < currentStep;
                        const isCurrent = seqIdx === currentStep;

                        return (
                            <motion.div
                                key={`seq-${seqIdx}`}
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className={`w-8 h-8 rounded-full border-2 
                                    ${isDone ? 'opacity-50' : ''}
                                    ${isCurrent ? 'ring-4 ring-white scale-110' : 'border-gray-500'}
                                `}
                                style={{
                                    backgroundColor: color,
                                    filter: isDone ? 'grayscale(0.5)' : 'none'
                                }}
                            />
                        );
                    })
                ) : (
                    <div className="text-yellow-400 font-bold text-lg">
                        {t('tapTheColor.memorize', 'Memorize the colors!')}
                    </div>
                )}
            </div>

            {/* Tile Grid */}
            <div
                className="grid gap-4"
                style={{
                    gridTemplateColumns: `repeat(${difficulty.cols}, minmax(0, 1fr))`
                }}
            >
                {gameState.tileColors.map((color, index) => {
                    const isVisible = phase === 'memorize' || revealedIndices.includes(index) || phase === 'result';
                    const isShake = shakeId === index;

                    return (
                        <motion.button
                            key={`tile-${index}`}
                            animate={isShake ? { x: [-5, 5, -5, 5, 0] } : {}}
                            className={`w-24 h-24 rounded-xl shadow-lg transition-transform active:scale-95
                                ${!isVisible && phase === 'input' ? 'bg-gray-700 hover:bg-gray-600' : ''}
                            `}
                            style={{
                                backgroundColor: isVisible ? color : undefined
                            }}
                            onClick={() => handleTileClick(index)}
                            disabled={phase !== 'input' || isVisible} // Disable if wrong phase or already revealed (matched)
                        />
                    );
                })}
            </div>

            {/* Start Button */}
            {phase === 'memorize' && (
                <motion.button
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="mt-8 px-8 py-3 bg-yellow-500 rounded-full text-white font-bold text-xl shadow-lg hover:bg-yellow-400 active:scale-95"
                    onClick={handleStartClick}
                >
                    {t('tapTheColor.remembered', 'Ready!')}
                </motion.button>
            )}
        </div>
    );
};

export default TapTheColor;
