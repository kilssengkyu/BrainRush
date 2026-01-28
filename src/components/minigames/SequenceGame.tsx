import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';
import { useSound } from '../../contexts/SoundContext';

interface SequenceGameProps {
    seed: string | null;
    onScore: (amount: number) => void;
    isPlaying: boolean;
    mode: 'forward' | 'reverse';
}

const REVERSE_COLORS = [
    '#EF4444', // Red-500
    '#F87171', // Red-400
    '#B91C1C', // Red-700
    '#FCA5A5', // Red-300
    '#DC2626', // Red-600
    '#F59E0B', // Amber-500 (Orange-ish)
];

const FORWARD_COLORS = [
    '#3B82F6', // Blue-500
    '#60A5FA', // Blue-400
    '#2563EB', // Blue-600
    '#93C5FD', // Blue-300
    '#1D4ED8', // Blue-700
    '#06B6D4', // Cyan-500
];

const SequenceGame: React.FC<SequenceGameProps> = ({ seed, onScore, isPlaying, mode }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [stage, setStage] = useState(1);
    const [sequence, setSequence] = useState<number[]>([]);
    const [phase, setPhase] = useState<'IDLE' | 'SHOWING' | 'INPUT' | 'SUCCESS' | 'FAILURE'>('IDLE');
    const [userInput, setUserInput] = useState<number[]>([]);
    const [seqStep, setSeqStep] = useState(0); // How many items are currently visible (cumulative)
    const [targetColors, setTargetColors] = useState<string[]>([]); // Colors assigned to the sequence

    // Grid 3x3
    const GRID_SIZE = 9;

    // Difficulty: Items count
    const itemCount = useMemo(() => {
        // Stage 1-3: 4
        // Stage 4-6: 5
        // Stage 7-9: 6
        // Stage 10+: 7
        const base = Math.floor((stage - 1) / 3);
        const count = 4 + base;
        return Math.min(count, 7);
    }, [stage]);

    // Start New Round
    const startRound = useCallback(() => {
        const rng = new SeededRandom(`${seed}_${mode}_${stage}`);
        const available = [...Array(GRID_SIZE).keys()];
        const newSequence = rng.shuffle(available).slice(0, itemCount);

        // Pick random colors based on mode
        const palette = mode === 'forward' ? FORWARD_COLORS : REVERSE_COLORS;
        const newColors = newSequence.map(() => rng.pick(palette));

        setSequence(newSequence);
        setTargetColors(newColors);
        setUserInput([]);
        setPhase('IDLE'); // Start as IDLE, wait for effect to switch to SHOWING
        setSeqStep(0); // Reset visible count

    }, [seed, stage, itemCount, mode]);

    useEffect(() => {
        startRound();
    }, [stage, startRound]);

    // Start Showing when isPlaying becomes true and phase is IDLE
    useEffect(() => {
        if (isPlaying && phase === 'IDLE') {
            setPhase('SHOWING');
        }
    }, [isPlaying, phase]);

    // Sequence Animation
    useEffect(() => {
        if (phase === 'SHOWING') {
            const interval = setInterval(() => {
                setSeqStep(prev => {
                    const next = prev + 1;
                    if (next > sequence.length) {
                        // End of sequence -> Wait 250ms then Switch to INPUT
                        clearInterval(interval);
                        setTimeout(() => {
                            setPhase('INPUT');
                        }, 250);
                        return prev;
                    }
                    return next;
                });
            }, 250); // fast interval (tak tak tak)

            return () => clearInterval(interval);
        }
    }, [phase, sequence]);


    const handlePadClick = (index: number) => {
        if (phase !== 'INPUT' || !isPlaying) return;

        // Validation Logic based on Mode
        // Mode 'reverse': sequence[sequence.length - 1 - userInput.length]
        // Mode 'forward': sequence[userInput.length]

        const currentIndex = userInput.length;
        let targetIndex = -1;

        if (mode === 'reverse') {
            targetIndex = sequence[sequence.length - 1 - currentIndex];
        } else {
            targetIndex = sequence[currentIndex];
        }

        if (index === targetIndex) {
            // Correct
            const newInput = [...userInput, index];
            setUserInput(newInput);
            onScore(20);
            playSound('correct'); // Added correct sound here

            if (newInput.length === sequence.length) {
                // Complete
                setPhase('SUCCESS');
                setTimeout(() => {
                    setStage(prev => prev + 1);
                }, 800);
            }
        } else {
            // Wrong
            onScore(-20);
            playSound('error');
            // Visual feedback
            const btn = document.getElementById(`pad-${index}`);
            if (btn) {
                btn.classList.add('animate-shake');
                setTimeout(() => btn.classList.remove('animate-shake'), 400);
            }
        }
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center relative">
            <h2 className={`text-4xl font-black mb-8 drop-shadow-md ${mode === 'forward' ? 'text-blue-200' : 'text-red-200'}`}>
                {mode === 'forward' ? t('sequence.titleNormal') : t('sequence.title')}
            </h2>

            {/* Instruction */}
            <div className="h-8 mb-8">
                {phase === 'SHOWING' && <span className="text-yellow-400 font-bold animate-pulse">{mode === 'forward' ? t('sequence.instructionNormal') : t('sequence.instruction')}</span>}
                {phase === 'INPUT' && <span className="text-green-400 font-bold">{mode === 'forward' ? t('sequence.instructionNormal') : t('sequence.instruction')}</span>}
                {phase === 'SUCCESS' && <span className="text-blue-400 font-bold">Great!</span>}
            </div>

            <div className="grid grid-cols-3 gap-4 w-72 h-72">
                {[...Array(GRID_SIZE)].map((_, i) => {
                    const isSequenceMember = sequence.includes(i);
                    const seqIndex = sequence.indexOf(i);
                    const color = isSequenceMember ? targetColors[seqIndex] : null;

                    let bgClass = 'bg-gray-800';
                    let style: React.CSSProperties = {};

                    if (phase === 'SHOWING') {
                        if (isSequenceMember && seqIndex < seqStep) {
                            bgClass = 'bg-black scale-105 shadow-[0_0_20px_rgba(0,0,0,0.8)] z-10';
                            style = { backgroundColor: '#000' };
                        }
                    } else if (phase === 'INPUT' || phase === 'SUCCESS') {
                        if (isSequenceMember) {
                            // If clicked, dim it?
                            const isClicked = userInput.includes(i);
                            if (isClicked) {
                                bgClass = 'bg-gray-900 opacity-30';
                            } else {
                                style = { backgroundColor: color || '#fff' };
                                bgClass = 'shadow-lg hover:brightness-110';
                            }
                        }
                    }

                    return (
                        <motion.button
                            id={`pad-${i}`}
                            key={i}
                            className={`rounded-xl transition-all duration-200 border-4 border-transparent ${bgClass}`}
                            style={style}
                            onPointerDown={(e) => {
                                e.preventDefault();
                                if (e.currentTarget.setPointerCapture) {
                                    try {
                                        e.currentTarget.setPointerCapture(e.pointerId);
                                    } catch {
                                        // Ignore capture errors on unsupported pointer types
                                    }
                                }
                                handlePadClick(i);
                            }}
                            layout
                            whileTap={{ scale: 0.95 }}
                        />
                    );
                })}
            </div>
        </div>
    );
};

export default SequenceGame;
