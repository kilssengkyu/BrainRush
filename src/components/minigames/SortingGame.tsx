import React, { useState, useEffect, useRef } from 'react';
import { usePanelProgress } from '../../hooks/usePanelProgress';
import { motion, useAnimation } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { Star, Heart, Circle, Square, Triangle, Hexagon } from 'lucide-react';
import { SeededRandom } from '../../utils/seededRandom';
import { useSound } from '../../contexts/SoundContext';

interface SortingGameProps {
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
];

const SortingGame: React.FC<SortingGameProps> = ({ seed, onScore, isPlaying }) => {
    const { playSound } = useSound();
    const controls = useAnimation();
    const previewControls = useAnimation();

    const [streak, setStreak] = usePanelProgress(seed, 'streak');
    const [currentSymbol, setCurrentSymbol] = useState<typeof SYMBOLS[0] | null>(null);
    const [nextSymbol, setNextSymbol] = useState<typeof SYMBOLS[0] | null>(null);
    const [isPromotingNextCard, setIsPromotingNextCard] = useState(false);

    // History: { symbolId, direction ('left' | 'right') }
    const [lastMove, setLastMove] = useState<{ symbolId: string, direction: 'left' | 'right' } | null>(null);

    const rng = useRef<SeededRandom | null>(null);

    // Initialize Game
    useEffect(() => {
        if (seed) {
            rng.current = new SeededRandom(seed);
            setLastMove(null);

            // Initial Symbols — use restored streak for correct pool size
            const pool = getSymbolPool(streak);
            const first = pool[Math.floor(rng.current.next() * pool.length)];

            // Generate second symbol with 50/50 rule relative to first
            let second;
            if (rng.current.next() < 0.5) {
                second = first;
            } else {
                const diffPool = pool.filter(s => s.id !== first.id);
                second = diffPool[Math.floor(rng.current.next() * diffPool.length)];
            }

            setCurrentSymbol(first);
            setNextSymbol(second);
            controls.set({ x: 0, y: 0, scale: 1, opacity: 1 });
            previewControls.set({ y: 0, scale: 1, opacity: 1 });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
        if (!isPlaying || isPromotingNextCard) {
            controls.start({ x: 0, opacity: 1 });
            return;
        }

        const threshold = 100;
        if (Math.abs(info.offset.x) > threshold) {
            const direction = info.offset.x > 0 ? 'right' : 'left';
            await processMove(direction);
        } else {
            controls.start({ x: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 20 } });
        }
    };

    const processMove = async (direction: 'left' | 'right') => {
        if (!currentSymbol || !rng.current || isPromotingNextCard) return;

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

        const scoreAmount = 10 + Math.min(streak, 30);

        if (isCorrect) {
            playSound('correct');
            onScore(scoreAmount);

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
            if (!nextSymbol) return;
            const promotedSymbol = nextSymbol;

            const pool = getSymbolPool(streak + 1);
            let newNext: typeof SYMBOLS[0];

            if (rng.current.next() < 0.5) {
                // 50% Chance: SAME symbol as the one becoming current
                newNext = nextSymbol;
            } else {
                // 50% Chance: DIFFERENT symbol
                const diffPool = pool.filter(s => s.id !== nextSymbol.id);
                // Fallback to random from full pool if diffPool is empty (should unlikely happen as min count is 2)
                if (diffPool.length > 0) {
                    newNext = diffPool[Math.floor(rng.current.next() * diffPool.length)];
                } else {
                    newNext = pool[Math.floor(rng.current.next() * pool.length)];
                }
            }

            setIsPromotingNextCard(true);
            await previewControls.start({
                y: 180,
                scale: 1.58,
                opacity: 1,
                transition: { duration: 0.14, ease: 'easeOut' }
            });
            setCurrentSymbol(promotedSymbol);
            setNextSymbol(newNext);
            controls.set({ x: 0, y: 0, scale: 1, opacity: 1 });
            previewControls.set({ y: 0, scale: 1, opacity: 1 });
            setIsPromotingNextCard(false);

        } else {
            playSound('error');
            onScore(-scoreAmount);
            // Shake animation
            await controls.start({ x: direction === 'right' ? 20 : -20, transition: { duration: 0.1 } });
            await controls.start({ x: direction === 'right' ? -20 : 20, transition: { duration: 0.1 } });
            await controls.start({ x: 0, transition: { duration: 0.1 } });
        }
    };

    if (!currentSymbol) return null;

    const CurrentIcon = currentSymbol.icon;
    const NextIcon = nextSymbol?.icon;

    return (
        <div className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden">
            {/* Hint Arrows */}


            {/* Card Stack */}
            <div className="relative w-64 h-80 flex items-center justify-center">
                {/* Next Card (Preview) - above current card, no overlap */}
                {nextSymbol && NextIcon && (
                    <motion.div
                        animate={previewControls}
                        className="absolute bottom-[95%] left-1/2 -translate-x-1/2 w-40 h-52 bg-gray-800 rounded-2xl border-4 border-white/20 shadow-xl flex flex-col items-center justify-center z-0 pointer-events-none"
                    >
                        <NextIcon size={58} className={`${nextSymbol.color} drop-shadow-lg mb-3`} />
                        <div className="text-white/50 font-mono text-[10px] uppercase tracking-widest">{nextSymbol.id}</div>
                    </motion.div>
                )}


                {/* Current Card (Draggable) */}
                {!isPromotingNextCard && (
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
                )}
            </div>


        </div>
    );
};

export default SortingGame;
