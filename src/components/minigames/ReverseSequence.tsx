import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';

interface ReverseSequenceProps {
    seed: string | null;
    onScore: (amount: number) => void;
}

const COLORS = [
    '#F472B6', // Pink
    '#22D3EE', // Cyan
    '#A3E635', // Lime
    '#FACC15', // Yellow
    '#F87171', // Red
    '#60A5FA', // Blue
];

const ReverseSequence: React.FC<ReverseSequenceProps> = ({ seed, onScore }) => {
    const { t } = useTranslation();
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
        const rng = new SeededRandom(`${seed}_reverse_${stage}`);
        const available = [...Array(GRID_SIZE).keys()];
        const newSequence = rng.shuffle(available).slice(0, itemCount);

        // Pick random colors for the end state
        const newColors = newSequence.map(() => rng.pick(COLORS));

        setSequence(newSequence);
        setTargetColors(newColors);
        setUserInput([]);
        setPhase('SHOWING');
        setSeqStep(0); // Reset visible count

    }, [seed, stage, itemCount]);

    useEffect(() => {
        startRound();
    }, [stage, startRound]);

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
        if (phase !== 'INPUT') return;

        // Check if clicked pad is in the sequence (Validation? Or just strict order?)
        // Rule: "Reverse Order".
        // Sequence: [A, B, C, D]
        // Target Input: [D, C, B, A]

        // Current Step to match: sequence[sequence.length - 1 - userInput.length]
        const targetIndex = sequence[sequence.length - 1 - userInput.length];

        if (index === targetIndex) {
            // Correct
            const newInput = [...userInput, index];
            setUserInput(newInput);
            onScore(20);

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
            // Shake effect or feedback?
            // Maybe reset user input to try again? Or just penalty?
            // "틀리면 감점 맞출때마다 20점으로" -> User didn't specify game over.
            // Let's visual feedback (shake)

            // For now, let's just deduct and maybe briefly flash red?
            const btn = document.getElementById(`pad-${index}`);
            if (btn) {
                btn.classList.add('animate-shake');
                setTimeout(() => btn.classList.remove('animate-shake'), 400);
            }
        }
    };

    // Render Helper
    // If INPUT phase, key buttons should be COLORED?
    // "랜덤한 밝은색 색으로 변한 후에" -> After sequence shown, they become colored?
    // Which ones? ALL? Or just the sequence ones?
    // "생긴 반대순으로 누르면" -> Implies only the ones that appeared are relevant.
    // So ONLY the buttons in sequence are lit up with random colors during INPUT phase?
    // Or maybe they flash black, then disappear, then ALL lit up?
    // Usually "Simon Says" style: they flash, then you interact.
    // User said: "4 black buttons appear sequentially -> change to random bright colors -> press reverse"
    // This implies the 4 buttons STAY visible as colors?

    // Let's assume:
    // 1. Black flash sequence (positions)
    // 2. All 4 buttons (in those positions) turn ON with random bright colors simultaneously.
    // 3. User clicks reverse.

    return (
        <div className="w-full h-full flex flex-col items-center justify-center relative">
            <div className="absolute top-4 text-gray-500 font-mono text-sm">
                Stage {stage}
            </div>

            <h2 className="text-3xl font-black text-white mb-8 drop-shadow-md">
                {t('sequence.title')}
            </h2>

            {/* Instruction */}
            <div className="h-8 mb-8">
                {phase === 'SHOWING' && <span className="text-yellow-400 font-bold animate-pulse">{t('sequence.instruction')}</span>}
                {phase === 'INPUT' && <span className="text-green-400 font-bold">{t('sequence.instruction')}</span>}
                {phase === 'SUCCESS' && <span className="text-blue-400 font-bold">Great!</span>}
            </div>

            <div className="grid grid-cols-3 gap-4 w-72 h-72">
                {[...Array(GRID_SIZE)].map((_, i) => {
                    const isSequenceMember = sequence.includes(i);
                    const seqIndex = sequence.indexOf(i);
                    const color = isSequenceMember ? targetColors[seqIndex] : null;

                    // State Determination
                    // SHOWING: ActiveLight matches i? -> Black
                    // INPUT: isSequenceMember? -> Color. Clicked? -> Dimmed or Checkmark?
                    // Let's keep them colored until clicked? Or just always colored?

                    let bgClass = 'bg-gray-800';
                    let style: React.CSSProperties = {};

                    if (phase === 'SHOWING') {
                        if (isSequenceMember && seqIndex < seqStep) {
                            bgClass = 'bg-black scale-105 shadow-[0_0_20px_rgba(0,0,0,0.8)] z-10';
                            style = { backgroundColor: '#000' };
                        }
                    } else if (phase === 'INPUT' || phase === 'SUCCESS') {
                        if (isSequenceMember) {
                            // Color Mode
                            // If already clicked (correctly), maybe dim or hide?
                            // "생긴 반대순으로 누르면" -> usually they disappear or dim.
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
                            onClick={() => handlePadClick(i)}
                            layout
                            whileTap={{ scale: 0.95 }}
                        />
                    );
                })}
            </div>
        </div>
    );
};

export default ReverseSequence;
