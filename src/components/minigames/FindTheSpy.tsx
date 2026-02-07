import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Haptics, NotificationType } from '@capacitor/haptics';
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
    isPlaying: boolean;
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

const FindTheSpy: React.FC<FindTheSpyProps> = ({ seed, onScore, isPlaying }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();

    // Game State
    const [streak, setStreak] = useState(0);
    const [phase, setPhase] = useState<'memorize' | 'shuffling' | 'guessing'>('memorize');
    const [gridSize, setGridSize] = useState<{ rows: number, cols: number }>({ rows: 2, cols: 2 });

    // Current Tiles: Array of symbol IDs
    const [tiles, setTiles] = useState<any[]>([]);

    // The "Spy" symbols (new symbols introduced)
    const [targetSymbolIds, setTargetSymbolIds] = useState<string[]>([]);
    const [foundSpyIds, setFoundSpyIds] = useState<string[]>([]);

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
        if (currentStreak >= 6) { rows = 3; cols = 3; }       // 9 tiles
        else if (currentStreak >= 3) { rows = 2; cols = 3; }  // 6 tiles
        else { rows = 2; cols = 2; }                          // 4 tiles

        setGridSize({ rows, cols });

        // Select Random Symbols
        const count = rows * cols;
        const shuffledSymbols = [...SYMBOLS].sort(() => 0.5 - rng.current!.next());
        const selected = shuffledSymbols.slice(0, count).map(s => ({ ...s, key: Math.random() })); // Add key for unique rendering

        setTiles(selected);
        setPhase('memorize');
        setTargetSymbolIds([]);
        setFoundSpyIds([]);
    };

    const handleReady = () => {
        if (!rng.current || !isPlaying) return;
        setPhase('shuffling');

        // Wait for gather animation (visual only, logical change happens instantly or mid-animation)
        setTimeout(() => {
            prepareShuffleLogic();
        }, 500); // Gather time
    };

    const prepareShuffleLogic = () => {
        if (!rng.current) return;

        const changeCount = tiles.length >= 9 ? 3 : tiles.length >= 6 ? 2 : 1;

        // 1. Pick indices to change (keep order, only replace symbols)
        const indices = Array.from({ length: tiles.length }, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(rng.current.next() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        const changeIndices = indices.slice(0, changeCount);

        // 2. Pick NEW symbols that are NOT currently in use
        const currentIds = new Set(tiles.map(t => t.id));
        const availableSymbols = SYMBOLS.filter(s => !currentIds.has(s.id));

        const pickedNewSymbols: any[] = [];
        for (let i = 0; i < changeCount; i++) {
            const idx = Math.floor(rng.current.next() * availableSymbols.length);
            const base = availableSymbols.splice(idx, 1)[0] || SYMBOLS[0];
            pickedNewSymbols.push({ ...base, key: Math.random() });
        }

        setTargetSymbolIds(pickedNewSymbols.map(s => s.id));
        setFoundSpyIds([]);

        // 3. Create new tile list with replacement (no shuffle)
        const newTiles = [...tiles];
        changeIndices.forEach((changeIndex, i) => {
            newTiles[changeIndex] = pickedNewSymbols[i];
        });

        setTiles(newTiles);

        // Move to guessing phase after scatter animation
        setTimeout(() => {
            setPhase('guessing');
        }, 300);
    };

    const handleTileClick = (symbolId: string) => {
        if (phase !== 'guessing' || !isPlaying) return;

        if (foundSpyIds.includes(symbolId)) return;

        if (targetSymbolIds.includes(symbolId)) {
            // Correct
            playSound('correct');
            Haptics.notification({ type: NotificationType.Success }).catch(() => {});
            const nextFound = [...foundSpyIds, symbolId];
            setFoundSpyIds(nextFound);

            if (nextFound.length >= targetSymbolIds.length) {
                const baseScore = 120;
                const streakBonus = Math.min(streak, 10) * 2;
                const multiplier = targetSymbolIds.length >= 2 ? 2 : 1;
                onScore((baseScore + streakBonus) * multiplier);
                setStreak(prev => prev + 1);
                startRound(streak + 1);
            }
        } else {
            // Wrong
            playSound('error');
            Haptics.notification({ type: NotificationType.Error }).catch(() => {});
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
                                const isFound = foundSpyIds.includes(tile.id);
                                const hideFound = targetSymbolIds.length >= 2 && isFound;
                                return (
                                    <motion.div
                                        key={tile.key} // Using unique key for each instance
                                        layout
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        onPointerDown={(e) => {
                                            e.preventDefault();
                                            if (e.currentTarget.setPointerCapture) {
                                                try {
                                                    e.currentTarget.setPointerCapture(e.pointerId);
                                                } catch {
                                                    // Ignore capture errors on unsupported pointer types
                                                }
                                            }
                                            handleTileClick(tile.id);
                                        }}
                                        className={`${tileWidth} ${hideFound ? 'opacity-0 pointer-events-none scale-0' : 'bg-white/10'} rounded-xl border-2 border-white/20 flex items-center justify-center cursor-pointer hover:bg-white/20 active:scale-95 transition-colors shadow-lg`}
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
                        onPointerDown={(e) => {
                            e.preventDefault();
                            if (e.currentTarget.setPointerCapture) {
                                try {
                                    e.currentTarget.setPointerCapture(e.pointerId);
                                } catch {
                                    // Ignore capture errors on unsupported pointer types
                                }
                            }
                            handleReady();
                        }}
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
