import React, { useState, useEffect, useRef } from 'react';
import { motion, useAnimation, type PanInfo } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown } from 'lucide-react';
import { useSound } from '../../contexts/SoundContext';

interface ArrowSliderProps {
    seed: string | null;
    onScore: (amount: number) => void;
}

type Direction = 'left' | 'right' | 'up' | 'down';
type Color = 'blue' | 'red';

const ArrowSlider: React.FC<ArrowSliderProps> = ({ seed, onScore }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [rng, setRng] = useState<SeededRandom | null>(null);
    const [currentDirection, setCurrentDirection] = useState<Direction>('right');
    const [currentColor, setCurrentColor] = useState<Color>('blue');
    const [scoreCount, setScoreCount] = useState(0);
    const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

    const controls = useAnimation();
    const containerRef = useRef<HTMLDivElement>(null);

    // Initialize RNG
    useEffect(() => {
        if (seed) {
            const newRng = new SeededRandom(seed + '_arrow');
            setRng(newRng);
            generateNext(newRng, 0);
        }
    }, [seed]);

    const generateNext = (random: SeededRandom, currentScore: number) => {
        // Difficulty: Level 1 (<5 score) -> Only Left/Right
        //             Level 2 (>=5 score) -> Add Up/Down
        const allowVertical = currentScore >= 5;

        const directions: Direction[] = allowVertical
            ? ['left', 'right', 'up', 'down']
            : ['left', 'right'];

        const nextDir = directions[Math.floor(random.next() * directions.length)];
        const nextColor: Color = random.next() > 0.5 ? 'blue' : 'red'; // 50/50 Chance

        setCurrentDirection(nextDir);
        setCurrentColor(nextColor);

        // Reset animation
        controls.set({ x: 0, y: 0, opacity: 0, scale: 0.5 });
        controls.start({ opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 20 } });
    };

    const handlePanEnd = async (_: any, info: PanInfo) => {
        if (feedback) return;

        const { offset, velocity } = info;
        const threshold = 50;
        const velocityThreshold = 500;

        let swipeDir: Direction | null = null;

        if (Math.abs(offset.x) > Math.abs(offset.y)) {
            // Horizontal
            if (offset.x > threshold || velocity.x > velocityThreshold) swipeDir = 'right';
            else if (offset.x < -threshold || velocity.x < -velocityThreshold) swipeDir = 'left';
        } else {
            // Vertical
            if (offset.y > threshold || velocity.y > velocityThreshold) swipeDir = 'down';
            else if (offset.y < -threshold || velocity.y < -velocityThreshold) swipeDir = 'up';
        }

        if (swipeDir) {
            handleSwipe(swipeDir);
        } else {
            // Snap back if no valid swipe
            controls.start({ x: 0, y: 0 });
        }
    };

    const handleSwipe = async (swipeDir: Direction) => {
        // Logic:
        // Blue -> Swipe SAME direction
        // Red -> Swipe OPPOSITE direction

        let correctDir: Direction = currentDirection;
        if (currentColor === 'red') {
            if (currentDirection === 'left') correctDir = 'right';
            else if (currentDirection === 'right') correctDir = 'left';
            else if (currentDirection === 'up') correctDir = 'down';
            else if (currentDirection === 'down') correctDir = 'up';
        }

        if (swipeDir === correctDir) {
            // Correct
            setFeedback('correct');
            onScore(50 + Math.min(scoreCount * 5, 50)); // Bonus for streak/progress
            setScoreCount(prev => prev + 1);
            playSound('correct');

            // Animate out in the swipe direction
            const xMove = swipeDir === 'left' ? -200 : swipeDir === 'right' ? 200 : 0;
            const yMove = swipeDir === 'up' ? -200 : swipeDir === 'down' ? 200 : 0;

            await controls.start({
                x: xMove,
                y: yMove,
                opacity: 0,
                transition: { duration: 0.15 }
            });

            setFeedback(null);
            if (rng) generateNext(rng, scoreCount + 1);

        } else {
            // Wrong
            setFeedback('wrong');
            onScore(-30);
            playSound('error');

            // Shake animation
            await controls.start({
                x: [-10, 10, -10, 10, 0],
                transition: { duration: 0.4 }
            });
            setFeedback(null);
        }
    };

    // Icon mapping
    const getIcon = () => {
        const size = 120;
        const props = { size, strokeWidth: 3 };
        switch (currentDirection) {
            case 'left': return <ArrowLeft {...props} />;
            case 'right': return <ArrowRight {...props} />;
            case 'up': return <ArrowUp {...props} />;
            case 'down': return <ArrowDown {...props} />;
        }
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center relative touch-none select-none">
            {/* Instruction Overlay */}
            <div className="absolute top-10 text-center w-full px-4 pointer-events-none">
                <h2 className="text-3xl font-black text-white drop-shadow-md mb-2">{t('arrow.title')}</h2>
                <div className="flex justify-center gap-4 text-sm font-bold bg-black/40 p-2 rounded-xl backdrop-blur-sm">
                    <span className="text-blue-400">{t('arrow.blue')}</span>
                    <span className="text-white">|</span>
                    <span className="text-red-400">{t('arrow.red')}</span>
                </div>
            </div>

            {/* Interactive Card */}
            <motion.div
                ref={containerRef}
                onPanEnd={handlePanEnd}
                animate={controls}
                whileTap={{ scale: 0.95 }}
                className={`
                    w-64 h-64 rounded-3xl shadow-2xl flex items-center justify-center
                    border-8 cursor-grab active:cursor-grabbing relative
                    ${currentColor === 'blue'
                        ? 'bg-blue-100 border-blue-500 text-blue-600'
                        : 'bg-red-100 border-red-500 text-red-600'}
                    ${feedback === 'correct' ? 'scale-110 opacity-0' : ''}
                `}
            >
                {getIcon()}
            </motion.div>

            <p className="mt-12 text-gray-400 animate-pulse text-sm text-center max-w-xs">
                {t('arrow.instruction')}
            </p>
        </div>
    );
};

export default ArrowSlider;
