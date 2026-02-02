import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSound } from '../../contexts/SoundContext';
import { SeededRandom } from '../../utils/seededRandom';

interface BallCounterProps {
    seed: string | null;
    onScore: (amount: number) => void;
    isPlaying: boolean;
}

type Ball = {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
};

const BASE_MIN = 7;
const BASE_MAX = 10;
const LEVEL_STEP = 3;
const MAX_BALLS = 28;
const SPEED_MIN = 35;
const SPEED_MAX = 75;
const SCORE_WRONG = -50;
const COLOR_PALETTE = ['#7DD3FC', '#FCA5A5', '#FCD34D', '#A7F3D0', '#C4B5FD', '#F9A8D4'];

const BallCounter: React.FC<BallCounterProps> = ({ seed, onScore, isPlaying }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();

    const containerRef = useRef<HTMLDivElement>(null);
    const boundsRef = useRef({ width: 0, height: 0 });
    const rngRef = useRef<SeededRandom | null>(null);
    const flashTimerRef = useRef<number | null>(null);

    const [balls, setBalls] = useState<Ball[]>([]);
    const [options, setOptions] = useState<number[]>([]);
    const [currentCount, setCurrentCount] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
    const [currentColor, setCurrentColor] = useState(COLOR_PALETTE[0]);

    const updateBounds = useCallback(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        boundsRef.current = { width: rect.width, height: rect.height };
    }, []);

    useEffect(() => {
        updateBounds();
        window.addEventListener('resize', updateBounds);
        return () => window.removeEventListener('resize', updateBounds);
    }, [updateBounds]);

    useEffect(() => {
        return () => {
            if (flashTimerRef.current !== null) {
                window.clearTimeout(flashTimerRef.current);
            }
        };
    }, []);

    const getBounds = useCallback(() => {
        const { width, height } = boundsRef.current;
        return {
            width: width || 320,
            height: height || 320
        };
    }, []);

    const shuffle = useCallback((values: number[]) => {
        const rng = rngRef.current;
        const result = [...values];
        for (let i = result.length - 1; i > 0; i -= 1) {
            const j = rng ? rng.nextInt(0, i + 1) : Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }, []);

    const pickNextColor = useCallback((prev?: string) => {
        if (COLOR_PALETTE.length === 0) return '#7DD3FC';
        if (COLOR_PALETTE.length === 1) return COLOR_PALETTE[0];
        let next = prev ?? COLOR_PALETTE[0];
        for (let i = 0; i < 6; i += 1) {
            const idx = rngRef.current
                ? rngRef.current.nextInt(0, COLOR_PALETTE.length)
                : Math.floor(Math.random() * COLOR_PALETTE.length);
            const candidate = COLOR_PALETTE[idx];
            if (candidate !== prev) {
                next = candidate;
                break;
            }
        }
        return next;
    }, []);

    const buildBalls = useCallback((count: number) => {
        const rng = rngRef.current;
        const { width, height } = getBounds();
        const next: Ball[] = [];

        for (let i = 0; i < count; i += 1) {
            const radius = (rng ? rng.next() : Math.random()) * 4 + 8;
            const angle = (rng ? rng.next() : Math.random()) * Math.PI * 2;
            const speed = (rng ? rng.next() : Math.random()) * (SPEED_MAX - SPEED_MIN) + SPEED_MIN;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const x = (rng ? rng.next() : Math.random()) * (width - radius * 2) + radius;
            const y = (rng ? rng.next() : Math.random()) * (height - radius * 2) + radius;

            next.push({ id: i, x, y, vx, vy, radius });
        }
        setBalls(next);
    }, [getBounds]);

    const buildOptions = useCallback((count: number) => {
        const base = [count - 2, count - 1, count, count + 1];
        setOptions(shuffle(base));
    }, [shuffle]);

    const startRound = useCallback((nextCorrectCount: number) => {
        const level = Math.floor(nextCorrectCount / LEVEL_STEP);
        const min = Math.min(BASE_MIN + level, MAX_BALLS - 3);
        const max = Math.min(BASE_MAX + level, MAX_BALLS);
        const rng = rngRef.current;
        const count = rng ? rng.nextInt(min, max + 1) : Math.floor(Math.random() * (max - min + 1)) + min;

        setCurrentCount(count);
        buildBalls(count);
        buildOptions(count);
    }, [buildBalls, buildOptions]);

    useEffect(() => {
        if (!seed) return;
        rngRef.current = new SeededRandom(`${seed}-balls`);
        setCorrectCount(0);
        setFeedback(null);
        setCurrentColor(pickNextColor());
        requestAnimationFrame(() => {
            updateBounds();
            startRound(0);
        });
    }, [pickNextColor, seed, updateBounds, startRound]);

    const triggerFeedback = (type: 'correct' | 'wrong') => {
        setFeedback(type);
        if (flashTimerRef.current !== null) {
            window.clearTimeout(flashTimerRef.current);
        }
        flashTimerRef.current = window.setTimeout(() => {
            setFeedback(null);
        }, 160);
    };

    const handleAnswer = (value: number) => {
        if (!isPlaying) return;
        if (value === currentCount) {
            playSound('correct');
            onScore(currentCount * 10);
            const next = correctCount + 1;
            setCorrectCount(next);
            triggerFeedback('correct');
            setCurrentColor(prev => pickNextColor(prev));
            startRound(next);
        } else {
            playSound('error');
            onScore(SCORE_WRONG);
            triggerFeedback('wrong');
            startRound(correctCount);
        }
    };

    useEffect(() => {
        if (!isPlaying) return;
        let frameId = 0;
        let lastTime = performance.now();

        const tick = (now: number) => {
            const dt = Math.min(0.05, (now - lastTime) / 1000);
            lastTime = now;
            const { width, height } = getBounds();

            setBalls(prev => prev.map(ball => {
                let x = ball.x + ball.vx * dt;
                let y = ball.y + ball.vy * dt;
                let vx = ball.vx;
                let vy = ball.vy;
                const r = ball.radius;

                if (x <= r) {
                    x = r;
                    vx = Math.abs(vx);
                } else if (x >= width - r) {
                    x = width - r;
                    vx = -Math.abs(vx);
                }

                if (y <= r) {
                    y = r;
                    vy = Math.abs(vy);
                } else if (y >= height - r) {
                    y = height - r;
                    vy = -Math.abs(vy);
                }

                return { ...ball, x, y, vx, vy };
            }));

            frameId = requestAnimationFrame(tick);
        };

        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);
    }, [getBounds, isPlaying]);

    const hexToRgba = useCallback((hex: string, alpha: number) => {
        const clean = hex.replace('#', '');
        const parsed = clean.length === 3
            ? clean.split('').map((c) => c + c).join('')
            : clean;
        const r = parseInt(parsed.slice(0, 2), 16);
        const g = parseInt(parsed.slice(2, 4), 16);
        const b = parseInt(parsed.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }, []);

    const containerStyle = useMemo(() => ({ aspectRatio: '1 / 1' }), []);
    const ballFill = useMemo(() => hexToRgba(currentColor, 0.9), [currentColor, hexToRgba]);
    const ballShadow = useMemo(() => `0 0 14px ${hexToRgba(currentColor, 0.45)}`, [currentColor, hexToRgba]);

    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4">
            <div className="text-center mb-3">
                <h2 className="text-2xl font-black text-white drop-shadow-md">{t('balls.title')}</h2>
                <p className="text-xs text-gray-400 mt-1">{t('balls.instruction')}</p>
            </div>

            <div
                ref={containerRef}
                className={`w-[92vw] max-w-[360px] rounded-2xl border border-white/10 bg-gray-800/50 shadow-2xl relative overflow-hidden transition-shadow ${feedback === 'wrong' ? 'ring-4 ring-red-500/70' : feedback === 'correct' ? 'ring-4 ring-emerald-400/70' : ''}`}
                style={containerStyle}
            >
                {balls.map(ball => (
                    <div
                        key={ball.id}
                        className="absolute rounded-full"
                        style={{
                            width: ball.radius * 2,
                            height: ball.radius * 2,
                            transform: `translate(${ball.x - ball.radius}px, ${ball.y - ball.radius}px)`,
                            backgroundColor: ballFill,
                            boxShadow: ballShadow
                        }}
                    />
                ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
                {options.map((value) => (
                    <button
                        key={value}
                        onClick={() => handleAnswer(value)}
                        className="px-6 py-3 rounded-xl bg-gray-800/70 border border-white/10 text-white font-bold text-lg hover:bg-gray-700/80 active:scale-95 transition-transform"
                    >
                        {value}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default BallCounter;
