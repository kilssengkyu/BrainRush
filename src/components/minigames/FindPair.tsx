import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
    Heart, Star, Circle, Square, Triangle,
    Diamond, Cloud, Sun, Moon, Zap,
    Umbrella, Anchor, Music, Camera, Gift,
    Hexagon, Octagon, Box, Ghost, Crown
} from 'lucide-react';
import { SeededRandom } from '../../utils/seededRandom';
import { useSound } from '../../contexts/SoundContext';

interface FindPairProps {
    seed: string | null;
    onScore: (amount: number) => void;
    isPlaying: boolean;
}

const SHAPES = [
    Heart, Star, Circle, Square, Triangle,
    Diamond, Cloud, Sun, Moon, Zap,
    Umbrella, Anchor, Music, Camera, Gift,
    Hexagon, Octagon, Box, Ghost, Crown
];

const ALPHABETS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

type Mode = 'NUMBER' | 'ALPHABET' | 'SHAPE';

interface CardItem {
    id: string;
    content: string | number | React.ElementType; // React.ElementType for Shapes
    type: Mode;
    isCorrect: boolean; // Debugging purpose mostly, but logically this pair is the target
}

const FindPair: React.FC<FindPairProps> = ({ seed, onScore, isPlaying }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [round, setRound] = useState(1);
    const [shakeIds, setShakeIds] = useState<string[]>([]);
    const [clearedIds, setClearedIds] = useState<string[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isResolving, setIsResolving] = useState(false);

    // 키 스테이트를 이용해 전체 리렌더링 효과 (난이도 변경 시 깔끔하게 전환)
    const [animationKey, setAnimationKey] = useState(0);

    // 난이도 결정 로직
    const difficulty = useMemo(() => {
        // Round 1-4: 6 cards (3 pairs? NO. "Find the PAIR". Only 1 pair exists.)
        // Logic: Total N cards. 2 are matching (Target). N-2 are unique distractors.

        let count = 6;
        if (round > 4) count = 9;
        if (round > 8) count = 12;
        if (round > 12) count = 16;

        return { count };
    }, [round]);

    // 카드 생성 로직
    const { cards } = useMemo(() => {
        if (!seed) return { cards: [], currentMode: 'NUMBER' as Mode };

        const rng = new SeededRandom(`${seed}_pair_${round}`);

        // 모드 랜덤 선택 (또는 라운드별 순환)
        const modes: Mode[] = ['NUMBER', 'ALPHABET', 'SHAPE'];
        const mode = modes[Math.floor(rng.next() * modes.length)];

        // 전체 카드 수
        const totalCards = difficulty.count;
        const distractorCount = totalCards - 2;

        let targetItem: any;
        let distractors: any[] = [];

        if (mode === 'NUMBER') {
            // 카드 개수가 9개 이하일 때는 한 자리 숫자(1-9), 그 이상일 때는 두 자리 숫자 포함(1-99)
            const maxNum = totalCards <= 9 ? 9 : 99;
            // 유니크한 숫자 풀 생성
            const usedNumbers = new Set<number>();
            while (usedNumbers.size < distractorCount + 1) {
                usedNumbers.add(Math.floor(rng.next() * maxNum) + 1);
            }
            const nums = Array.from(usedNumbers);
            targetItem = nums.pop();
            distractors = nums;
        } else if (mode === 'ALPHABET') {
            const allChars = ALPHABETS.split('');
            const shuffled = rng.shuffle(allChars);
            targetItem = shuffled[0];
            distractors = shuffled.slice(1, distractorCount + 1);
        } else {
            const allShapes = [...SHAPES];
            const shuffled = rng.shuffle(allShapes);
            targetItem = shuffled[0]; // Component Type
            distractors = shuffled.slice(1, distractorCount + 1);
        }

        // 카드 객체 생성
        const rawCards: CardItem[] = [];

        // 정답 쌍 추가 (2개)
        rawCards.push({ id: `target-1`, content: targetItem, type: mode, isCorrect: true });
        rawCards.push({ id: `target-2`, content: targetItem, type: mode, isCorrect: true });

        // 오답 카드 추가
        distractors.forEach((d, idx) => {
            rawCards.push({ id: `dist-${idx}`, content: d, type: mode, isCorrect: false });
        });

        // 섞기
        const shuffledCards = rng.shuffle(rawCards);

        return { cards: shuffledCards };
    }, [seed, round, difficulty]);

    const handleCardClick = (id: string) => {
        if (isResolving || selectedIds.includes(id) || clearedIds.includes(id) || !isPlaying) return;

        const newSelected = [...selectedIds, id];
        setSelectedIds(newSelected);

        if (newSelected.length === 2) {
            setIsResolving(true);
            const card1 = cards.find(c => c.id === newSelected[0]);
            const card2 = cards.find(c => c.id === newSelected[1]);

            if (card1 && card2 && card1.content === card2.content) {
                // 정답!
                onScore(30 + (round * 5)); // 난이도별 가산점
                playSound('correct');
                setClearedIds([card1.id, card2.id]);

                // 다음 라운드
                // 즉각적인 반응을 위해 딜레이 최소화 (100ms)
                setTimeout(() => {
                    setRound(prev => prev + 1);
                    setSelectedIds([]);
                    setClearedIds([]);
                    setAnimationKey(prev => prev + 1);
                    setIsResolving(false);
                }, 100);
            } else {
                // 오답
                onScore(-20);
                playSound('error');
                setShakeIds(newSelected);
                setTimeout(() => {
                    setShakeIds([]);
                    setSelectedIds([]);
                    setIsResolving(false);
                }, 400); // 오답은 피드백을 위해 약간 유지
            }
        }
    };

    // 렌더링 헬퍼
    const renderContent = (card: CardItem) => {
        if (card.type === 'SHAPE') {
            const ShapeIcon = card.content as React.ElementType;
            return <ShapeIcon size={32} />; // 반응형 크기 조절 필요할 수 있음
        }
        return <span className="text-3xl font-bold">{card.content as string}</span>;
    };

    if (!seed) return null;

    return (
        <div className="flex flex-col items-center justify-center w-full h-full p-4">
            <h2 className="text-3xl font-black text-white mb-2 drop-shadow-md">
                {t('pair.title')}
            </h2>
            <div className="text-gray-400 text-sm mb-6 animate-pulse">
                {t('pair.instruction')}
            </div>

            <AnimatePresence mode="popLayout">
                <motion.div
                    key={animationKey}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.05, transition: { duration: 0.1 } }}
                    transition={{ duration: 0.15 }}
                    className="grid gap-3 w-full max-w-md mx-auto"
                    style={{
                        gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(cards.length))}, minmax(0, 1fr))`
                    }}
                >
                    {cards.map((card) => {
                        const isSelected = selectedIds.includes(card.id);
                        const isCleared = clearedIds.includes(card.id);
                        const isShaking = shakeIds.includes(card.id);

                        // Determine background color based on state
                        let bgColor = '#ffffff'; // Default white
                        let borderColor = '#d1d5db'; // gray-300
                        let textColor = '#1f2937'; // gray-800

                        if (isShaking) {
                            bgColor = '#ef4444'; // Red
                            borderColor = '#b91c1c'; // Red-700
                            textColor = '#ffffff';
                        } else if (isSelected || isCleared) {
                            bgColor = '#22c55e'; // Green
                            borderColor = '#15803d'; // Green-700
                            textColor = '#ffffff';
                        }

                        return (
                            <motion.button
                                key={card.id}
                                onPointerDown={(e) => {
                                    e.preventDefault();
                                    if (e.currentTarget.setPointerCapture) {
                                        try {
                                            e.currentTarget.setPointerCapture(e.pointerId);
                                        } catch {
                                            // Ignore capture errors on unsupported pointer types
                                        }
                                    }
                                    handleCardClick(card.id);
                                }}
                                animate={{
                                    x: isShaking ? [-5, 5, -5, 5, 0] : 0,
                                    backgroundColor: bgColor,
                                    borderColor: borderColor,
                                    color: textColor
                                }}
                                transition={{ duration: 0.2 }}
                                className={`
                                    aspect-square rounded-xl flex items-center justify-center
                                    shadow-lg border-b-4 active:border-b-0 active:translate-y-1 transition-transform
                                    /* Removed bg/border/text classes in favor of animate */
                                    font-bold
                                `}
                            >
                                {renderContent(card)}
                            </motion.button>
                        );
                    })}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export default FindPair;
