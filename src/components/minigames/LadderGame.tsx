import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';
import { useSound } from '../../contexts/SoundContext';

interface LadderGameProps {
    seed: string | null;
    onScore: (amount: number) => void;
}

// Coordinate type for bridges: [stepIndex, lineIndex]
// Bridge connects lineIndex and lineIndex + 1 at stepIndex
type Bridge = [number, number];

const LadderGame: React.FC<LadderGameProps> = ({ seed, onScore }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [panelIndex, setPanelIndex] = useState(0);
    const [selectedEnd, setSelectedEnd] = useState<number | null>(null);
    const [isAnimating, setIsAnimating] = useState(false);
    const [shakeId, setShakeId] = useState<number | null>(null); // For wrong answers
    const [tracePath, setTracePath] = useState<{ x: number, y: number }[]>([]);

    // Difficulty Settings
    const getDifficulty = (index: number) => {
        if (index < 3) return { lines: 3, steps: 6 };
        if (index < 6) return { lines: 4, steps: 8 };
        return { lines: 5, steps: 10 };
    };

    const gameState = useMemo(() => {
        if (!seed) return null;

        const rng = new SeededRandom(`${seed}_ladder_${panelIndex}`);
        const { lines, steps } = getDifficulty(panelIndex);

        // 1. Generate Bridges
        const bridges: Bridge[] = [];
        // Available spots: lines-1 spaces between lines
        // For each step, decide bridges
        for (let s = 0; s < steps; s++) {
            for (let l = 0; l < lines - 1; l++) {
                // Random chance to place bridge, but ensure no consecutive horizontal lines
                // If we placed at l-1, we cannot place at l
                const prevHasBridge = l > 0 && bridges.some(b => b[0] === s && b[1] === l - 1);

                if (!prevHasBridge && rng.next() > 0.5) {
                    bridges.push([s, l]);
                }
            }
        }

        // 2. Determine Start and Goal
        // We pick a random Start Index
        const startIndex = Math.floor(rng.next() * lines);

        // 3. Calculate Correct End Index (Trace)
        let currentIndex = startIndex;
        const pathIndices: number[] = [currentIndex]; // For debugging or simple trace

        for (let s = 0; s < steps; s++) {
            const rightBridge = bridges.find(b => b[0] === s && b[1] === currentIndex);
            const leftBridge = bridges.find(b => b[0] === s && b[1] === currentIndex - 1);

            if (rightBridge) {
                currentIndex += 1;
            } else if (leftBridge) {
                currentIndex -= 1;
            }
            pathIndices.push(currentIndex);
        }

        const correctEndIndex = currentIndex;

        return {
            lines,
            steps,
            bridges,
            startIndex,
            correctEndIndex,
            pathIndices
        };
    }, [seed, panelIndex]);

    const handleEndClick = (endIndex: number) => {
        if (isAnimating || !gameState) return;

        const isCorrect = endIndex === gameState.correctEndIndex;
        const scoreBase = 30 + (panelIndex * 5);

        if (isCorrect) {
            setSelectedEnd(endIndex);
            setIsAnimating(true);
            generateTracePath();
            onScore(scoreBase);
            setTimeout(() => {
                setIsAnimating(false);
                setSelectedEnd(null);
                setTracePath([]);
                setPanelIndex(prev => prev + 1);
            }, 800); // 0.8s animation
        } else {
            onScore(-scoreBase);
            playSound('error');
            setShakeId(endIndex);
            setTimeout(() => {
                setShakeId(null);
            }, 600);
        }
    };

    // Calculate SVG path points for animation
    const generateTracePath = () => {
        if (!gameState) return;

        const { lines, steps, bridges, startIndex } = gameState;
        // Grid setup
        const width = 300;
        const height = 400;
        const lineGap = width / (lines - 1);
        const stepHeight = height / steps;

        const points: { x: number, y: number }[] = [];
        let currL = startIndex;

        // Start Point
        points.push({ x: currL * lineGap, y: -20 });
        points.push({ x: currL * lineGap, y: 0 });

        for (let s = 0; s < steps; s++) {
            // Move down to center of step
            const yStart = s * stepHeight;
            const yMid = yStart + (stepHeight / 2);

            points.push({ x: currL * lineGap, y: yMid });

            // Check bridge
            const rightBridge = bridges.find(b => b[0] === s && b[1] === currL);
            const leftBridge = bridges.find(b => b[0] === s && b[1] === currL - 1);

            if (rightBridge) {
                currL += 1;
                points.push({ x: currL * lineGap, y: yMid });
            } else if (leftBridge) {
                currL -= 1;
                points.push({ x: currL * lineGap, y: yMid });
            }

            // Move to end of step
            // points.push({ x: currL * lineGap, y: yEnd });
        }

        // Final vertical line to bottom
        points.push({ x: currL * lineGap, y: height });
        points.push({ x: currL * lineGap, y: height + 20 });

        setTracePath(points);
    };

    if (!gameState) return <div className="text-white">Loading...</div>;

    // Rendering Constants
    const CONTAINER_WIDTH = 300;
    const CONTAINER_HEIGHT = 400;
    const LINE_GAP = CONTAINER_WIDTH / (gameState.lines - 1);
    const STEP_HEIGHT = CONTAINER_HEIGHT / gameState.steps;

    return (
        <div className="flex flex-col items-center justify-center w-full h-full relative">
            <h2 className="text-3xl font-black text-white mb-2 drop-shadow-md">
                {t('ladder.title', 'LADDER')}
            </h2>
            <div className="text-yellow-400 font-bold text-lg mb-16">
                {t('ladder.instruction', 'Follow the path!')}
            </div>

            {/* Game Board */}
            <div className="relative" style={{ width: CONTAINER_WIDTH, height: CONTAINER_HEIGHT }}>

                {/* SVG Layer for Lines and Bridges */}
                <svg width="100%" height="100%" className="overflow-visible">
                    {/* Vertical Lines */}
                    {Array.from({ length: gameState.lines }).map((_, i) => (
                        <line
                            key={`line-${i}`}
                            x1={i * LINE_GAP} y1={0}
                            x2={i * LINE_GAP} y2={CONTAINER_HEIGHT}
                            stroke="rgba(255, 255, 255, 0.3)"
                            strokeWidth="4"
                            strokeLinecap="round"
                        />
                    ))}

                    {/* Bridges */}
                    {gameState.bridges.map((b, i) => {
                        const y = b[0] * STEP_HEIGHT + (STEP_HEIGHT / 2);
                        const x1 = b[1] * LINE_GAP;
                        const x2 = (b[1] + 1) * LINE_GAP;
                        return (
                            <line
                                key={`bridge-${i}`}
                                x1={x1} y1={y}
                                x2={x2} y2={y}
                                stroke="rgba(255, 255, 255, 0.3)"
                                strokeWidth="4"
                                strokeLinecap="round"
                            />
                        );
                    })}

                    {/* Trace Path Animation */}
                    {isAnimating && tracePath.length > 0 && (
                        <motion.path
                            d={`M ${tracePath.map(p => `${p.x} ${p.y}`).join(' L ')}`}
                            fill="transparent"
                            stroke={selectedEnd === gameState.correctEndIndex ? "#4ade80" : "#ef4444"}
                            strokeWidth="6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 0.5, ease: "linear" }}
                        />
                    )}
                </svg>

                {/* Start Marker */}
                <div
                    className="absolute -top-12 flex flex-col items-center"
                    style={{ left: gameState.startIndex * LINE_GAP - 16 }} // Center 32px icon
                >
                    <div className="animate-bounce text-yellow-400 text-3xl font-black">▼</div>
                </div>

                {/* Destination Buttons */}
                <div className="absolute -bottom-16 w-full h-12">
                    {Array.from({ length: gameState.lines }).map((_, i) => (
                        <motion.button
                            key={`btn-${i}`}
                            animate={shakeId === i ? { x: [-5, 5, -5, 5, 0], backgroundColor: '#ef4444' } : {}}
                            className={`absolute w-12 h-12 rounded-full border-4 font-bold text-xl transition-all shadow-lg
                                ${selectedEnd === i
                                    ? 'bg-green-500 border-green-300'
                                    : 'bg-gray-800 border-gray-600 hover:border-white hover:scale-110 active:scale-95'
                                }
                            `}
                            style={{ left: i * LINE_GAP - 24 }} // Center 48px button
                            onClick={() => handleEndClick(i)}
                            disabled={isAnimating}
                        >
                            {i + 1}
                        </motion.button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default LadderGame;
