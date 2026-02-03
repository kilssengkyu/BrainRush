import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';
import { useSound } from '../../contexts/SoundContext';

interface AimingGameProps {
    seed: string | null;
    onScore: (amount: number) => void;
    isPlaying: boolean;
}

interface Target {
    id: number;
    x: number; // percentage 0-100
    y: number; // percentage 0-100
    type: 'score' | 'penalty';
    createdAt: number;
    duration: number;
}

const AimingGame: React.FC<AimingGameProps> = ({ seed, onScore, isPlaying }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();

    const [targets, setTargets] = useState<Target[]>([]);
    const [scorePopup, setScorePopup] = useState<{ id: number, x: number, y: number, text: string, type: 'good' | 'bad' | 'perfect' } | null>(null);

    // Refs for game loop
    const requestRef = useRef<number | null>(null);
    const lastSpawnTime = useRef<number>(0);
    const startTimeRef = useRef<number>(Date.now());
    const targetIdCounter = useRef<number>(0);

    // Game params (difficulty progression)
    const getGameParams = useCallback(() => {
        const elapsed = Date.now() - startTimeRef.current;
        const difficulty = Math.min(elapsed / 30000, 1); // 0 to 1 over 30s

        // Spawn interval: 1000ms -> 400ms
        const spawnInterval = 1000 - (difficulty * 600);

        // Target duration: 2000ms -> 1200ms
        const duration = 2000 - (difficulty * 800);

        // Penalty chance: 10% -> 40%
        const penaltyChance = 0.1 + (difficulty * 0.3);

        return { spawnInterval, duration, penaltyChance };
    }, []);

    // RNG
    const rng = useRef<SeededRandom | null>(null);

    useEffect(() => {
        if (seed) {
            rng.current = new SeededRandom(seed);
            startTimeRef.current = Date.now();
            lastSpawnTime.current = Date.now();
            targetIdCounter.current = 0;

            setTargets([]);
            handledTargets.current.clear();
        }
    }, [seed]);

    const handledTargets = useRef<Set<number>>(new Set());

    const spawnTargets = useCallback((count: number) => {
        if (!rng.current) return;

        const { duration, penaltyChance } = getGameParams();
        setTargets(prev => {
            const nextTargets = [...prev];

            for (let i = 0; i < count; i += 1) {
                const type = rng.current!.next() < penaltyChance ? 'penalty' : 'score';
                // Try to find a non-overlapping position
                let x = 0, y = 0;
                let attempts = 0;
                let valid = false;

                // Safety loop to prevent infinite loop
                while (!valid && attempts < 10) {
                    // Keep padding from edges (10% to 90%)
                    x = 10 + rng.current!.next() * 80;
                    y = 10 + rng.current!.next() * 80;

                    // Simple distance check against existing targets (including newly added)
                    const collision = nextTargets.some(t => {
                        const dx = t.x - x;
                        const dy = t.y - y;
                        return (dx * dx + dy * dy) < 400; // 20 units distance
                    });

                    if (!collision) valid = true;
                    attempts++;
                }

                if (valid) {
                    nextTargets.push({
                        id: targetIdCounter.current++,
                        x,
                        y,
                        type,
                        createdAt: Date.now(),
                        duration
                    });
                }
            }

            return nextTargets;
        });
    }, [getGameParams]);

    const gameLoop = useCallback(() => {
        if (!isPlaying) {
            requestRef.current = requestAnimationFrame(gameLoop);
            return;
        }

        const now = Date.now();
        const { spawnInterval } = getGameParams();

        // Spawn logic
        if (now - lastSpawnTime.current > spawnInterval) {
            const elapsed = now - startTimeRef.current;
            const maxTargets = elapsed >= 20000 ? 3 : elapsed >= 10000 ? 2 : 1;
            const spawnCount = maxTargets === 1
                ? 1
                : 1 + Math.floor((rng.current?.next() ?? Math.random()) * maxTargets);
            spawnTargets(spawnCount);
            lastSpawnTime.current = now;
        }

        // Despawn / Timeout logic
        setTargets(prev => {
            const nextTargets = prev.filter(t => {
                const age = now - t.createdAt;
                const expired = age > t.duration;

                if (expired) {
                    // Handle expiration logic
                    if (t.type === 'penalty') {
                        // Blue circle disappeared without being clicked -> Bonus!
                        onScore(10);
                        // Optional: play sound or visual effect for "Safe"
                    }
                    return false; // Remove
                }
                return true; // Keep
            });
            return nextTargets;
        });

        requestRef.current = requestAnimationFrame(gameLoop);
    }, [spawnTargets, getGameParams, onScore, isPlaying]);

    useEffect(() => {
        requestRef.current = requestAnimationFrame(gameLoop);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [gameLoop]);

    const handleTargetClick = (target: Target) => {
        // Prevent double processing
        if (handledTargets.current.has(target.id)) return;
        handledTargets.current.add(target.id);

        // Remove target immediately
        setTargets(prev => prev.filter(t => t.id !== target.id));

        if (target.type === 'score') {
            const age = Date.now() - target.createdAt;
            // Speed Bonus Limit: 600ms
            if (age < 600) {
                // Perfect Hit
                playSound('correct');
                onScore(50); // 30 base + 20 bonus
                showPopup(target.x, target.y, 'PERFECT!! +50', 'perfect');
            } else {
                // Good Hit
                playSound('correct');
                onScore(30);
                showPopup(target.x, target.y, '+30', 'good');
            }
        } else {
            // Bad click
            playSound('error');
            onScore(-50);
            showPopup(target.x, target.y, '-50', 'bad');
        }
    };

    const showPopup = (x: number, y: number, text: string, type: 'good' | 'bad' | 'perfect') => {
        setScorePopup({ id: Math.random(), x, y, text, type });
        // Auto clear is handled by AnimatePresence
        setTimeout(() => setScorePopup(null), type === 'perfect' ? 800 : 500);
    };

    if (!seed) return <div className="text-white">{t('common.loading')}</div>;

    return (
        <div className="relative w-full h-full overflow-hidden select-none touch-manipulation">
            {/* Instruction Overlay (fades out or stays at top) */}
            <div className="absolute top-4 left-0 w-full text-center pointer-events-none z-0 opacity-50">
                <h2 className="text-3xl font-black text-white drop-shadow-md">{t('aim.title')}</h2>
                <p className="text-sm text-gray-300">{t('aim.instruction')}</p>
            </div>

            {/* Game Field */}
            <div className="relative w-full h-full">
                <AnimatePresence>
                    {targets.map(target => (
                        <motion.button
                            key={target.id}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            onPointerDown={(e) => {
                                e.preventDefault();
                                if (e.currentTarget.setPointerCapture) {
                                    try {
                                        e.currentTarget.setPointerCapture(e.pointerId);
                                    } catch {
                                        // Ignore capture errors on unsupported pointer types
                                    }
                                }
                                handleTargetClick(target);
                            }}
                            className={`absolute w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 shadow-xl flex items-center justify-center
                                ${target.type === 'score'
                                    ? 'bg-red-500 border-red-300 shadow-red-500/50'
                                    : 'bg-blue-500 border-blue-300 shadow-blue-500/50'}`}
                            style={{
                                left: `${target.x}%`,
                                top: `${target.y}%`,
                                transform: 'translate(-50%, -50%)', // Centering based on x/y
                                cursor: 'pointer',
                                zIndex: 10
                            }}
                        >
                            <div className="w-2/3 h-2/3 rounded-full bg-white/20 animate-pulse" />
                        </motion.button>
                    ))}
                </AnimatePresence>

                {/* Score Popups */}
                <AnimatePresence>
                    {scorePopup && (
                        <motion.div
                            key={scorePopup.id}
                            initial={{ opacity: 1, y: 0, scale: 0.5 }}
                            animate={{
                                opacity: scorePopup.type === 'perfect' ? [1, 1, 0] : 0,
                                y: -50,
                                scale: scorePopup.type === 'perfect' ? 1.5 : 1
                            }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: scorePopup.type === 'perfect' ? 0.8 : 0.5 }}
                            className={`absolute font-black whitespace-nowrap pointer-events-none select-none
                                ${scorePopup.type === 'good' ? 'text-green-400 text-2xl' :
                                    scorePopup.type === 'perfect' ? 'text-yellow-400 text-3xl drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]' :
                                        'text-red-500 text-2xl'}`}
                            style={{
                                left: `${scorePopup.x}%`,
                                top: `${scorePopup.y}%`,
                                transform: 'translate(-50%, -50%)',
                                zIndex: 20,
                                textShadow: '0 2px 10px rgba(0,0,0,0.5)'
                            }}
                        >
                            {scorePopup.text}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default AimingGame;
