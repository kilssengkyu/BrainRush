import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';

interface ColorMatchProps {
    seed: string | null;
    onScore: (amount: number) => void;
}

type ColorType = 'red' | 'blue' | 'green' | 'yellow';

const COLORS: Record<ColorType, { tailwind: string; hex: string }> = {
    red: { tailwind: 'text-red-500', hex: '#ef4444' },
    blue: { tailwind: 'text-blue-500', hex: '#3b82f6' },
    green: { tailwind: 'text-green-500', hex: '#22c55e' },
    yellow: { tailwind: 'text-yellow-400', hex: '#facc15' },
};

const ColorMatch: React.FC<ColorMatchProps> = ({ seed, onScore }) => {
    const { t } = useTranslation();
    const [panelIndex, setPanelIndex] = useState(0);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [shakeId, setShakeId] = useState<number | null>(null);
    const [animationKey, setAnimationKey] = useState(0);
    const [isSolved, setIsSolved] = useState(false);

    // Difficulty
    // Level 1: 2 Options
    // Level 2: 3 Options
    // Level 3: 4 Options
    const getLevel = (index: number) => {
        if (index < 3) return 1;
        if (index < 6) return 2;
        return 3;
    };

    const currentPanel = useMemo(() => {
        if (!seed) return null;

        const rng = new SeededRandom(`${seed}_color_${panelIndex}`);
        const level = getLevel(panelIndex);
        const count = level === 1 ? 2 : (level === 2 ? 3 : 4);

        // Generate Items
        // Each item has a VISUAL color and a TEXT meaning
        const keys = Object.keys(COLORS) as ColorType[];
        const items: { visual: ColorType; text: ColorType; isMatch: boolean; id: number }[] = [];
        let correctCount = 0;

        // Ensure at least one match
        while (items.length < count) {
            const visual = keys[Math.floor(rng.next() * keys.length)];
            const text = keys[Math.floor(rng.next() * keys.length)];
            const isMatch = visual === text;

            items.push({ visual, text, isMatch, id: items.length });
            if (isMatch) correctCount++;
        }

        // If no matches (very rare but possible), force one
        if (correctCount === 0) {
            const idx = Math.floor(rng.next() * count);
            items[idx].text = items[idx].visual;
            items[idx].isMatch = true;
        }

        return { items, level };
    }, [seed, panelIndex]);

    const handleItemClick = (index: number) => {
        if (!currentPanel || isSolved) return;

        const item = currentPanel.items[index];

        if (item.isMatch) {
            // Correct click
            if (!selectedIndices.has(index)) {
                const newSet = new Set(selectedIndices);
                newSet.add(index);
                setSelectedIndices(newSet);
            }
        } else {
            // Wrong click -> Penalty & Shake
            setShakeId(index);
            onScore(-20); // Small penalty
            setTimeout(() => setShakeId(null), 400);
        }
    };

    // Check Completion
    useEffect(() => {
        if (!currentPanel || isSolved) return;

        const correctIndices = currentPanel.items
            .map((item, idx) => item.isMatch ? idx : -1)
            .filter(idx => idx !== -1);

        const allCorrectSelected = correctIndices.every(idx => selectedIndices.has(idx));
        const noWrongSelected = Array.from(selectedIndices).every(idx => currentPanel.items[idx].isMatch);

        if (allCorrectSelected && noWrongSelected) {
            // Level Complete
            setIsSolved(true);
            onScore(100);

            setTimeout(() => {
                setPanelIndex(prev => prev + 1);
                setSelectedIndices(new Set());
                setIsSolved(false);
                setAnimationKey(prev => prev + 1);
            }, 250);
        }

    }, [selectedIndices, currentPanel, isSolved, onScore]);

    if (!currentPanel) return <div className="text-white">Loading...</div>;

    return (
        <div className="flex flex-col items-center justify-center w-full h-full gap-8 relative">
            <div className="absolute top-0 text-gray-500 font-mono text-sm mt-2">
                Level: {currentPanel.level} | Panel: {panelIndex + 1}
            </div>

            <h2 className="text-4xl font-black text-white drop-shadow-md">
                {t('color.title')}
            </h2>
            <div className="text-gray-400 text-sm mb-4">{t('color.instruction')}</div>

            <div className={`grid gap-6 ${currentPanel.items.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                <AnimatePresence mode="popLayout">
                    {currentPanel.items.map((item, idx) => (
                        <motion.button
                            key={`${panelIndex}-${idx}-${animationKey}`}
                            layout
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={
                                shakeId === idx
                                    ? { x: [-5, 5, -5, 5, 0], backgroundColor: '#ef4444' }
                                    : {
                                        scale: selectedIndices.has(idx) ? 0.95 : 1,
                                        opacity: selectedIndices.has(idx) ? 0.5 : 1, // Dim if selected
                                        borderColor: COLORS[item.visual].hex // Visual Border
                                    }
                            }
                            exit={{ scale: 0, opacity: 0 }}
                            onClick={() => handleItemClick(idx)}
                            className={`w-36 h-36 rounded-2xl flex items-center justify-center text-4xl font-bold bg-gray-900 border-8 transition-all shadow-lg ${COLORS[item.visual].tailwind}`}
                            style={{
                                borderColor: COLORS[item.visual].hex,
                                backgroundColor: selectedIndices.has(idx) ? '#ffffff33' : '#111827'
                            }}
                        >
                            {t(`color.${item.text}`)}
                        </motion.button>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default ColorMatch;
