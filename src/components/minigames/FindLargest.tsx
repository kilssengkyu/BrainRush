import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';
import { useSound } from '../../contexts/SoundContext';

type Operator = '+' | '-' | '*' | '/';

interface FindLargestProps {
    seed: string | null;
    onScore: (amount: number) => void;
    isPlaying: boolean;
}

interface ExpressionOption {
    id: string;
    expression: string;
    value: number;
}

interface LevelConfig {
    count: number;
    ops: Operator[];
    addRange: [number, number];
    mulRange?: [number, number];
    divRange?: {
        quotient: [number, number];
        divisor: [number, number];
    };
}

const LEVELS: Record<number, LevelConfig & { allowComplex?: boolean }> = {
    1: { count: 2, ops: ['+'], addRange: [1, 9] },
    2: { count: 3, ops: ['+', '-'], addRange: [2, 15] },
    3: { count: 4, ops: ['+', '-', '*'], addRange: [5, 25], mulRange: [2, 8], allowComplex: true },
    4: { count: 5, ops: ['+', '-', '*', '/'], addRange: [8, 35], mulRange: [2, 9], divRange: { quotient: [3, 18], divisor: [2, 9] }, allowComplex: true }
};

const getLevel = (index: number) => {
    if (index < 3) return 1;
    if (index < 6) return 2;
    if (index < 9) return 3;
    return 4;
};

const formatExpression = (raw: string) => raw;

const FindLargest: React.FC<FindLargestProps> = ({ seed, onScore, isPlaying }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [panelIndex, setPanelIndex] = useState(0);
    const [shakeId, setShakeId] = useState<string | null>(null);
    const [animationKey, setAnimationKey] = useState(0);

    const currentProblem = useMemo(() => {
        if (!seed) return null;

        const rng = new SeededRandom(`${seed}_largest_${panelIndex} `);
        const level = getLevel(panelIndex);
        const config = LEVELS[level];

        const buildComplexExpression = (): { expression: string; value: number } => {
            // Generate A op1 B op2 C
            // We'll stick to simple ops for complex: +, -, *
            const ops = ['+', '-', '*'];
            const op1 = rng.pick(ops);
            const op2 = rng.pick(ops);

            // Ranges (keep them slightly smaller for 3-term to avoid huge numbers)
            const range: [number, number] = [2, 9];
            const a = rng.nextInt(range[0], range[1] + 1);
            const b = rng.nextInt(range[0], range[1] + 1);
            const c = rng.nextInt(range[0], range[1] + 1);

            const expression = `${a} ${op1} ${b} ${op2} ${c} `;

            // Basic eval with precedence
            // Manual calc to avoid dangerous eval or complex parser
            let val = 0;

            // Helper to calc single op
            const calc = (n1: number, op: string, n2: number) => {
                if (op === '+') return n1 + n2;
                if (op === '-') return n1 - n2;
                if (op === '*') return n1 * n2;
                return n1;
            };

            // Order: * has higher precedence
            if (op1 === '*' && op2 !== '*') {
                // (a * b) op2 c
                val = calc(calc(a, '*', b), op2, c);
            } else if (op2 === '*' && op1 !== '*') {
                // a op1 (b * c)
                val = calc(a, op1, calc(b, '*', c));
            } else {
                // Left to right
                val = calc(calc(a, op1, b), op2, c);
            }

            return { expression, value: val };
        };

        const buildSimpleExpression = (): { expression: string; value: number } => {
            const op = rng.pick(config.ops);

            if (op === '+') {
                const a = rng.nextInt(config.addRange[0], config.addRange[1] + 1);
                const b = rng.nextInt(config.addRange[0], config.addRange[1] + 1);
                return { expression: `${a} + ${b} `, value: a + b };
            }

            if (op === '-') {
                let a = rng.nextInt(config.addRange[0], config.addRange[1] + 1);
                let b = rng.nextInt(config.addRange[0], config.addRange[1] + 1);
                if (b > a) [a, b] = [b, a];
                return { expression: `${a} - ${b} `, value: a - b };
            }

            if (op === '*') {
                const [minMul, maxMul] = config.mulRange || [2, 8];
                const a = rng.nextInt(minMul, maxMul + 1);
                const b = rng.nextInt(minMul, maxMul + 1);
                return { expression: `${a} * ${b} `, value: a * b };
            }

            const divRange = config.divRange || { quotient: [3, 12], divisor: [2, 9] };
            const quotient = rng.nextInt(divRange.quotient[0], divRange.quotient[1] + 1);
            const divisor = rng.nextInt(divRange.divisor[0], divRange.divisor[1] + 1);
            const dividend = quotient * divisor;
            return { expression: `${dividend} / ${divisor}`, value: quotient };
        };

        const buildExpression = () => {
            // 50% chance to build complex if allowed
            if (config.allowComplex && rng.next() > 0.5) {
                return buildComplexExpression();
            }
            return buildSimpleExpression();
        };

        const options: ExpressionOption[] = [];
        const usedValues = new Set<number>();
        let attempts = 0;

        while (options.length < config.count && attempts < 200) {
            const candidate = buildExpression();
            if (!usedValues.has(candidate.value)) {
                usedValues.add(candidate.value);
                options.push({
                    id: `${panelIndex}-${options.length}-${candidate.expression}`,
                    expression: candidate.expression,
                    value: candidate.value
                });
            }
            attempts += 1;
        }

        while (options.length < config.count) {
            const value = options.length + 1;
            options.push({
                id: `${panelIndex}-fallback-${value}`,
                expression: `${value} + 0`,
                value
            });
        }

        const maxValue = Math.max(...options.map(option => option.value));

        return {
            options: rng.shuffle(options),
            maxValue,
            level
        };
    }, [seed, panelIndex]);

    const handleOptionClick = (option: ExpressionOption) => {
        if (!currentProblem || !isPlaying) return;

        const scoreBase = 20 + panelIndex * 5;

        if (option.value === currentProblem.maxValue) {
            // Correct
            onScore(10);
            playSound('correct');
            setPanelIndex(prev => prev + 1);
            setAnimationKey(prev => prev + 1);
        } else {
            onScore(-scoreBase);
            playSound('error');
            setShakeId(option.id);
            setTimeout(() => setShakeId(null), 400);
        }
    };

    if (!currentProblem) return <div className="text-white">{t('common.loading')}</div>;

    const optionCount = currentProblem.options.length;
    const gridClass = optionCount === 2
        ? 'grid-cols-2'
        : optionCount === 3
            ? 'grid-cols-3'
            : optionCount === 4
                ? 'grid-cols-2'
                : 'grid-cols-3';

    const textClass = optionCount >= 5 ? 'text-xl' : optionCount === 4 ? 'text-2xl' : 'text-3xl';

    return (
        <div className="flex flex-col items-center justify-center w-full h-full gap-6 relative">
            <h2 className="text-4xl font-black text-white drop-shadow-md mb-2">
                {t('largest.title')}
            </h2>
            <div className="text-gray-400 text-sm mb-4">{t('largest.instruction')}</div>

            <AnimatePresence mode="popLayout">
                <motion.div
                    key={animationKey}
                    initial={{ scale: 0.9, opacity: 0, y: 10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 1.05, opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className={`grid gap-4 w-full max-w-3xl ${gridClass}`}
                >
                    {currentProblem.options.map(option => (
                        <motion.button
                            key={option.id}
                            onPointerDown={(e) => {
                                e.preventDefault();
                                if (e.currentTarget.setPointerCapture) {
                                    try {
                                        e.currentTarget.setPointerCapture(e.pointerId);
                                    } catch {
                                        // Ignore capture errors on unsupported pointer types
                                    }
                                }
                                handleOptionClick(option);
                            }}
                            animate={shakeId === option.id ? { x: [-6, 6, -6, 6, 0], backgroundColor: '#ef4444' } : {}}
                            whileTap={{ scale: 0.95 }}
                            className={`h-24 rounded-2xl flex items-center justify-center ${textClass} font-bold text-white bg-gray-800 border-b-4 border-gray-950 hover:bg-gray-700 active:border-b-0 active:translate-y-1 transition-all`}
                        >
                            {formatExpression(option.expression)}
                        </motion.button>
                    ))}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export default FindLargest;
