import React, { useState, useEffect, useRef } from 'react';
import { motion, useAnimation } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useSound } from '../../contexts/SoundContext';

interface NumberUpDownProps {
    seed: string | null;
    onScore: (amount: number) => void;
}

const NumberUpDown: React.FC<NumberUpDownProps> = ({ seed, onScore }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();

    const [prevNumber, setPrevNumber] = useState(0);
    const [currentNumber, setCurrentNumber] = useState<number>(0);
    const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
    const [rng, setRng] = useState<SeededRandom | null>(null);
    const [isGameStarted, setIsGameStarted] = useState(false);

    // Animation controls for the card
    const controls = useAnimation();
    const containerRef = useRef<HTMLDivElement>(null);

    // Initialize RNG
    useEffect(() => {
        if (seed) {
            const newRng = new SeededRandom(seed + '_updown');
            setRng(newRng);
            // Default start is 0
            setCurrentNumber(0);
            setPrevNumber(0);
        }
    }, [seed]);

    const startGame = async () => {
        setIsGameStarted(true);
        // Animate 0 flying away (up)
        await controls.start({
            y: -1000,
            opacity: 0,
            transition: { duration: 0.15, ease: "easeIn" }
        });

        generateNextNumber();
    };

    const generateNextNumber = () => {
        if (!rng) return;

        // If it's the very first generation after start (when current is 0), just pick next
        // If playing, prev becomes current.
        if (isGameStarted) {
            setPrevNumber(currentNumber);
        }

        let next = Math.floor(rng.next() * 99) + 1;
        // Avoid duplicates
        while (next === currentNumber) {
            next = Math.floor(rng.next() * 99) + 1;
        }

        setCurrentNumber(next);

        // Entry animation - Faster
        controls.set({ x: 0, y: 0, opacity: 0, scale: 0.95 });
        controls.start({ opacity: 1, scale: 1, transition: { duration: 0.1 } });
    };

    // Use onPanEnd for swipe detection without moving the element during drag
    const handlePanEnd = async (_: any, info: PanInfo) => {
        if (!isGameStarted || feedback !== null) return;

        const threshold = 50; // Smaller threshold since it's a quick swipe check
        const { offset, velocity } = info;

        // Check both offset and velocity to feel responsive
        if (offset.y < -threshold || velocity.y < -500) {
            await handleChoice('up');
        } else if (offset.y > threshold || velocity.y > 500) {
            await handleChoice('down');
        }
    };

    const handleChoice = async (direction: 'up' | 'down') => {
        if (currentNumber === null) return;

        const isBigger = currentNumber > prevNumber;
        const isUpCorrect = isBigger && direction === 'up';
        const isDownCorrect = !isBigger && direction === 'down';

        // Exact match shouldn't happen with our generator, but if it did:
        // Technically neither is "bigger" or "smaller", but let's assume strict inequality.

        if (isUpCorrect || isDownCorrect) {
            // Correct
            setFeedback('correct');
            onScore(50); // Score points
            playSound('correct');

            // Animate card flying away
            const targetY = direction === 'up' ? -1000 : 1000;
            await controls.start({
                y: targetY,
                opacity: 0,
                transition: { duration: 0.1, ease: "easeIn" }
            });

            setFeedback(null);
            generateNextNumber();
        } else {
            // Wrong
            setFeedback('wrong');
            onScore(-30); // Penalty
            playSound('error');

            // Shake animation
            await controls.start({
                x: [-10, 10, -10, 10, 0],
                transition: { duration: 0.4 }
            });
            setFeedback(null);
        }
    };

    // Keyboard support
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isGameStarted || feedback !== null) return; // Prevent input if game not started or feedback is active
            if (e.key === 'ArrowUp') handleChoice('up');
            if (e.key === 'ArrowDown') handleChoice('down');
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentNumber, prevNumber, rng, isGameStarted, feedback]); // Added isGameStarted and feedback to dependencies



    return (
        <div className="flex flex-col items-center justify-center w-full h-full relative overflow-hidden" ref={containerRef}>
            {/* Instruction */}
            <div className="absolute top-10 text-center z-10 pointer-events-none">
                <h2 className="text-3xl font-black text-white drop-shadow-md mb-2">{t('updown.title')}</h2>
                <p className="text-white/80 animate-pulse">{t('updown.instruction')}</p>
            </div>

            {/* Previous Number Indicator REMOVED as per user request to enforce memory */
                /* <div className="absolute bottom-20 ..."> ... </div> */
            }

            {/* Swipe Guides - Only show when playing */}
            {isGameStarted && (
                <>
                    <div className="absolute inset-x-0 top-1/4 flex justify-center opacity-5 pointer-events-none">
                        <ChevronUp size={64} className="text-white" />
                    </div>
                    <div className="absolute inset-x-0 bottom-1/4 flex justify-center opacity-5 pointer-events-none">
                        <ChevronDown size={64} className="text-white" />
                    </div>
                </>
            )}

            {/* Main Card */}
            <motion.div
                onPanEnd={handlePanEnd}
                animate={controls}
                whileTap={isGameStarted ? { scale: 0.98 } : undefined}
                className={`
                    w-64 h-80 rounded-3xl shadow-2xl flex items-center justify-center
                    bg-white border-4 relative z-20 cursor-grab touch-none select-none
                    ${feedback === 'wrong' ? 'border-red-500 bg-red-50 text-red-500' : 'border-blue-500 text-slate-800'}
                    ${feedback === 'correct' ? 'border-green-500 bg-green-50 text-green-500' : ''}
                `}
            >
                <span className="text-9xl font-black">
                    {currentNumber}
                </span>
            </motion.div>

            {/* Start Button */}
            {!isGameStarted && (
                <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={startGame}
                    className="absolute bottom-20 bg-white text-blue-600 px-8 py-3 rounded-full font-bold text-xl shadow-lg z-30 hover:bg-blue-50 transition-colors"
                >
                    {t('updown.start')}
                </motion.button>
            )}
        </div>
    );
};

export default NumberUpDown;
