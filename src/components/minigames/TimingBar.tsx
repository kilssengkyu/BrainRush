import React, { useEffect, useRef, useState } from 'react';
import { Howl, Howler } from 'howler';
import { useSound } from '../../contexts/SoundContext';
import { Haptics, NotificationType } from '@capacitor/haptics';

interface TimingBarProps {
    onScore: (amount: number) => void;
    isPlaying: boolean;
    remainingTime?: number;
}

const BASE_DROP_DURATION_MS = 1800; // time to travel from top to bottom
const MIN_DROP_DURATION_MS = 900;
const MIN_RESET_DELAY_MS = 120;
const BPM = 120;
const BEAT_MS = 60000 / BPM; // quarter-note beat
const NOTE_HEIGHT = 0.08; // relative height
const TARGET_START = 0.78;
const TARGET_END = 0.88;
const PIANO_FILES = [
    '/sounds/piano/C4.mp3',
    '/sounds/piano/Cs4.mp3',
    '/sounds/piano/D4.mp3',
    '/sounds/piano/Ds4.mp3',
    '/sounds/piano/E4.mp3',
    '/sounds/piano/F4.mp3',
    '/sounds/piano/Fs4.mp3',
    '/sounds/piano/G4.mp3',
    '/sounds/piano/Gs4.mp3',
    '/sounds/piano/A4.mp3',
    '/sounds/piano/As4.mp3',
    '/sounds/piano/B4.mp3',
    '/sounds/piano/C5.mp3',
];

const TimingBar: React.FC<TimingBarProps> = ({ onScore, isPlaying, remainingTime }) => {
    const { isMuted, volume } = useSound();
    const [notes, setNotes] = useState<{ id: number; y: number; speed: number }[]>([]);
    const [feedback, setFeedback] = useState<'good' | 'bad' | null>(null);
    const [streak, setStreak] = useState(0);

    const rafRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);
    const nextStartRef = useRef<number>(0);
    const notesRef = useRef<{ id: number; y: number; speed: number }[]>([]);
    const nextIdRef = useRef<number>(1);
    const remainingTimeRef = useRef<number | undefined>(remainingTime);
    const patternRef = useRef<number[]>([1, 1, 1, 1]);
    const patternIndexRef = useRef<number>(0);
    const pianoSoundsRef = useRef<Howl[]>([]);
    const lastPianoIndexRef = useRef<number>(-1);

    const triggerFeedback = (type: 'good' | 'bad') => {
        setFeedback(type);
        window.setTimeout(() => setFeedback(null), 180);
    };

    const playRandomPiano = () => {
        if (isMuted || pianoSoundsRef.current.length === 0) return;
        let idx = Math.floor(Math.random() * pianoSoundsRef.current.length);
        if (pianoSoundsRef.current.length > 1 && idx === lastPianoIndexRef.current) {
            idx = (idx + 1) % pianoSoundsRef.current.length;
        }
        lastPianoIndexRef.current = idx;
        const sound = pianoSoundsRef.current[idx];
        sound.volume(volume);
        // iOS can suspend the audio context; resume just-in-time.
        const ctx = Howler.ctx;
        if (ctx && ctx.state === 'suspended') {
            ctx.resume().catch(() => undefined);
        }
        if (sound.state() !== 'loaded') {
            sound.once('load', () => sound.play());
            return;
        }
        sound.play();
    };

    useEffect(() => {
        if (pianoSoundsRef.current.length > 0) return;
        pianoSoundsRef.current = PIANO_FILES.map((src) => new Howl({
            src: [src],
            format: ['mp3'],
            html5: false,
            preload: true,
            pool: 6,
            volume,
            onloaderror: (_id, err) => console.error('[TimingBar] Piano load error', src, err),
            onplayerror: (_id, err) => console.error('[TimingBar] Piano play error', src, err),
        }));
    }, [volume]);

    useEffect(() => {
        remainingTimeRef.current = remainingTime;
    }, [remainingTime]);

    useEffect(() => {
        pianoSoundsRef.current.forEach((sound) => sound.volume(volume));
    }, [volume]);

    const pickPattern = () => {
        const patterns: number[][] = [
            [1, 1, 1, 1],                 // 딴 딴 딴 딴
            [1, 1, 1, 0.5, 0.5],           // 딴 딴 딴 따단
            [0.5, 0.5, 1, 1, 1],           // 따단 딴 딴 딴
            [1, 0.5, 0.5, 1, 1],           // 딴 따단 딴 딴
            [1, 1, 0.5, 0.5, 1],           // 딴 딴 따단 딴
            [1, 1, 1, 0.5, 0.5, 0.5, 0.5], // 딴 딴 딴 따단 따단
            [1, 1, 1, 0.5, 0.5, 1, 1, 1],  // 딴 딴 딴 따단 따단 딴 딴 딴
        ];
        return patterns[Math.floor(Math.random() * patterns.length)];
    };

    const resetNote = (now: number) => {
        if (patternIndexRef.current >= patternRef.current.length) {
            patternRef.current = pickPattern();
            patternIndexRef.current = 0;
        }
        const step = patternRef.current[patternIndexRef.current];
        patternIndexRef.current += 1;
        nextStartRef.current = now + Math.max(MIN_RESET_DELAY_MS, BEAT_MS * step);
    };

    const startNotes = () => {
        const currentRemaining = remainingTimeRef.current;
        const fastChance = currentRemaining !== undefined && currentRemaining <= 10 ? 0.3 : 0;
        const speedMultiplier = Math.random() < fastChance ? 1.5 : 1;
        const newNote = { id: nextIdRef.current++, y: -NOTE_HEIGHT, speed: speedMultiplier };
        notesRef.current = [...notesRef.current, newNote];
        setNotes(notesRef.current);
    };

    useEffect(() => {
        if (!isPlaying) {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            notesRef.current = [];
            setNotes([]);
            patternRef.current = [1, 1, 1, 1];
            patternIndexRef.current = 0;
            return;
        }

        lastTimeRef.current = performance.now();
        nextStartRef.current = performance.now();
        patternRef.current = pickPattern();
        patternIndexRef.current = 0;

        const tick = (now: number) => {
            const dt = now - lastTimeRef.current;
            lastTimeRef.current = now;

            if (now >= nextStartRef.current) {
                if (notesRef.current.length === 0) {
                    startNotes();
                }
                resetNote(now);
            }

            if (notesRef.current.length > 0) {
                const speedFactor = Math.min(1, streak / 12);
                const currentRemaining = remainingTimeRef.current;
                const endBoost = currentRemaining !== undefined && currentRemaining <= 5 ? 0.75 : 1;
                const baseDuration = Math.max(
                    MIN_DROP_DURATION_MS,
                    (BASE_DROP_DURATION_MS - speedFactor * 700) * endBoost
                );
                let missed = 0;
                const updated = notesRef.current
                    .map(note => ({ ...note, y: note.y + (note.speed / baseDuration) * dt }))
                    .filter(note => {
                        if (note.y > 1) {
                            missed += 1;
                            return false;
                        }
                        return true;
                    });
                notesRef.current = updated;
                if (missed > 0) {
                    Haptics.notification({ type: NotificationType.Error }).catch(() => {});
                    triggerFeedback('bad');
                    onScore(-15 * missed);
                    setStreak(0);
                }
                setNotes(updated);
            }

            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [isPlaying, onScore]);

    const handleTap = () => {
        if (!isPlaying) return;

        if (notesRef.current.length === 0) {
            Haptics.notification({ type: NotificationType.Error }).catch(() => {});
            triggerFeedback('bad');
            onScore(-10);
            return;
        }

        const targetCenter = (TARGET_START + TARGET_END) / 2;
        let bestIndex = -1;
        let bestDiff = Number.POSITIVE_INFINITY;
        notesRef.current.forEach((note, idx) => {
            const top = note.y;
            const bottom = note.y + NOTE_HEIGHT;
            if (bottom >= TARGET_START && top <= TARGET_END) {
                const noteCenter = top + NOTE_HEIGHT / 2;
                const diff = Math.abs(noteCenter - targetCenter);
                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestIndex = idx;
                }
            }
        });

        if (bestIndex >= 0) {
            const hitNote = notesRef.current[bestIndex];
            playRandomPiano();
            Haptics.notification({ type: NotificationType.Success }).catch(() => {});
            triggerFeedback('good');
            const maxDiff = (TARGET_END - TARGET_START) / 2 + NOTE_HEIGHT / 2;
            const noteCenter = hitNote.y + NOTE_HEIGHT / 2;
            const diff = Math.min(maxDiff, Math.abs(noteCenter - targetCenter));
            const ratio = diff / maxDiff;
            const score = Math.max(10, Math.round(100 - ratio * 90));
            onScore(score);
            setStreak(prev => prev + 1);
            const updated = notesRef.current.filter((_, idx) => idx !== bestIndex);
            notesRef.current = updated;
            setNotes(updated);
        } else {
            Haptics.notification({ type: NotificationType.Error }).catch(() => {});
            triggerFeedback('bad');
            onScore(-10);
            setStreak(0);
        }
    };

    return (
        <div
            className="w-full h-full flex items-center justify-center select-none"
            onPointerDown={(e) => {
                e.preventDefault();
                handleTap();
            }}
        >
            <div className="relative w-full max-w-md h-[70vh] flex items-end justify-center">
                <div className="absolute left-1/2 -translate-x-1/2 bottom-[12%] w-[85%] h-6 rounded-full bg-white/10 border border-white/20" />

                {notes.map((note) => (
                    <div
                        key={note.id}
                        className={`absolute left-1/2 -translate-x-1/2 w-[70%] h-5 rounded-full transition-colors ${feedback === 'good'
                            ? 'bg-green-500/70'
                            : feedback === 'bad'
                                ? 'bg-red-500/70'
                                : 'bg-white/70'}
                        `}
                        style={{ bottom: `${(1 - note.y - NOTE_HEIGHT) * 100}%` }}
                    />
                ))}

                <div
                    className={`absolute left-1/2 -translate-x-1/2 bottom-[12%] w-[85%] h-6 rounded-full pointer-events-none transition-colors ${feedback === 'good'
                        ? 'ring-4 ring-green-500/60'
                        : feedback === 'bad'
                            ? 'ring-4 ring-red-500/60'
                            : 'ring-0'}
                    `}
                />
            </div>
        </div>
    );
};

export default TimingBar;
