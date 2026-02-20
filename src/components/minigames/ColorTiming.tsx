import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSound } from '../../contexts/SoundContext';

interface ColorTimingProps {
    onScore: (amount: number) => void;
    isPlaying: boolean;
}

type Lane = 'left' | 'right';
type BallColor = 'blue' | 'red';

interface Ball {
    id: number;
    lane: Lane;
    color: BallColor;
    y: number;
}

const HIT_LINE = 78;
const HIT_WINDOW = 6;
const MISS_LINE = 95;
const BASE_SPAWN_MIN_MS = 420;
const BASE_SPAWN_MAX_MS = 760;
const MIN_SPAWN_MIN_MS = 170;
const MIN_SPAWN_MAX_MS = 320;
const SPAWN_RATE_MULTIPLIER = 1.2;
const BASE_SPEED = 24;
const MAX_SPEED = 50;
const SAME_LANE_MIN_GAP = 16;

const ColorTiming: React.FC<ColorTimingProps> = ({ onScore, isPlaying }) => {
    const { playSound } = useSound();
    const [balls, setBalls] = useState<Ball[]>([]);
    const [pressedLanes, setPressedLanes] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
    const [feedback, setFeedback] = useState<{ lane: Lane; text: string; good: boolean } | null>(null);
    const [laneFlash, setLaneFlash] = useState<{ left: 'good' | 'bad' | null; right: 'good' | 'bad' | null }>({
        left: null,
        right: null
    });
    const [showTouchHint, setShowTouchHint] = useState(false);

    const ballsRef = useRef<Ball[]>([]);
    const nextIdRef = useRef(1);
    const rafRef = useRef<number | null>(null);
    const lastTickRef = useRef(0);
    const nextSpawnRef = useRef(0);
    const elapsedSecRef = useRef(0);
    const isPlayingRef = useRef(isPlaying);
    const onScoreRef = useRef(onScore);
    const hintTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    useEffect(() => {
        onScoreRef.current = onScore;
    }, [onScore]);

    const getDifficulty01 = useCallback(() => {
        return Math.min(1, elapsedSecRef.current / 30);
    }, []);

    const getCurrentSpeed = useCallback(() => {
        const t = getDifficulty01();
        return BASE_SPEED + (MAX_SPEED - BASE_SPEED) * t;
    }, [getDifficulty01]);

    const scheduleNextSpawn = useCallback((now: number) => {
        const t = getDifficulty01();
        const minDelay = BASE_SPAWN_MIN_MS - (BASE_SPAWN_MIN_MS - MIN_SPAWN_MIN_MS) * t;
        const maxDelay = BASE_SPAWN_MAX_MS - (BASE_SPAWN_MAX_MS - MIN_SPAWN_MAX_MS) * t;
        const rawDelay = minDelay + Math.random() * Math.max(20, maxDelay - minDelay);
        const delay = rawDelay / SPAWN_RATE_MULTIPLIER;
        nextSpawnRef.current = now + delay;
    }, [getDifficulty01]);

    const canSpawnInLane = useCallback((lane: Lane) => {
        // Prevent visual overlap: do not spawn into a lane if another ball is still near spawn zone.
        return !ballsRef.current.some((b) => b.lane === lane && b.y < SAME_LANE_MIN_GAP);
    }, []);

    const spawnBall = useCallback((forcedLane?: Lane) => {
        const lane: Lane = forcedLane ?? (Math.random() < 0.5 ? 'left' : 'right');
        if (!canSpawnInLane(lane)) {
            return false;
        }
        const color: BallColor = lane === 'left'
            ? (Math.random() < 0.75 ? 'blue' : 'red')
            : (Math.random() < 0.75 ? 'red' : 'blue');
        ballsRef.current.push({
            id: nextIdRef.current++,
            lane,
            color,
            y: -10
        });
        return true;
    }, [canSpawnInLane]);

    const showFeedback = useCallback((lane: Lane, text: string, good: boolean) => {
        setFeedback({ lane, text, good });
        window.setTimeout(() => {
            setFeedback((prev) => (prev?.lane === lane ? null : prev));
        }, 320);
    }, []);

    const flashLane = useCallback((lane: Lane, result: 'good' | 'bad') => {
        setLaneFlash((prev) => ({ ...prev, [lane]: result }));
        window.setTimeout(() => {
            setLaneFlash((prev) => ({ ...prev, [lane]: null }));
        }, 180);
    }, []);

    const judgeLane = useCallback((lane: Lane, playAudio: boolean = true): 'good' | 'bad' | 'miss' => {
        if (!isPlayingRef.current) return 'miss';
        const laneBalls = ballsRef.current
            .filter((b) => b.lane === lane)
            .sort((a, b) => Math.abs(a.y - HIT_LINE) - Math.abs(b.y - HIT_LINE));

        const nearest = laneBalls[0];
        if (!nearest || Math.abs(nearest.y - HIT_LINE) > HIT_WINDOW) {
            onScoreRef.current(-20);
            if (playAudio) playSound('error');
            showFeedback(lane, 'MISS', false);
            flashLane(lane, 'bad');
            return 'miss';
        }

        const isCorrect =
            (lane === 'left' && nearest.color === 'blue') ||
            (lane === 'right' && nearest.color === 'red');

        ballsRef.current = ballsRef.current.filter((b) => b.id !== nearest.id);
        setBalls([...ballsRef.current]);

        if (isCorrect) {
            onScoreRef.current(30);
            if (playAudio) playSound('correct');
            showFeedback(lane, '+30', true);
            flashLane(lane, 'good');
            return 'good';
        }

        onScoreRef.current(-40);
        if (playAudio) playSound('error');
        showFeedback(lane, '-40', false);
        flashLane(lane, 'bad');
        return 'bad';
    }, [flashLane, playSound, showFeedback]);

    useEffect(() => {
        if (!isPlaying) {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
            if (hintTimeoutRef.current) {
                window.clearTimeout(hintTimeoutRef.current);
                hintTimeoutRef.current = null;
            }
            rafRef.current = null;
            ballsRef.current = [];
            setBalls([]);
            setPressedLanes({ left: false, right: false });
            setFeedback(null);
            setLaneFlash({ left: null, right: null });
            setShowTouchHint(false);
            return;
        }

        ballsRef.current = [];
        setBalls([]);
        setShowTouchHint(true);
        if (hintTimeoutRef.current) {
            window.clearTimeout(hintTimeoutRef.current);
        }
        hintTimeoutRef.current = window.setTimeout(() => {
            setShowTouchHint(false);
            hintTimeoutRef.current = null;
        }, 1200);
        elapsedSecRef.current = 0;
        lastTickRef.current = performance.now();
        scheduleNextSpawn(lastTickRef.current);

        const tick = (now: number) => {
            const dt = (now - lastTickRef.current) / 1000;
            lastTickRef.current = now;
            elapsedSecRef.current += dt;

            const currentSpeed = getCurrentSpeed();

            if (now >= nextSpawnRef.current) {
                const firstLane: Lane = Math.random() < 0.5 ? 'left' : 'right';
                const secondLane: Lane = firstLane === 'left' ? 'right' : 'left';
                spawnBall(firstLane);
                const t = getDifficulty01();
                if (Math.random() < 0.12 + t * 0.38) {
                    // Second spawn always targets the opposite lane to avoid stacking overlap.
                    spawnBall(secondLane);
                }
                scheduleNextSpawn(now);
            }

            let missPenalty = 0;
            for (let i = ballsRef.current.length - 1; i >= 0; i--) {
                const b = ballsRef.current[i];
                b.y += currentSpeed * dt;

                if (b.y > MISS_LINE) {
                    const shouldHaveHit =
                        (b.lane === 'left' && b.color === 'blue') ||
                        (b.lane === 'right' && b.color === 'red');
                    if (shouldHaveHit) {
                        missPenalty += 20;
                    }
                    ballsRef.current.splice(i, 1);
                }
            }

            if (missPenalty > 0) {
                onScoreRef.current(-missPenalty);
                playSound('error');
            }

            setBalls([...ballsRef.current]);
            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            if (hintTimeoutRef.current) {
                window.clearTimeout(hintTimeoutRef.current);
                hintTimeoutRef.current = null;
            }
        };
    }, [getCurrentSpeed, getDifficulty01, isPlaying, playSound, scheduleNextSpawn, spawnBall]);

    const handlePress = (lane: Lane) => {
        setPressedLanes((prev) => ({ ...prev, [lane]: true }));
        judgeLane(lane);
        window.setTimeout(() => {
            setPressedLanes((prev) => ({ ...prev, [lane]: false }));
        }, 120);
    };

    const renderBall = (ball: Ball) => {
        const leftClass = ball.lane === 'left' ? 'left-1/4 -translate-x-1/2' : 'left-3/4 -translate-x-1/2';
        const colorClass =
            ball.color === 'blue'
                ? 'bg-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.65)]'
                : 'bg-red-400 shadow-[0_0_20px_rgba(248,113,113,0.65)]';

        return (
            <div
                key={ball.id}
                className={`absolute ${leftClass} w-9 h-9 rounded-full ${colorClass} border border-white/60`}
                style={{ top: `${ball.y}%` }}
            />
        );
    };

    const renderTarget = (lane: Lane) => {
        const leftClass = lane === 'left' ? 'left-1/4 -translate-x-1/2' : 'left-3/4 -translate-x-1/2';
        const baseColor = lane === 'left' ? 'border-blue-300/70 bg-blue-500/25' : 'border-red-300/70 bg-red-500/25';
        const activeColor =
            lane === 'left'
                ? 'ring-4 ring-blue-400/40 scale-105'
                : 'ring-4 ring-red-400/40 scale-105';
        const isActive = pressedLanes[lane];
        const flashColor =
            laneFlash[lane] === 'good'
                ? 'bg-green-400/40 border-green-300'
                : laneFlash[lane] === 'bad'
                    ? 'bg-red-400/40 border-red-300'
                    : '';

        return (
            <div
                className={`absolute ${leftClass} w-16 h-16 rounded-full border-2 transition-colors duration-150 ${baseColor} ${flashColor} ${isActive ? activeColor : ''}`}
                style={{ top: `${HIT_LINE - 3}%` }}
            />
        );
    };

    const handleAreaPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (e.pointerType !== 'mouse') return;
        const rect = e.currentTarget.getBoundingClientRect();
        const isLeft = e.clientX < rect.left + rect.width / 2;
        handlePress(isLeft ? 'left' : 'right');
    };

    const handleAreaTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const lanes = new Set<Lane>();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const isLeft = touch.clientX < rect.left + rect.width / 2;
            lanes.add(isLeft ? 'left' : 'right');
        }

        // Simultaneous touch: judge both lanes, but play one consolidated SFX to avoid native audio collision.
        if (lanes.size > 1) {
            const results: Array<'good' | 'bad' | 'miss'> = [];
            lanes.forEach((lane) => {
                setPressedLanes((prev) => ({ ...prev, [lane]: true }));
                const result = judgeLane(lane, false);
                results.push(result);
                window.setTimeout(() => {
                    setPressedLanes((prev) => ({ ...prev, [lane]: false }));
                }, 120);
            });

            if (results.some((r) => r === 'bad' || r === 'miss')) {
                playSound('error');
            } else if (results.some((r) => r === 'good')) {
                playSound('correct');
            }
            return;
        }

        lanes.forEach((lane) => handlePress(lane));
    };

    return (
        <div
            className="w-full h-full relative overflow-hidden rounded-3xl bg-gradient-to-b from-gray-900/70 to-black/60 border border-white/10 select-none"
            onPointerDown={handleAreaPointerDown}
            onTouchStart={handleAreaTouchStart}
        >
            <div
                className={`absolute inset-y-0 left-0 w-1/2 transition-colors duration-150 pointer-events-none ${
                    laneFlash.left === 'good' ? 'bg-green-500/16' : laneFlash.left === 'bad' ? 'bg-red-500/16' : 'bg-transparent'
                }`}
            />
            <div
                className={`absolute inset-y-0 right-0 w-1/2 transition-colors duration-150 pointer-events-none ${
                    laneFlash.right === 'good' ? 'bg-green-500/16' : laneFlash.right === 'bad' ? 'bg-red-500/16' : 'bg-transparent'
                }`}
            />
            <div className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
            {renderTarget('left')}
            {renderTarget('right')}
            {showTouchHint && (
                <>
                    <div className="absolute inset-y-0 left-0 w-1/2 bg-blue-500/22 animate-pulse pointer-events-none">
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-blue-100 text-4xl font-black tracking-widest drop-shadow-[0_0_10px_rgba(59,130,246,0.9)]">
                                TOUCH
                            </span>
                        </div>
                    </div>
                    <div className="absolute inset-y-0 right-0 w-1/2 bg-red-500/22 animate-pulse pointer-events-none">
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-red-100 text-4xl font-black tracking-widest drop-shadow-[0_0_10px_rgba(248,113,113,0.9)]">
                                TOUCH
                            </span>
                        </div>
                    </div>
                </>
            )}
            {balls.map(renderBall)}

            {feedback && (
                <div
                    className={`absolute top-[18%] ${feedback.lane === 'left' ? 'left-1/4 -translate-x-1/2' : 'left-3/4 -translate-x-1/2'} text-xl font-black ${feedback.good ? 'text-green-300' : 'text-red-300'} drop-shadow-lg`}
                >
                    {feedback.text}
                </div>
            )}

            <div className="absolute bottom-3 inset-x-0 text-center text-white/70 text-xs font-semibold">
                LEFT / RIGHT TAP
            </div>
        </div>
    );
};

export default ColorTiming;
