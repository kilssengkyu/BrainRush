import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
    Heart, Star, Circle, Square, Triangle,
    Diamond, Cloud, Sun, Moon, Zap,
    Umbrella, Anchor, Music, Camera, Gift
} from 'lucide-react';
import { SeededRandom } from '../../utils/seededRandom';

interface MemoryMatchProps {
    seed: string; // Used to sync randomization if needed (though local random is often fine for logic if not strict PVP lockstep)
    onScore: (amount: number) => void;
}

interface Card {
    id: number;
    iconIndex: number;
    isFlipped: boolean;
    isMatched: boolean;
}

const ICONS = [
    Heart, Star, Circle, Square, Triangle,
    Diamond, Cloud, Sun, Moon, Zap,
    Umbrella, Anchor, Music, Camera, Gift
];

const MemoryMatch: React.FC<MemoryMatchProps> = ({ seed, onScore }) => {
    const { t } = useTranslation();
    const [stage, setStage] = useState(1);
    const [cards, setCards] = useState<Card[]>([]);
    const [gameState, setGameState] = useState<'MEMORIZING' | 'PLAYING' | 'CLEARED'>('MEMORIZING');
    const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
    const [isResolving, setIsResolving] = useState(false);

    // Calculate card count based on stage
    // Stage 1-3: 4 cards
    // Stage 4-6: 6 cards
    // Stage 7-9: 8 cards
    const cardCount = useMemo(() => {
        const base = Math.floor((stage - 1) / 3);
        const count = 4 + (base * 2);
        return Math.min(count, 30);
    }, [stage]);

    // Check handling Level Clear
    // Check handling Level Clear
    const checkClear = useCallback((currentCards: Card[]) => {
        if (currentCards.length > 0 && currentCards.every(c => c.isMatched)) {
            setGameState('CLEARED');
            setTimeout(() => {
                setStage(prev => prev + 1);
            }, 500);
        }
    }, []);

    // Initialize Level
    const startLevel = useCallback((count: number) => {
        // Use seeded random with stage info
        const rng = new SeededRandom(`${seed}_memory_stage_${stage}`);

        const pairCount = count / 2;
        const availableIcons = [...Array(ICONS.length).keys()];
        const selectedIcons = rng.shuffle(availableIcons).slice(0, pairCount);

        let newCards: Card[] = [];
        selectedIcons.forEach((iconIdx, i) => {
            newCards.push({ id: i * 2, iconIndex: iconIdx, isFlipped: true, isMatched: false });
            newCards.push({ id: i * 2 + 1, iconIndex: iconIdx, isFlipped: true, isMatched: false });
        });

        newCards = rng.shuffle(newCards);

        setCards(newCards);
        setGameState('MEMORIZING');
        setFlippedIndices([]);
    }, [seed, stage]);

    // Initial Start
    useEffect(() => {
        startLevel(cardCount);
    }, [cardCount, stage, startLevel]);

    const checkForMatch = (currentCards: Card[], idx1: number, idx2: number) => {
        const card1 = currentCards[idx1];
        const card2 = currentCards[idx2];

        if (card1.iconIndex === card2.iconIndex) {
            // Match found
            onScore(20);

            // Fast update
            setTimeout(() => {
                const updatedCards = currentCards.map((c, i) =>
                    i === idx1 || i === idx2 ? { ...c, isMatched: true, isFlipped: true } : c
                );
                setCards(updatedCards);
                setFlippedIndices([]);
                checkClear(updatedCards);
                setIsResolving(false);
            }, 0);
        } else {
            // No Match
            onScore(-20);

            // Auto close fast
            setTimeout(() => {
                setCards(old => old.map((c, i) =>
                    (i === idx1 || i === idx2) ? { ...c, isFlipped: false } : c
                ));
                setFlippedIndices([]);
                setIsResolving(false);
            }, 500);
        }
    };

    const handleCardClick = (index: number) => {
        if (gameState !== 'PLAYING') return;
        if (isResolving) return;
        if (cards[index].isMatched || cards[index].isFlipped) return;

        let currentFlipped = [...flippedIndices];
        let currentCards = [...cards];

        currentCards[index].isFlipped = true;
        setCards(currentCards);

        const newFlipped = [...currentFlipped, index];
        setFlippedIndices(newFlipped);

        if (newFlipped.length === 2) {
            setIsResolving(true);
            checkForMatch(currentCards, newFlipped[0], newFlipped[1]);
        }
    };

    const handleMemorizeDone = () => {
        setCards(prev => prev.map(c => ({ ...c, isFlipped: false })));
        setGameState('PLAYING');
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4">
            <h2 className="text-3xl font-black text-white mb-6 drop-shadow-lg">
                MEMORY MATCH (Lv. {stage})
            </h2>

            <div className="mb-4 min-h-[28px]">
                {gameState === 'MEMORIZING' && (
                    <div className="text-yellow-300 font-bold text-xl animate-bounce">
                        {t('memory.memorize_hint')}
                    </div>
                )}
                {gameState === 'PLAYING' && (
                    <div className="text-gray-400 font-bold text-lg">
                        {t('memory.find_pairs')}
                    </div>
                )}
            </div>

            <div
                className="grid gap-4 w-full max-w-2xl mx-auto transition-all duration-500"
                style={{
                    gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(cardCount))}, minmax(0, 1fr))`
                }}
            >
                <AnimatePresence>
                    {cards.map((card, index) => {
                        return (
                            <motion.div
                                key={card.id}
                                layout
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{
                                    scale: card.isMatched ? 0 : 1,
                                    opacity: card.isMatched ? 0 : 1
                                }}
                                transition={{ duration: card.isMatched ? 0.25 : 0.15 }}
                                exit={{ scale: 0, opacity: 0, transition: { duration: 0.2 } }}
                                className={`aspect-square relative perspective-1000 ${card.isMatched ? 'pointer-events-none' : 'cursor-pointer'}`}
                                onClick={() => handleCardClick(index)}
                            >
                                <motion.div
                                    className={`w-full h-full rounded-xl shadow-xl flex items-center justify-center border-4 transform-style-3d ${card.isFlipped
                                        ? 'bg-white border-blue-400 rotate-y-0'
                                        : 'bg-indigo-600 border-indigo-400 rotate-y-180 hover:bg-indigo-500'
                                        }`}
                                    animate={{ rotateY: card.isFlipped ? 0 : 180 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <div
                                        className="absolute inset-0 flex items-center justify-center bg-white rounded-xl backface-hidden"
                                        style={{
                                            opacity: card.isFlipped ? 1 : 0,
                                            transition: 'opacity 0.1s',
                                            backfaceVisibility: 'hidden',
                                            WebkitBackfaceVisibility: 'hidden'
                                        }}
                                    >
                                        {React.createElement(ICONS[card.iconIndex], {
                                            size: 40,
                                            className: "text-gray-800"
                                        })}
                                    </div>

                                    <div
                                        className="absolute inset-0 bg-indigo-600 rounded-xl flex items-center justify-center backface-hidden"
                                        style={{
                                            transform: 'rotateY(180deg)',
                                            backfaceVisibility: 'hidden',
                                            WebkitBackfaceVisibility: 'hidden'
                                        }}
                                    >
                                        <div className="w-8 h-8 rounded-full bg-indigo-400/30" />
                                    </div>
                                </motion.div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            <div className="mt-8 min-h-[64px]">
                <button
                    onClick={handleMemorizeDone}
                    disabled={gameState !== 'MEMORIZING'}
                    className={`px-8 py-4 bg-green-500 text-white font-black text-2xl rounded-2xl shadow-[0_4px_0_rgb(21,128,61)] transition-all ${gameState === 'MEMORIZING'
                        ? 'hover:bg-green-600 hover:shadow-[0_2px_0_rgb(21,128,61)] hover:translate-y-[2px]'
                        : 'opacity-0 pointer-events-none'
                        }`}
                >
                    {t('memory.btn_memorized')}
                </button>
            </div>
        </div>
    );
};

export default MemoryMatch;
