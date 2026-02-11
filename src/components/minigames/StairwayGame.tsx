import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';
import { useSound } from '../../contexts/SoundContext';

interface StairwayGameProps {
    seed: string | null;
    onScore: (amount: number) => void;
    isPlaying: boolean;
}

type StepDirection = 'left' | 'right';

interface Step {
    id: number;
    direction: StepDirection; // direction FROM the previous step
    hasTrap: boolean; // whether the opposite side has a red trap platform
}

const STEP_SCORE = 20;
const FALL_PENALTY = -30;
const FALL_RESPAWN_MS = 500;
const VISIBLE_STEPS = 8;
const STEP_WIDTH = 60;
const STEP_HEIGHT = 28;
const STEP_OFFSET_X = 44; // horizontal offset per step
const STEP_OFFSET_Y = 52; // vertical offset per step
const PLAYER_SIZE = 24;

// Phase thresholds
const PHASE2_START = 30; // hints removed
const PHASE3_START = 60; // traps begin (30% chance, color camouflages over time)

const StairwayGame: React.FC<StairwayGameProps> = ({ seed, onScore, isPlaying }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [rng, setRng] = useState<SeededRandom | null>(null);
    const [steps, setSteps] = useState<Step[]>([]);
    const [playerStepIndex, setPlayerStepIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [falling, setFalling] = useState(false);
    const [fallSide, setFallSide] = useState<'left' | 'right'>('left');
    const nextIdRef = useRef(0);
    const containerRef = useRef<HTMLDivElement>(null);

    // Generate steps deterministically from seed
    const generateSteps = useCallback((random: SeededRandom, count: number, startId: number): Step[] => {
        const newSteps: Step[] = [];
        for (let i = 0; i < count; i++) {
            const direction: StepDirection = random.next() < 0.5 ? 'left' : 'right';
            const stepNum = startId + i;
            // Phase 3+: 30% base chance, increases to 50% over time
            const trapChance = stepNum >= PHASE3_START
                ? Math.min(0.3 + (stepNum - PHASE3_START) * 0.003, 0.5)
                : 0;
            const hasTrap = random.next() < trapChance;
            newSteps.push({ id: stepNum, direction, hasTrap });
        }
        return newSteps;
    }, []);

    // Initialize on seed change
    useEffect(() => {
        if (!seed) return;
        const newRng = new SeededRandom(seed + '_stairway');
        setRng(newRng);
        nextIdRef.current = 0;

        // First step has no direction (it's the starting platform)
        const initialSteps: Step[] = [{ id: nextIdRef.current++, direction: 'left', hasTrap: false }];
        const moreSteps = generateSteps(newRng, VISIBLE_STEPS + 2, nextIdRef.current);
        nextIdRef.current += moreSteps.length;
        initialSteps.push(...moreSteps);

        setSteps(initialSteps);
        setPlayerStepIndex(0);
        setScore(0);
        setFalling(false);
    }, [seed, generateSteps]);

    // Ensure enough steps ahead
    const ensureStepsAhead = useCallback(() => {
        if (!rng) return;
        setSteps(prev => {
            const aheadCount = prev.length - 1 - playerStepIndex;
            if (aheadCount < VISIBLE_STEPS + 2) {
                const needed = VISIBLE_STEPS + 4 - aheadCount;
                const newSteps = generateSteps(rng, needed, nextIdRef.current);
                nextIdRef.current += newSteps.length;
                return [...prev, ...newSteps];
            }
            return prev;
        });
    }, [rng, playerStepIndex, generateSteps]);

    useEffect(() => {
        ensureStepsAhead();
    }, [playerStepIndex, ensureStepsAhead]);

    const handleInput = useCallback((inputSide: 'left' | 'right') => {
        if (!isPlaying || falling) return;

        const nextIndex = playerStepIndex + 1;
        if (nextIndex >= steps.length) return;

        const nextStep = steps[nextIndex];

        if (inputSide === nextStep.direction) {
            // Correct!
            playSound('tick');
            onScore(STEP_SCORE);
            setScore(prev => prev + 1);
            setPlayerStepIndex(nextIndex);
        } else {
            // Wrong! Fall
            playSound('error');
            onScore(FALL_PENALTY);
            setFalling(true);
            setFallSide(inputSide);

            setTimeout(() => {
                setFalling(false);
            }, FALL_RESPAWN_MS);
        }
    }, [isPlaying, falling, playerStepIndex, steps, playSound, onScore]);

    // Touch/click handler: left half = left, right half = right
    const handleTouch = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        let clientX: number;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
        } else {
            clientX = e.clientX;
        }
        const midX = rect.left + rect.width / 2;
        handleInput(clientX < midX ? 'left' : 'right');
    }, [handleInput]);

    // Keyboard support
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft' || e.key === 'a') handleInput('left');
            if (e.key === 'ArrowRight' || e.key === 'd') handleInput('right');
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [handleInput]);

    // Calculate positions for visible steps relative to player
    const visibleRange = useMemo(() => {
        const start = Math.max(0, playerStepIndex - 1);
        const end = Math.min(steps.length, playerStepIndex + VISIBLE_STEPS + 1);
        return { start, end };
    }, [playerStepIndex, steps.length]);

    // Calculate cumulative x position for each step
    const stepPositions = useMemo(() => {
        const positions: { x: number; y: number }[] = [];
        if (steps.length === 0) return positions;

        positions.push({ x: 0, y: 0 });
        for (let i = 1; i < steps.length; i++) {
            const prev = positions[i - 1];
            const dir = steps[i].direction;
            positions.push({
                x: prev.x + (dir === 'left' ? -STEP_OFFSET_X : STEP_OFFSET_X),
                y: prev.y - STEP_OFFSET_Y,
            });
        }
        return positions;
    }, [steps]);

    // Camera offset: center on player
    const cameraOffset = useMemo(() => {
        if (stepPositions.length === 0) return { x: 0, y: 0 };
        const playerPos = stepPositions[playerStepIndex] || { x: 0, y: 0 };
        return {
            x: -playerPos.x,
            y: -playerPos.y + 80, // offset player slightly below center
        };
    }, [stepPositions, playerStepIndex]);

    return (
        <div
            ref={containerRef}
            className="w-full h-full flex flex-col items-center justify-center relative touch-none select-none overflow-hidden"
            onMouseDown={handleTouch}
            onTouchStart={handleTouch}
        >
            {/* Title */}
            <div className="absolute top-6 text-center w-full px-4 pointer-events-none z-20">
                <h2 className="text-2xl font-black text-white drop-shadow-md mb-1">
                    {t('stairway.title', '천국의 계단')}
                </h2>
                <div className="text-sm text-gray-400 font-bold">
                    {t('stairway.scoreLabel', '계단')}: <span className="text-yellow-400 text-lg font-black">{score}</span>
                </div>
            </div>

            {/* Left/Right touch indicators - large and semi-transparent */}
            <div className="absolute inset-0 flex pointer-events-none z-10">
                <div className="flex-1 flex items-center justify-center">
                    <span className="text-[120px] font-black text-white/[0.06] select-none leading-none">&lt;</span>
                </div>
                <div className="flex-1 flex items-center justify-center">
                    <span className="text-[120px] font-black text-white/[0.06] select-none leading-none">&gt;</span>
                </div>
            </div>


            {/* Game world */}
            <motion.div
                className="absolute"
                animate={{
                    x: cameraOffset.x,
                    y: cameraOffset.y,
                }}
                transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                style={{ width: 0, height: 0 }}
            >
                {/* Steps */}
                {steps.slice(visibleRange.start, visibleRange.end).map((step, i) => {
                    const actualIndex = visibleRange.start + i;
                    const pos = stepPositions[actualIndex];
                    if (!pos) return null;

                    const isCurrentStep = actualIndex === playerStepIndex;
                    const isNextStep = actualIndex === playerStepIndex + 1;
                    const isPast = actualIndex < playerStepIndex;
                    const showHint = step.id < PHASE2_START; // Phase 1 only

                    // Calculate trap position (opposite side of correct step)
                    const trapX = step.direction === 'left'
                        ? pos.x + STEP_OFFSET_X * 2  // trap on right
                        : pos.x - STEP_OFFSET_X * 2; // trap on left

                    // Trap color camouflage: red → orange → blue-ish over time
                    // Goes from 0 (pure red) to 1 (nearly identical to normal) over ~60 steps after PHASE3_START
                    const camouflageFactor = step.hasTrap
                        ? Math.min((step.id - PHASE3_START) / 60, 1)
                        : 0;

                    // Interpolate trap colors: red(0) → orange(0.5) → blue-ish(1)
                    const getTrapStyle = (isNext: boolean) => {
                        if (camouflageFactor < 0.5) {
                            // Red → Orange
                            const t = camouflageFactor * 2; // 0..1
                            const r = Math.round(239 - t * 50);   // 239 → 189
                            const g = Math.round(68 + t * 90);    // 68 → 158
                            const b = Math.round(68 + t * 20);    // 68 → 88
                            const opacity = isNext ? 0.85 : 0.55;
                            return {
                                backgroundColor: `rgba(${r},${g},${b},${opacity})`,
                                border: isNext ? `2px solid rgba(${r},${g + 20},${b},0.7)` : `1px solid rgba(${r},${g + 20},${b},0.4)`,
                            };
                        } else {
                            // Orange → Blue-ish (camouflage)
                            const t = (camouflageFactor - 0.5) * 2; // 0..1
                            const r = Math.round(189 - t * 130);  // 189 → 59
                            const g = Math.round(158 - t * 68);   // 158 → 90
                            const b = Math.round(88 + t * 120);   // 88 → 208
                            const opacity = isNext ? 0.8 : 0.5;
                            return {
                                backgroundColor: `rgba(${r},${g},${b},${opacity})`,
                                border: isNext ? `2px solid rgba(${r},${g + 20},${b},0.6)` : `1px solid rgba(${r},${g + 20},${b},0.3)`,
                            };
                        }
                    };

                    return (
                        <React.Fragment key={step.id}>
                            {/* Correct step */}
                            <motion.div
                                className={`absolute rounded-lg shadow-lg ${isCurrentStep
                                    ? 'bg-emerald-500 border-2 border-emerald-300 shadow-emerald-500/40'
                                    : isNextStep && step.id < PHASE3_START
                                        ? 'bg-yellow-500/80 border-2 border-yellow-400/60 shadow-yellow-500/20'
                                        : isPast
                                            ? 'bg-gray-700/40 border border-gray-600/30'
                                            : 'bg-blue-600/70 border border-blue-400/40'
                                    }`}
                                style={{
                                    width: STEP_WIDTH,
                                    height: STEP_HEIGHT,
                                    left: pos.x - STEP_WIDTH / 2,
                                    top: pos.y - STEP_HEIGHT / 2,
                                }}
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.15 }}
                            >
                                {/* Direction hint - Phase 1 only */}
                                {isNextStep && showHint && (
                                    <div className="absolute inset-0 flex items-center justify-center text-white/60 text-xs font-black">
                                        {step.direction === 'left' ? '←' : '→'}
                                    </div>
                                )}
                            </motion.div>

                            {/* Trap step (opposite side) - color camouflages over time */}
                            {step.hasTrap && !isPast && !isCurrentStep && (
                                <motion.div
                                    className="absolute rounded-lg shadow-lg"
                                    style={{
                                        width: STEP_WIDTH,
                                        height: STEP_HEIGHT,
                                        left: trapX - STEP_WIDTH / 2,
                                        top: pos.y - STEP_HEIGHT / 2,
                                        ...getTrapStyle(isNextStep),
                                    }}
                                    initial={{ opacity: 0, scale: 0.5 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.15 }}
                                />
                            )}
                        </React.Fragment>
                    );
                })}

                {/* Player */}
                <AnimatePresence>
                    {!falling && stepPositions[playerStepIndex] && (
                        <motion.div
                            key="player"
                            className="absolute bg-white rounded-md shadow-xl border-2 border-white/80 z-10"
                            style={{
                                width: PLAYER_SIZE,
                                height: PLAYER_SIZE,
                            }}
                            initial={false}
                            animate={{
                                left: stepPositions[playerStepIndex].x - PLAYER_SIZE / 2,
                                top: stepPositions[playerStepIndex].y - STEP_HEIGHT / 2 - PLAYER_SIZE - 2,
                                opacity: 1,
                                scale: 1,
                            }}
                            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                        >
                            {/* Face */}
                            <div className="w-full h-full flex items-center justify-center text-[10px]">
                                😊
                            </div>
                        </motion.div>
                    )}

                    {/* Falling animation */}
                    {falling && stepPositions[playerStepIndex] && (
                        <motion.div
                            key="falling-player"
                            className="absolute bg-red-400 rounded-md shadow-xl border-2 border-red-300 z-10"
                            style={{
                                width: PLAYER_SIZE,
                                height: PLAYER_SIZE,
                            }}
                            initial={{
                                left: stepPositions[playerStepIndex].x - PLAYER_SIZE / 2 + (fallSide === 'left' ? -STEP_OFFSET_X : STEP_OFFSET_X),
                                top: stepPositions[playerStepIndex].y - STEP_HEIGHT / 2 - PLAYER_SIZE - 2,
                                opacity: 1,
                                rotate: 0,
                            }}
                            animate={{
                                top: stepPositions[playerStepIndex].y + 200,
                                opacity: 0,
                                rotate: fallSide === 'left' ? -90 : 90,
                            }}
                            transition={{ duration: 0.4, ease: 'easeIn' }}
                        >
                            <div className="w-full h-full flex items-center justify-center text-[10px]">
                                😵
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* Flash overlay on wrong answer */}
            <AnimatePresence>
                {falling && (
                    <motion.div
                        key="flash"
                        className="absolute inset-0 bg-red-500/20 pointer-events-none z-30"
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4 }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default StairwayGame;
