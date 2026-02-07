import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Howl, Howler } from 'howler';
import { useSound } from '../../contexts/SoundContext';
import { Haptics, NotificationType } from '@capacitor/haptics';

interface TimingBarProps {
    onScore: (amount: number) => void;
    isPlaying: boolean;
    remainingTime?: number;
}

interface Note {
    id: number;
    y: number;
    type: 'tap' | 'hold';
    holdDuration: number;
    holdProgress: number;
    isBeingHeld: boolean;
    height: number;
}

// Target bar visual position (from top, as percentage)
const TARGET_TOP_PERCENT = 85; // 85% from top
const TARGET_HEIGHT_PERCENT = 4; // 4% height

// Convert to decimal for calculations
const TARGET_Y = TARGET_TOP_PERCENT / 100;
const TARGET_HEIGHT = TARGET_HEIGHT_PERCENT / 100;


const TAP_HEIGHT = 0.04;
const PERFECT_RANGE = 0.02; // Stricter perfect timing
const GOOD_RANGE = 0.04;    // Stricter good timing
const BASE_SPEED = 0.0004;

const PIANO_FILES = [
    '/sounds/piano/C4.mp3',
    '/sounds/piano/D4.mp3',
    '/sounds/piano/E4.mp3',
    '/sounds/piano/G4.mp3',
    '/sounds/piano/A4.mp3',
    '/sounds/piano/C5.mp3',
];

const TimingBar: React.FC<TimingBarProps> = ({ onScore, isPlaying, remainingTime }) => {
    const { isMuted, volume } = useSound();
    const [notes, setNotes] = useState<Note[]>([]);
    const [feedback, setFeedback] = useState<'perfect' | 'good' | 'bad' | null>(null);
    const [feedbackText, setFeedbackText] = useState<string | null>(null);
    const [streak, setStreak] = useState(0);
    const [isHolding, setIsHolding] = useState(false);

    const rafRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);
    const notesRef = useRef<Note[]>([]);
    const nextIdRef = useRef<number>(1);
    const nextSpawnRef = useRef<number>(0);
    const remainingTimeRef = useRef<number | undefined>(remainingTime);
    const pianoRef = useRef<Howl[]>([]);
    const lastPianoRef = useRef<number>(-1);
    const holdStartRef = useRef<number | null>(null);
    const activeHoldRef = useRef<number | null>(null);
    const streakRef = useRef<number>(0);
    const onScoreRef = useRef(onScore);

    const globalSpeedRef = useRef<number>(1.0);
    const lastSpeedChangeRef = useRef<number>(0);
    const holdActiveRef = useRef<boolean>(false);

    const delaysRef = useRef<number[]>([]);
    const delayIdxRef = useRef<number>(0);

    useEffect(() => { remainingTimeRef.current = remainingTime; }, [remainingTime]);
    useEffect(() => { streakRef.current = streak; }, [streak]);
    useEffect(() => { onScoreRef.current = onScore; }, [onScore]);

    const triggerFeedback = useCallback((type: 'perfect' | 'good' | 'bad') => {
        setFeedback(type);
        setTimeout(() => setFeedback(null), 150);
    }, []);

    const playPiano = useCallback(() => {
        if (isMuted || pianoRef.current.length === 0) return;
        let idx = Math.floor(Math.random() * pianoRef.current.length);
        if (idx === lastPianoRef.current && pianoRef.current.length > 1) {
            idx = (idx + 1) % pianoRef.current.length;
        }
        lastPianoRef.current = idx;
        const s = pianoRef.current[idx];
        s.volume(volume);
        if (Howler.ctx?.state === 'suspended') Howler.ctx.resume().catch(() => { });
        if (s.state() === 'loaded') s.play();
    }, [isMuted, volume]);

    const generateDelays = useCallback(() => {
        const BPM = 120;
        const beat = 60000 / BPM;
        const arr: number[] = [];
        for (let i = 0; i < 60; i++) {
            const r = Math.random();
            if (r < 0.25) arr.push(beat * 0.5);
            else if (r < 0.55) arr.push(beat);
            else if (r < 0.75) arr.push(beat * 0.75);
            else if (r < 0.90) arr.push(beat * 1.5);
            else arr.push(beat * 0.33);
        }
        return arr;
    }, []);

    useEffect(() => {
        if (pianoRef.current.length > 0) return;
        pianoRef.current = PIANO_FILES.map(src => new Howl({
            src: [src], format: ['mp3'], html5: false, preload: true, pool: 4, volume,
        }));
    }, [volume]);

    useEffect(() => { pianoRef.current.forEach(s => s.volume(volume)); }, [volume]);

    useEffect(() => {
        if (!isPlaying) {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            notesRef.current = [];
            setNotes([]);
            setStreak(0);
            setIsHolding(false);
            activeHoldRef.current = null;
            holdStartRef.current = null;
            holdActiveRef.current = false;
            delayIdxRef.current = 0;
            globalSpeedRef.current = 1.0;
            return;
        }

        delaysRef.current = generateDelays();
        delayIdxRef.current = 0;
        lastTimeRef.current = performance.now();
        lastSpeedChangeRef.current = performance.now();
        nextSpawnRef.current = performance.now() + 500;
        notesRef.current = [];
        nextIdRef.current = 1;
        globalSpeedRef.current = 1.0;
        holdActiveRef.current = false;

        const tick = (now: number) => {
            const dt = now - lastTimeRef.current;
            lastTimeRef.current = now;

            // Change speed every 5 seconds
            if (now - lastSpeedChangeRef.current > 5000) {
                lastSpeedChangeRef.current = now;
                globalSpeedRef.current = 0.8 + Math.random() * 0.5;
            }

            const hasActiveHold = notesRef.current.some(n => n.type === 'hold' && !n.isBeingHeld);
            holdActiveRef.current = hasActiveHold;

            // Spawn
            if (now >= nextSpawnRef.current && !holdActiveRef.current) {
                if (delayIdxRef.current >= delaysRef.current.length) {
                    delaysRef.current = generateDelays();
                    delayIdxRef.current = 0;
                }
                const delay = delaysRef.current[delayIdxRef.current++];
                nextSpawnRef.current = now + delay;

                const isHold = Math.random() < 0.12;
                const holdHeight = isHold ? 0.12 + Math.random() * 0.12 : TAP_HEIGHT;
                // Shorter hold duration (0.3 to 0.6 seconds)
                const holdDuration = isHold ? 0.3 + (holdHeight - 0.12) * 2.5 : 0;

                const note: Note = {
                    id: nextIdRef.current++,
                    y: -holdHeight,
                    type: isHold ? 'hold' : 'tap',
                    holdDuration,
                    holdProgress: 0,
                    isBeingHeld: false,
                    height: holdHeight,
                };
                notesRef.current.push(note);
            }

            const currentStreak = streakRef.current;
            const streakBonus = 1 + Math.min(currentStreak * 0.01, 0.2);
            const remaining = remainingTimeRef.current;
            const endBonus = remaining !== undefined && remaining <= 5 ? 1.2 : 1;
            const speed = BASE_SPEED * globalSpeedRef.current * streakBonus * endBonus;

            let missed = 0;

            for (let i = notesRef.current.length - 1; i >= 0; i--) {
                const n = notesRef.current[i];
                n.y += speed * dt;

                if (n.type === 'hold' && n.isBeingHeld && holdStartRef.current) {
                    n.holdProgress = Math.min(1, (now - holdStartRef.current) / 1000 / n.holdDuration);
                }

                // Note missed when bottom of note passes target
                // Skip notes that are being held - they get judged on release
                const noteBottom = n.y + n.height;
                if (noteBottom > TARGET_Y + TARGET_HEIGHT + GOOD_RANGE && !n.isBeingHeld) {
                    if (n.type === 'hold' && n.holdProgress > 0.4) {
                        onScoreRef.current(Math.round(40 * n.holdProgress));
                    } else {
                        missed++;
                    }
                    if (activeHoldRef.current === n.id) {
                        activeHoldRef.current = null;
                        holdStartRef.current = null;
                        setIsHolding(false);
                    }
                    notesRef.current.splice(i, 1);
                }
            }

            if (missed > 0) {
                Haptics.notification({ type: NotificationType.Error }).catch(() => { });
                setFeedback('bad');
                setTimeout(() => setFeedback(null), 150);
                onScoreRef.current(-15 * missed);
                setStreak(0);
            }

            setNotes([...notesRef.current]);
            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [isPlaying, generateDelays]);

    // Hit detection: prioritize notes closest to target, tap notes over hold notes when overlapping
    const findHit = useCallback(() => {
        let best = -1;
        let bestDist = Infinity;
        let bestIsTap = false;

        for (let i = 0; i < notesRef.current.length; i++) {
            const n = notesRef.current[i];
            const noteTop = n.y;
            const noteBottom = n.y + n.height;
            const targetTop = TARGET_Y;
            const targetBottom = TARGET_Y + TARGET_HEIGHT;

            let isHittable = false;
            let distToTarget = Infinity;

            if (n.type === 'hold') {
                // For hold notes: allow hit when bottom is near target
                distToTarget = Math.abs(noteBottom - targetTop);
                if (distToTarget < 0.12) {
                    isHittable = true;
                }
            } else {
                // For tap notes: check overlap with target
                const overlapStart = Math.max(noteTop, targetTop);
                const overlapEnd = Math.min(noteBottom, targetBottom);
                const overlap = overlapEnd - overlapStart;
                if (overlap > 0) {
                    isHittable = true;
                    // Distance from note center to target center
                    const noteCenter = noteTop + n.height / 2;
                    const targetCenter = targetTop + TARGET_HEIGHT / 2;
                    distToTarget = Math.abs(noteCenter - targetCenter);
                }
            }

            if (isHittable) {
                // Prefer tap notes when both are hittable (tap is more precise)
                const isTap = n.type === 'tap';

                if (best === -1) {
                    best = i;
                    bestDist = distToTarget;
                    bestIsTap = isTap;
                } else if (isTap && !bestIsTap) {
                    // Tap note takes priority over hold note
                    best = i;
                    bestDist = distToTarget;
                    bestIsTap = true;
                } else if (isTap === bestIsTap && distToTarget < bestDist) {
                    // Same type, pick closer one
                    best = i;
                    bestDist = distToTarget;
                }
            }
        }

        return { idx: best, dist: bestDist };
    }, []);

    const handleDown = useCallback(() => {
        if (!isPlaying) return;
        const { idx, dist } = findHit();

        if (idx >= 0) {
            const n = notesRef.current[idx];
            if (n.type === 'hold') {
                playPiano();
                Haptics.impact({ style: 'light' as any }).catch(() => { });
                setIsHolding(true);
                holdStartRef.current = performance.now();
                activeHoldRef.current = n.id;
                n.isBeingHeld = true;
            } else {
                playPiano();
                const isPerfect = dist < PERFECT_RANGE;
                if (isPerfect) {
                    Haptics.impact({ style: 'heavy' as any }).catch(() => { });
                    triggerFeedback('perfect');
                    setFeedbackText('PERFECT!');
                    onScore(50);
                } else {
                    Haptics.impact({ style: 'medium' as any }).catch(() => { });
                    triggerFeedback('good');

                    // Percentage 0-99% based on distance (closer to perfect = higher %)
                    const range = GOOD_RANGE - PERFECT_RANGE;
                    const relativeDist = dist - PERFECT_RANGE;
                    const percent = Math.max(0, Math.min(99, Math.round(99 * (1 - relativeDist / range))));

                    // Score 1-40 based on percentage
                    const score = Math.max(1, Math.round(1 + (percent / 100) * 39));

                    setFeedbackText(`${percent}%`);
                    onScore(score);
                }
                setTimeout(() => setFeedbackText(null), 300);
                setStreak(s => s + 1);
                notesRef.current.splice(idx, 1);
            }
        } else {
            Haptics.notification({ type: NotificationType.Error }).catch(() => { });
            triggerFeedback('bad');
            setFeedbackText('MISS');
            setTimeout(() => setFeedbackText(null), 300);
            onScore(-10);
            setStreak(0);
        }
    }, [isPlaying, findHit, playPiano, onScore, triggerFeedback]);

    const handleUp = useCallback(() => {
        if (!isHolding || activeHoldRef.current === null) return;
        const idx = notesRef.current.findIndex(n => n.id === activeHoldRef.current);
        if (idx >= 0) {
            const n = notesRef.current[idx];
            if (n.holdProgress >= 0.65) {
                Haptics.impact({ style: 'heavy' as any }).catch(() => { });
                triggerFeedback('perfect');
                setFeedbackText('PERFECT!');
                onScore(50);
                setStreak(s => s + 1);
            } else if (n.holdProgress >= 0.35) {
                Haptics.impact({ style: 'medium' as any }).catch(() => { });
                triggerFeedback('good');

                // Percentage 0-99% based on hold duration
                const range = 0.65 - 0.35;
                const relativeProgress = n.holdProgress - 0.35;
                const percent = Math.max(0, Math.min(99, Math.round(99 * (relativeProgress / range))));

                // Score 1-40 based on percentage
                const score = Math.max(1, Math.round(1 + (percent / 100) * 39));

                setFeedbackText(`${percent}%`);
                onScore(score);
            } else {
                Haptics.notification({ type: NotificationType.Error }).catch(() => { });
                triggerFeedback('bad');
                setFeedbackText('MISS');
                onScore(-5);
                setStreak(0);
            }
            setTimeout(() => setFeedbackText(null), 300);
            notesRef.current.splice(idx, 1);
        }
        setIsHolding(false);
        activeHoldRef.current = null;
        holdStartRef.current = null;
    }, [isHolding, onScore, triggerFeedback]);

    return (
        <div
            className="w-full h-full flex items-center justify-center select-none touch-none"
            onPointerDown={e => { e.preventDefault(); handleDown(); }}
            onPointerUp={handleUp}
            onPointerLeave={handleUp}
            onPointerCancel={handleUp}
        >
            <div className="relative w-full max-w-md h-[70vh]">
                {/* Target bar - synced with hit detection */}
                <div
                    className={`absolute left-1/2 -translate-x-1/2 w-[60%] rounded-xl border-2 transition-all duration-100 z-20 backdrop-blur-sm ${feedback === 'perfect' ? 'border-yellow-400 bg-yellow-400/40 shadow-[0_0_20px_rgba(250,204,21,0.6)]' :
                        feedback === 'good' ? 'border-green-400 bg-green-400/30' :
                            feedback === 'bad' ? 'border-red-500 bg-red-500/30' :
                                isHolding ? 'border-cyan-400 bg-cyan-400/30 animate-pulse' :
                                    'border-white/50 bg-white/20'
                        }`}
                    style={{
                        top: `${TARGET_TOP_PERCENT}%`,
                        height: `${TARGET_HEIGHT_PERCENT}%`
                    }}
                />

                {/* Notes */}
                {notes.map(note => (
                    <div
                        key={note.id}
                        className={`absolute left-1/2 -translate-x-1/2 w-[60%] rounded-xl z-10 ${note.type === 'hold'
                            ? note.isBeingHeld
                                ? 'bg-gradient-to-b from-cyan-400 to-cyan-600 shadow-lg shadow-cyan-500/40'
                                : 'bg-gradient-to-b from-blue-400 to-blue-600 border border-blue-300/50'
                            : 'bg-gradient-to-b from-white to-gray-300 shadow-md'
                            }`}
                        style={{
                            top: `${note.y * 100}%`,
                            height: `${note.height * 100}%`
                        }}
                    >
                        {note.type === 'hold' && note.isBeingHeld && (
                            <div
                                className="absolute bottom-0 left-0 right-0 bg-cyan-300 rounded-b-xl"
                                style={{ height: `${note.holdProgress * 100}%` }}
                            />
                        )}
                        {note.type === 'hold' && !note.isBeingHeld && (
                            <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold drop-shadow">
                                HOLD
                            </span>
                        )}
                    </div>
                ))}

                {/* Streak - center display, sparkle at 10+ */}
                {streak > 0 && (
                    <div className={`absolute top-[15%] left-1/2 -translate-x-1/2 font-bold drop-shadow-lg z-30 ${streak >= 10
                        ? 'text-4xl text-yellow-300 animate-pulse [text-shadow:0_0_10px_gold,0_0_20px_yellow,0_0_30px_orange]'
                        : 'text-3xl text-yellow-400'
                        }`}>
                        {streak} COMBO
                    </div>
                )}

                {/* Hold indicator */}
                {isHolding && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-cyan-400 text-2xl font-bold animate-pulse drop-shadow-lg z-30">
                        HOLD!
                    </div>
                )}

                {/* Feedback text */}
                {feedbackText && (
                    <div className={`absolute top-[75%] left-1/2 -translate-x-1/2 text-2xl font-bold drop-shadow-lg z-30 animate-bounce ${feedback === 'perfect' ? 'text-yellow-400' :
                        feedback === 'good' ? 'text-green-400' :
                            'text-red-400'
                        }`}>
                        {feedbackText}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TimingBar;
