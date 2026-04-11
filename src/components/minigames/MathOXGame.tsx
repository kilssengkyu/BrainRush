import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { usePanelProgress } from '../../hooks/usePanelProgress';
import { SeededRandom } from '../../utils/seededRandom';
import { useSound } from '../../contexts/SoundContext';

interface MathOXGameProps {
    seed: string | null;
    onScore: (amount: number) => void;
    isPlaying: boolean;
}

type Problem = {
    expression: string;
    shownResult: number;
    isTrue: boolean;
};

const getDifficulty = (panelIndex: number) => {
    if (panelIndex < 6) return 1; // easy
    if (panelIndex < 12) return 2; // mid
    return 3; // hard
};

const randomInt = (rng: SeededRandom, min: number, max: number) =>
    Math.floor(rng.next() * (max - min + 1)) + min;

const buildTrueEquation = (rng: SeededRandom, difficulty: number): { expression: string; result: number } => {
    if (difficulty === 1) {
        const a = randomInt(rng, 1, 9);
        const b = randomInt(rng, 1, 9);
        return { expression: `${a} + ${b}`, result: a + b };
    }

    if (difficulty === 2) {
        // 2-digit + 1/2-digit, or 2-digit - 1/2-digit
        let a = randomInt(rng, 10, 99);
        let b = randomInt(rng, 1, 79);
        const op = rng.next() < 0.5 ? '+' : '-';
        if (op === '-' && b > a) [a, b] = [b, a];
        return { expression: `${a} ${op} ${b}`, result: op === '+' ? a + b : a - b };
    }

    // difficulty 3: 3 terms with +/- only
    let a = randomInt(rng, 10, 99);
    let b = randomInt(rng, 10, 99);
    let c = randomInt(rng, 1, 79);

    const op1 = rng.next() < 0.5 ? '+' : '-';
    if (op1 === '-' && b > a) [a, b] = [b, a];
    const first = op1 === '+' ? a + b : a - b;

    let op2 = rng.next() < 0.5 ? '+' : '-';
    if (op2 === '-' && c > first) {
        // avoid negative answers
        op2 = '+';
    }
    const result = op2 === '+' ? first + c : first - c;

    return { expression: `${a} ${op1} ${b} ${op2} ${c}`, result };
};

const createWrongResult = (rng: SeededRandom, answer: number, _difficulty: number): number => {
    // Keep ones digit identical to the true answer by shifting only in +/- 10 steps.
    const direction = rng.next() < 0.5 ? -1 : 1;
    let wrong = answer + direction * 10;
    if (wrong < 0) wrong = answer + 10;
    return wrong;
};

const MathOXGame: React.FC<MathOXGameProps> = ({ seed, onScore, isPlaying }) => {
    const WRONG_COOLDOWN_MS = 400;
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [panelIndex, setPanelIndex] = usePanelProgress(seed, 'math_ox');
    const [animKey, setAnimKey] = useState(0);
    const [shake, setShake] = useState<'o' | 'x' | null>(null);
    const [isInputLocked, setIsInputLocked] = useState(false);

    const problem = useMemo<Problem | null>(() => {
        if (!seed) return null;

        const rng = new SeededRandom(`${seed}_math_ox_${panelIndex}`);
        const difficulty = getDifficulty(panelIndex);
        const eq = buildTrueEquation(rng, difficulty);
        const isTrue = rng.next() < 0.5;
        const shownResult = isTrue ? eq.result : createWrongResult(rng, eq.result, difficulty);

        return {
            expression: eq.expression,
            shownResult,
            isTrue
        };
    }, [seed, panelIndex]);

    const submitAnswer = (answer: 'o' | 'x') => {
        if (!problem || !isPlaying || isInputLocked) return;

        const isCorrect = (answer === 'o' && problem.isTrue) || (answer === 'x' && !problem.isTrue);
        const scoreBase = (30 + (panelIndex * 5)) * 2;

        if (isCorrect) {
            setIsInputLocked(true);
            onScore(scoreBase);
            playSound('correct');
            setTimeout(() => {
                setPanelIndex((prev) => prev + 1);
                setAnimKey((prev) => prev + 1);
                setIsInputLocked(false);
            }, 120);
            return;
        }

        setIsInputLocked(true);
        onScore(-scoreBase);
        playSound('error');
        setShake(answer);
        setTimeout(() => {
            setShake(null);
            setIsInputLocked(false);
        }, WRONG_COOLDOWN_MS);
    };

    if (!problem) {
        return <div className="text-slate-900 dark:text-white">{t('common.loading')}</div>;
    }

    return (
        <div className="flex flex-col items-center justify-center w-full h-full gap-8">
            <AnimatePresence mode="wait">
                <motion.div
                    key={animKey}
                    initial={{ y: 16, opacity: 0.65, scale: 0.98 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: -16, opacity: 0, scale: 1.02 }}
                    transition={{ duration: 0.16 }}
                    className="w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/65 px-6 py-8 shadow-xl text-center"
                >
                    <div className="text-[clamp(1.35rem,5vw,2.6rem)] font-black text-slate-900 dark:text-white tracking-wide">
                        {problem.expression}
                        <span className="mx-3 text-slate-400">=</span>
                        <span className="text-cyan-600 dark:text-cyan-300">{problem.shownResult}</span>
                    </div>
                </motion.div>
            </AnimatePresence>

            <div className="w-full max-w-md grid grid-cols-2 gap-4">
                <motion.button
                    disabled={isInputLocked || !isPlaying}
                    onPointerDown={(e) => {
                        e.preventDefault();
                        submitAnswer('o');
                    }}
                    whileTap={{ scale: 0.96 }}
                    animate={shake === 'o' ? { x: [-6, 6, -4, 4, 0] } : {}}
                    className="h-24 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-4xl font-black shadow-lg"
                >
                    O
                </motion.button>
                <motion.button
                    disabled={isInputLocked || !isPlaying}
                    onPointerDown={(e) => {
                        e.preventDefault();
                        submitAnswer('x');
                    }}
                    whileTap={{ scale: 0.96 }}
                    animate={shake === 'x' ? { x: [-6, 6, -4, 4, 0] } : {}}
                    className="h-24 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white text-4xl font-black shadow-lg"
                >
                    X
                </motion.button>
            </div>
        </div>
    );
};

export default MathOXGame;
