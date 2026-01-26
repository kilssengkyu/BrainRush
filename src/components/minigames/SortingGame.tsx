import React, { useState, useEffect, useRef } from 'react';
import { motion, useAnimation } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Star, Heart, Circle, Square, Triangle, Hexagon } from 'lucide-react';
import { SeededRandom } from '../../utils/seededRandom';
import { useSound } from '../../contexts/SoundContext';

interface SortingGameProps {
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
];

const SortingGame: React.FC<SortingGameProps> = ({ seed, onScore }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const controls = useAnimation();

    const [streak, setStreak] = useState(0);
    const [currentSymbol, setCurrentSymbol] = useState<typeof SYMBOLS[0] | null>(null);
    const [nextSymbol, setNextSymbol] = useState<typeof SYMBOLS[0] | null>(null);

    // History: { symbolId, direction ('left' | 'right') }
    const [lastMove, setLastMove] = useState<{ symbolId: string, direction: 'left' | 'right' } | null>(null);

    const rng = useRef<SeededRandom | null>(null);

    // Initialize Game
    useEffect(() => {
        if (seed) {
            rng.current = new SeededRandom(seed);
            setStreak(0);
            setLastMove(null);

            // Initial Symbols
            const pool = getSymbolPool(0);
            const first = pool[Math.floor(rng.current.next() * pool.length)];
            const second = pool[Math.floor(rng.current.next() * pool.length)];

            setCurrentSymbol(first);
            setNextSymbol(second);
        }
    }, [seed]);

    const getSymbolPool = (currentStreak: number) => {
        let count = 2;
        if (currentStreak >= 15) count = 6;
        else if (currentStreak >= 10) count = 5;
        else if (currentStreak >= 5) count = 4;
        else if (currentStreak >= 2) count = 3;

        return SYMBOLS.slice(0, count);
    };

    const handleDragEnd = async (_: any, info: PanInfo) => {
        const threshold = 100;
        if (Math.abs(info.offset.x) > threshold) {
            const direction = info.offset.x > 0 ? 'right' : 'left';
            await processMove(direction);
        } else {
            controls.start({ x: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 20 } });
        }
    };

    const processMove = async (direction: 'left' | 'right') => {
        if (!currentSymbol || !rng.current) return;

        let isCorrect = false;

        if (!lastMove) {
            // First move is always correct (sets the precedent)
            isCorrect = true;
        } else {
            // Logic:
            // Same Symbol -> Same Direction
            // Diff Symbol -> Diff Direction
            const isSameSymbol = currentSymbol.id === lastMove.symbolId;
            const isSameDirection = direction === lastMove.direction;

            if (isSameSymbol) {
                isCorrect = isSameDirection;
            } else {
                isCorrect = !isSameDirection;
            }
        }

        if (isCorrect) {
            playSound('correct');
            onScore(10 + Math.min(streak, 20));

            // Animate out
            await controls.start({
                x: direction === 'right' ? 500 : -500,
                opacity: 0,
                transition: { duration: 0.2 }
            });

            // Update State
            setLastMove({ symbolId: currentSymbol.id, direction });
            setStreak(prev => prev + 1);

            // Shift Next -> Current, Generate New Next
            setCurrentSymbol(nextSymbol);

            const pool = getSymbolPool(streak + 1);
            const newNext = pool[Math.floor(rng.current.next() * pool.length)];
            setNextSymbol(newNext);

            // Reset position for new card
            controls.set({ x: 0, scale: 1, opacity: 0 }); // Start at scale 1
            await controls.start({ opacity: 1, transition: { duration: 0.2 } }); // Simple fade in

        } else {
            playSound('error');
            onScore(-10);
            // Shake animation
            await controls.start({ x: direction === 'right' ? 20 : -20, transition: { duration: 0.1 } });
            await controls.start({ x: direction === 'right' ? -20 : 20, transition: { duration: 0.1 } });
            await controls.start({ x: 0, transition: { duration: 0.1 } });
        }
    };

    if (!currentSymbol) return null;

    const CurrentIcon = currentSymbol.icon;

    return (
        <div className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden">
            {/* Guide Text */}
            <div className="absolute top-10 text-white/70 text-center text-sm font-medium z-0 animate-pulse">
                {!lastMove ? t('sorting.firstMoveHint') : t('sorting.instruction')}
            </div>
            {/* Guide Text */}


            {/* Hint Arrows */}


            {/* Card Stack */}
            <div className="relative w-64 h-80 flex items-center justify-center">


                {/* Current Card (Draggable) */}
                <motion.div
                    className="absolute w-full h-full bg-gray-800 rounded-3xl border-4 border-white/20 shadow-2xl flex flex-col items-center justify-center z-10 cursor-grab active:cursor-grabbing"
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.7} // Springy feeling
                    onDragEnd={handleDragEnd}
                    animate={controls}
                    whileTap={{ scale: 1.05 }}
                >
                    <CurrentIcon size={100} className={`${currentSymbol.color} drop-shadow-lg mb-8`} />
                    <div className="text-white/50 font-mono text-sm uppercase tracking-widest">{currentSymbol.id}</div>
                </motion.div>
            </div>


        </div>
    );
};

export default SortingGame;
