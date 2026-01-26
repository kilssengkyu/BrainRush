import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
    Star, Heart, Circle, Square, Triangle, Hexagon,
    Diamond, Cloud, Moon, Sun, Zap, Anchor,
    Music, Umbrella, Ghost, Skull
} from 'lucide-react';
import { SeededRandom } from '../../utils/seededRandom';
import { useSound } from '../../contexts/SoundContext';

interface FindTheSpyProps {
    seed: string | null;
    onScore: (amount: number) => void;
}

const SYMBOLS = [
    { id: 'star', icon: Star, color: 'text-yellow-400' },
    { id: 'heart', icon: Heart, color: 'text-red-400' },
    { id: 'circle', icon: Circle, color: 'text-blue-400' },
    { id: 'square', icon: Square, color: 'text-green-400' },
    { id: 'triangle', icon: Triangle, color: 'text-purple-400' },
    { id: 'hexagon', icon: Hexagon, color: 'text-pink-400' },
    { id: 'diamond', icon: Diamond, color: 'text-cyan-400' },
    { id: 'cloud', icon: Cloud, color: 'text-sky-200' },
    { id: 'moon', icon: Moon, color: 'text-yellow-200' },
    { id: 'sun', icon: Sun, color: 'text-orange-400' },
    { id: 'zap', icon: Zap, color: 'text-yellow-500' },
    { id: 'anchor', icon: Anchor, color: 'text-blue-600' },
    { id: 'music', icon: Music, color: 'text-pink-500' },
    { id: 'umbrella', icon: Umbrella, color: 'text-purple-500' },
    { id: 'ghost', icon: Ghost, color: 'text-gray-300' },
    { id: 'skull', icon: Skull, color: 'text-gray-400' },
];

const FindTheSpy: React.FC<FindTheSpyProps> = ({ seed, onScore }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();

    // Game State
    const [streak, setStreak] = useState(0);
    const [phase, setPhase] = useState<'memorize' | 'shuffling' | 'guessing'>('memorize');
    const [gridSize, setGridSize] = useState<{ rows: number, cols: number }>({ rows: 2, cols: 2 });

    // Current Tiles: Array of symbol IDs
    const [tiles, setTiles] = useState<any[]>([]);

    // The "Spy" (The new symbol introduced)
    const [targetSymbolId, setTargetSymbolId] = useState<string | null>(null);

    const rng = useRef<SeededRandom | null>(null);

    // Initialize Game
    useEffect(() => {
        if (seed) {
            rng.current = new SeededRandom(seed);
            setStreak(0);
            startRound(0);
        }
    }, [seed]);

    const startRound = (currentStreak: number) => {
        if (!rng.current) return;

        // Determine Level
        let rows = 2, cols = 2;
        if (currentStreak >= 10) { rows = 3; cols = 3; }      // Level 4
        else if (currentStreak >= 6) { rows = 2; cols = 4; }  // Level 3
        else if (currentStreak >= 3) { rows = 2; cols = 3; }  // Level 2
        else { rows = 2; cols = 2; }                          // Level 1

        setGridSize({ rows, cols });

        // Select Random Symbols
        const count = rows * cols;
        const shuffledSymbols = [...SYMBOLS].sort(() => 0.5 - rng.current!.next());
        const selected = shuffledSymbols.slice(0, count).map(s => ({ ...s, key: Math.random() })); // Add key for unique rendering

        setTiles(selected);
        setPhase('memorize');
        setTargetSymbolId(null);
    };

    const handleReady = () => {
        if (!rng.current) return;
        setPhase('shuffling');

        // Wait for gather animation (visual only, logical change happens instantly or mid-animation)
        setTimeout(() => {
            prepareShuffleLogic();
        }, 500); // Gather time
    };

    const prepareShuffleLogic = () => {
        if (!rng.current) return;

        // 1. Pick one existing tile index to change
        const changeIndex = Math.floor(rng.current.next() * tiles.length);

        // 2. Pick a NEW symbol that is NOT currently in use
        const currentIds = new Set(tiles.map(t => t.id));
        const availableSymbols = SYMBOLS.filter(s => !currentIds.has(s.id));

        // Fallback safety
        const newSymbolBase = availableSymbols.length > 0
            ? availableSymbols[Math.floor(rng.current.next() * availableSymbols.length)]
            : SYMBOLS[0];

        const newSymbol = { ...newSymbolBase, key: Math.random() };

        setTargetSymbolId(newSymbol.id);

        // 3. Create new tile list with replacement
        const newTiles = [...tiles];
        newTiles[changeIndex] = newSymbol;

        // 4. Shuffle positions
        for (let i = newTiles.length - 1; i > 0; i--) {
            const j = Math.floor(rng.current.next() * (i + 1));
            [newTiles[i], newTiles[j]] = [newTiles[j], newTiles[i]];
        }

        setTiles(newTiles);

        // Move to guessing phase after scatter animation
        setTimeout(() => {
            setPhase('guessing');
        }, 300);
    };

    const handleTileClick = (symbolId: string) => {
        if (phase !== 'guessing') return;

        if (symbolId === targetSymbolId) {
            // Correct
            playSound('correct');
            onScore(20 + Math.min(streak, 10) * 2);
            setStreak(prev => prev + 1);
            startRound(streak + 1);
        } else {
            // Wrong
            playSound('error');
            onScore(-10);
            // Visual feedback could be added here (shake etc), 
            // but for fast pace we might just deduct score.
        }
    };

    if (!tiles.length) return null;

    // Grid CSS logic
    const gridCols = gridSize.cols === 2 ? 'grid-cols-2' : gridSize.cols === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4';
    const tileWidth = gridSize.cols === 4 ? 'w-16 h-16' : 'w-24 h-24';

    return (
        <div className="w-full h-full flex flex-col items-center justify-center relative">
            <h2 className="text-2xl font-bold text-white mb-8 drop-shadow-md">
                {phase === 'memorize' ? t('spy.memorize') : phase === 'guessing' ? t('spy.find') : '...'}
            </h2>

            <div className="relative w-full max-w-md h-80 flex items-center justify-center">
                <AnimatePresence mode="wait">
                    {phase === 'shuffling' ? (
                        <motion.div
                            key="stack"
                            initial={{ scale: 1.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1, rotate: 180 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="absolute bg-white/20 w-32 h-32 rounded-2xl border-4 border-white/30 flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.3)]"
                        >
                            <div className="text-4xl">?</div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="grid"
                            className={`grid ${gridCols} gap-4`}
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                        >
                            {tiles.map((tile) => {
                                const Icon = tile.icon;
                                return (
                                    <motion.div
                                        key={tile.key} // Using unique key for each instance
                                        layout
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        onClick={() => handleTileClick(tile.id)}
                                        className={`${tileWidth} bg-white/10 rounded-xl border-2 border-white/20 flex items-center justify-center cursor-pointer hover:bg-white/20 active:scale-95 transition-colors shadow-lg`}
                                    >
                                        <Icon size={32} className={tile.color} />
                                    </motion.div>
                                );
                            })}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Ready Button */}
            <AnimatePresence>
                {phase === 'memorize' && (
                    <motion.button
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleReady}
                        className="absolute bottom-10 px-8 py-3 bg-red-500 hover:bg-red-600 text-white font-black rounded-full shadow-lg text-xl z-20"
                    >
                        {t('spy.ready')}
                    </motion.button>
                )}
            </AnimatePresence>
        </div>
    );
};

export default FindTheSpy;
