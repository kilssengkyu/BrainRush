import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';
import { useSound } from '../../contexts/SoundContext';

interface CatchColorProps {
    seed: string | null;
    onScore: (amount: number) => void;
    isPlaying: boolean;
}

type Ball = {
    id: number;
    x: number;
    y: number;
    radius: number;
    speed: number;
    color: 'blue' | 'red';
};

const BAR_WIDTH = 90;
const BAR_HEIGHT = 14;
const BAR_OFFSET = 32;
const SPAWN_START_MS = 360; // ~2.8 balls/sec
const SPAWN_MIN_MS = 140;
const SPAWN_ACCEL_MS = 45; // faster every 5s
const SPEED_START = 200;
const SPEED_ACCEL = 22; // faster every 5s
const MAX_SPEED_SCALE = 2.2;
const SWITCH_MIN_MS = 5000;
const SWITCH_MAX_MS = 8000;
const SWITCH_WARNING_MS = 3000;

const CatchColor: React.FC<CatchColorProps> = ({ seed, onScore, isPlaying }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const containerRef = useRef<HTMLDivElement>(null);
    const rngRef = useRef<SeededRandom | null>(null);

    const [balls, setBalls] = useState<Ball[]>([]);
    const [barX, setBarX] = useState(0);
    const [targetColor, setTargetColor] = useState<'blue' | 'red'>('blue');
    const [warning, setWarning] = useState(false);
    const [hitFeedback, setHitFeedback] = useState<'wrong' | 'correct' | null>(null);
    const [switchTimeLeft, setSwitchTimeLeft] = useState(0);

    const draggingRef = useRef(false);
    const barXRef = useRef(0);
    const targetColorRef = useRef<'blue' | 'red'>('blue');
    const boundsRef = useRef({ width: 0, height: 0 });
    const lastSpawnRef = useRef(0);
    const spawnIntervalRef = useRef(SPAWN_START_MS);
    const speedRef = useRef(SPEED_START);
    const startTimeRef = useRef(0);
    const lastSpeedUpRef = useRef(0);
    const nextSwitchAtRef = useRef(0);
    const ballIdRef = useRef(0);

    const updateBounds = useCallback(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        boundsRef.current = { width: rect.width, height: rect.height };
        const next = (rect.width - BAR_WIDTH) / 2;
        barXRef.current = next;
        setBarX(next);
    }, []);

    useEffect(() => {
        updateBounds();
        window.addEventListener('resize', updateBounds);
        return () => window.removeEventListener('resize', updateBounds);
    }, [updateBounds]);

    const pickSwitchDelay = useCallback(() => {
        const rng = rngRef.current;
        const min = SWITCH_MIN_MS;
        const max = SWITCH_MAX_MS;
        const r = rng ? rng.next() : Math.random();
        return min + r * (max - min);
    }, []);

    useEffect(() => {
        if (!seed) return;
        rngRef.current = new SeededRandom(`${seed}-catch-color`);
        setBalls([]);
        setTargetColor('blue');
        targetColorRef.current = 'blue';
        setWarning(false);
        setHitFeedback(null);
        const now = performance.now();
        startTimeRef.current = now;
        lastSpawnRef.current = now;
        lastSpeedUpRef.current = now;
        spawnIntervalRef.current = SPAWN_START_MS;
        speedRef.current = SPEED_START;
        nextSwitchAtRef.current = now + pickSwitchDelay();
    }, [seed, pickSwitchDelay]);

    const spawnBall = useCallback(() => {
        const { width } = boundsRef.current;
        if (width <= 0) return;
        const rng = rngRef.current;
        const radius = 10 + (rng ? rng.next() : Math.random()) * 6;
        const x = radius + (rng ? rng.next() : Math.random()) * (width - radius * 2);
        const color = (rng ? rng.next() : Math.random()) < 0.5 ? 'blue' : 'red';
        const speed = speedRef.current + (rng ? rng.next() : Math.random()) * 40;
        const ball: Ball = {
            id: ballIdRef.current++,
            x,
            y: -radius,
            radius,
            speed,
            color
        };
        setBalls(prev => [...prev, ball]);
    }, []);

    const clampBar = useCallback((x: number) => {
        const { width } = boundsRef.current;
        return Math.max(0, Math.min(width - BAR_WIDTH, x));
    }, []);

    const handlePointerMove = useCallback((clientX: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const next = clientX - rect.left - BAR_WIDTH / 2;
        const clamped = clampBar(next);
        barXRef.current = clamped;
        setBarX(clamped);
    }, [clampBar]);

    const onPointerDown = (e: React.PointerEvent) => {
        draggingRef.current = true;
        handlePointerMove(e.clientX);
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!draggingRef.current) return;
        handlePointerMove(e.clientX);
    };
    const onPointerUp = () => {
        draggingRef.current = false;
    };

    useEffect(() => {
        let frameId = 0;
        let lastTime = performance.now();

        const tick = (now: number) => {
            if (!isPlaying) {
                frameId = requestAnimationFrame(tick);
                lastTime = now;
                return;
            }

            const dt = Math.min(0.05, (now - lastTime) / 1000);
            lastTime = now;
            const elapsed = now - startTimeRef.current;
            const speedScale = Math.min(MAX_SPEED_SCALE, 1 + elapsed / 40000);

            if (now - lastSpawnRef.current >= spawnIntervalRef.current) {
                spawnBall();
                lastSpawnRef.current = now;
            }

            if (now - lastSpeedUpRef.current >= 5000) {
                spawnIntervalRef.current = Math.max(SPAWN_MIN_MS, spawnIntervalRef.current - SPAWN_ACCEL_MS);
                speedRef.current += SPEED_ACCEL;
                lastSpeedUpRef.current = now;
            }

            const timeToSwitch = nextSwitchAtRef.current - now;
            setSwitchTimeLeft(Math.max(0, Math.ceil(timeToSwitch / 1000)));
            if (timeToSwitch <= 0) {
                setTargetColor(prev => {
                    const next = prev === 'blue' ? 'red' : 'blue';
                    targetColorRef.current = next;
                    return next;
                });
                setWarning(false);
                nextSwitchAtRef.current = now + pickSwitchDelay();
            } else if (timeToSwitch <= SWITCH_WARNING_MS) {
                setWarning(true);
            } else {
                setWarning(false);
            }

            const { height } = boundsRef.current;
            const barY = height - BAR_OFFSET - BAR_HEIGHT;
            const barXNow = barXRef.current;
            const targetNow = targetColorRef.current;

            setBalls(prev => {
                const next: Ball[] = [];
                prev.forEach(ball => {
                    const y = ball.y + ball.speed * speedScale * dt;
                    const hit =
                        y + ball.radius >= barY &&
                        y - ball.radius <= barY + BAR_HEIGHT &&
                        ball.x >= barXNow &&
                        ball.x <= barXNow + BAR_WIDTH;

                    if (hit) {
                        if (ball.color === targetNow) {
                            playSound('correct');
                            onScore(30);
                            setHitFeedback('correct');
                        } else {
                            playSound('error');
                            onScore(-30);
                            setHitFeedback('wrong');
                        }
                        window.setTimeout(() => setHitFeedback(null), 140);
                        return;
                    }

                    if (y - ball.radius > height) {
                        return;
                    }

                    next.push({ ...ball, y });
                });
                return next;
            });

            frameId = requestAnimationFrame(tick);
        };

        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);
    }, [isPlaying, spawnBall, pickSwitchDelay, onScore, playSound]);

    if (!seed) return <div className="text-white">{t('common.loading')}</div>;

    return (
        <div className="relative w-full h-full flex justify-center">
            {hitFeedback === 'wrong' && (
                <div className="absolute inset-0 bg-red-500/15 z-30 pointer-events-none animate-pulse" />
            )}
            {hitFeedback === 'correct' && (
                <div className="absolute inset-0 bg-green-500/12 z-30 pointer-events-none animate-pulse" />
            )}
            <div
                ref={containerRef}
                className="relative h-full overflow-hidden select-none touch-manipulation"
                style={{
                    width: 'min(420px, 92vw)',
                    maxWidth: '420px'
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
            >
                <div className="absolute top-4 left-0 w-full text-center pointer-events-none z-10">
                    <h2 className="text-3xl font-black text-white drop-shadow-md">{t('catchColor.title')}</h2>
                    <p className="text-sm text-gray-300">{t('catchColor.instruction')}</p>
                </div>

                {warning && (
                    <div className="absolute top-20 left-0 w-full text-center text-xs uppercase tracking-widest text-yellow-200 animate-pulse z-10">
                        {t('catchColor.switchSoon')}
                    </div>
                )}

                {balls.map(ball => (
                    <div
                        key={ball.id}
                        className="absolute rounded-full shadow-lg"
                        style={{
                            width: ball.radius * 2,
                            height: ball.radius * 2,
                            transform: `translate(${ball.x - ball.radius}px, ${ball.y - ball.radius}px)`,
                            background: ball.color === 'blue' ? '#60A5FA' : '#F87171'
                        }}
                    />
                ))}

                <div
                    className={`absolute rounded-full transition-colors ${warning ? 'ring-4 ring-yellow-300 animate-pulse' : ''} ${hitFeedback === 'wrong' ? 'ring-4 ring-red-400' : ''} ${hitFeedback === 'correct' ? 'ring-4 ring-green-400' : ''}`}
                    style={{
                        width: BAR_WIDTH,
                        height: BAR_HEIGHT,
                        left: barX,
                        bottom: BAR_OFFSET,
                        background: targetColor === 'blue' ? '#3B82F6' : '#EF4444',
                        boxShadow: '0 6px 20px rgba(0,0,0,0.35)'
                    }}
                />
                <div
                    className="absolute text-[10px] font-mono text-white/80"
                    style={{
                        left: barX + BAR_WIDTH + 8,
                        bottom: BAR_OFFSET + BAR_HEIGHT + 6
                    }}
                >
                    {switchTimeLeft}s
                </div>
            </div>
        </div>
    );
};

export default CatchColor;
