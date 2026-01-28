import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';
import { useSound } from '../../contexts/SoundContext';

interface FindMostColorProps {
    seed: string | null;
    onScore: (amount: number) => void;
    isPlaying: boolean;
}

// Color Palette
const COLORS = [
    'bg-red-500',
    'bg-blue-500',
    'bg-green-500',
    'bg-yellow-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-teal-500',
    'bg-orange-500'
];

const FindMostColor: React.FC<FindMostColorProps> = ({ seed, onScore, isPlaying }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();

    const [grid, setGrid] = useState<string[]>([]);
    const [cols, setCols] = useState(3);
    const [successCount, setSuccessCount] = useState(0);
    const [roundKey, setRoundKey] = useState(0); // To trigger animations

    const rng = useRef<SeededRandom | null>(null);

    useEffect(() => {
        if (seed) {
            rng.current = new SeededRandom(seed);
            setSuccessCount(0);
            generateRound();
        }
    }, [seed]);

    const generateRound = useCallback(() => {
        if (!rng.current) return;

        // Difficulty Logic
        let gridSize = 3; // 3x3
        let numColors = 2;

        if (successCount >= 12) {
            gridSize = 5;
            numColors = 3;
        } else if (successCount >= 9) {
            gridSize = 5;
            numColors = 2;
        } else if (successCount >= 6) {
            gridSize = 4;
            numColors = 3;
        } else if (successCount >= 4) {
            gridSize = 4;
            numColors = 2;
        } else {
            gridSize = 3;
            numColors = 2;
        }

        setCols(gridSize);
        const totalCells = gridSize * gridSize;

        // Select Colors
        const shuffledColors = [...COLORS].sort(() => rng.current!.next() - 0.5);
        const selectedColors = shuffledColors.slice(0, numColors);

        // Distribute Counts
        // Requirement: Winner must be unique. 
        // 6+ wins: Difference between 1st and 2nd should be small.

        let counts = new Array(numColors).fill(0);
        let isValid = false;

        while (!isValid) {
            // Reset counts
            const base = Math.floor(totalCells / numColors);
            counts = counts.map(() => base);


            // Distribute remainder appropriately
            // To ensure a winner, give remainder to index 0, or add +1 to index 0 and -1 to others

            // Simple Random Partition
            // Use a more deterministic heuristic to satisfy constraints

            // 1. Assign random weights
            let weights = new Array(numColors).fill(0).map(() => rng.current!.next());
            // Normalize to totalCells
            let sum = weights.reduce((a, b) => a + b, 0);
            let intCounts = weights.map(w => Math.floor((w / sum) * totalCells));
            let currentSum = intCounts.reduce((a, b) => a + b, 0);

            // Fill remaining
            for (let i = 0; i < totalCells - currentSum; i++) {
                intCounts[i % numColors]++;
            }

            // Check constraints
            // Find Max
            const maxVal = Math.max(...intCounts);
            const maxIndices = intCounts
                .map((val, idx) => val === maxVal ? idx : -1)
                .filter(idx => idx !== -1);

            // Constraint 1: Unique Winner
            if (maxIndices.length === 1) {
                // Constraint 2: Tight verification for High Elo (6+ wins)
                if (successCount >= 6) {
                    const sorted = [...intCounts].sort((a, b) => b - a);
                    const diff = sorted[0] - sorted[1];

                    // Must be tight (diff <= 2 for 4x4+, maybe strict 1)
                    // If too easy (diff > 2), retry
                    // Relaxed to <= 2 to prevent infinite loops in small grids
                    if (diff <= 2) {
                        isValid = true;
                    }
                } else {
                    isValid = true;
                }
            }

            if (isValid) counts = intCounts;
        }

        // Create Grid Array
        let newGrid: string[] = [];
        counts.forEach((count, idx) => {
            for (let i = 0; i < count; i++) {
                newGrid.push(selectedColors[idx]);
            }
        });

        // Shuffle Grid
        for (let i = newGrid.length - 1; i > 0; i--) {
            const j = Math.floor(rng.current.next() * (i + 1));
            [newGrid[i], newGrid[j]] = [newGrid[j], newGrid[i]];
        }

        setGrid(newGrid);
        setRoundKey(prev => prev + 1);

    }, [successCount]);

    const handleTileClick = (color: string) => {
        if (!isPlaying) return;
        // Count frequencies in current grid
        const counts: { [key: string]: number } = {};
        grid.forEach(c => counts[c] = (counts[c] || 0) + 1);

        const maxCount = Math.max(...Object.values(counts));
        const winners = Object.keys(counts).filter(c => counts[c] === maxCount);

        // Since we enforced unique winner, winners.length should be 1.
        // But if logic failed, standard safety: valid if clicked color is max.

        if (winners.includes(color)) {
            // Correct
            playSound('correct');
            onScore(10 + Math.min(successCount, 10) * 2); // Score scales slightly
            setSuccessCount(prev => prev + 1);
            generateRound();
        } else {
            // Wrong
            playSound('error');
            onScore(-10);
            // Shake effect or feedback?
        }
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4">
            <h2 className="text-2xl font-black text-white mb-6 drop-shadow-md animate-pulse">
                {t('mostColor.title')}
            </h2>

            <motion.div
                key={roundKey}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={`grid gap-2 p-4 bg-gray-800/50 rounded-2xl backdrop-blur-sm shadow-xl aspect-square w-full max-w-md
                    ${cols === 3 ? 'grid-cols-3' : cols === 4 ? 'grid-cols-4' : 'grid-cols-5'}`}
            >
                {grid.map((color, idx) => (
                    <motion.button
                        key={idx}
                        whileHover={{ scale: 0.95 }}
                        whileTap={{ scale: 0.9 }}
                        onPointerDown={(e) => {
                            e.preventDefault();
                            if (e.currentTarget.setPointerCapture) {
                                try {
                                    e.currentTarget.setPointerCapture(e.pointerId);
                                } catch {
                                    // Ignore capture errors on unsupported pointer types
                                }
                            }
                            handleTileClick(color);
                        }}
                        className={`${color} w-full h-full rounded-lg shadow-inner border-2 border-white/10 transition-colors`}
                    />
                ))}
            </motion.div>

            <div className="mt-8 text-white/50 font-mono text-sm">
                Streak: {successCount}
            </div>
        </div>
    );
};

export default FindMostColor;
