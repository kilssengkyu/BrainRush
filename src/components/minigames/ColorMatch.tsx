import React, { useState, useMemo } from 'react';
import { usePanelProgress } from '../../hooks/usePanelProgress';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';
import { useSound } from '../../contexts/SoundContext';

interface ColorMatchProps {
    seed: string | null;
    onScore: (amount: number) => void;
    isPlaying: boolean;
}

type ColorType = 'red' | 'blue' | 'green' | 'yellow';

const COLORS: Record<ColorType, { tailwind: string; hex: string }> = {
    red: { tailwind: 'text-red-500', hex: '#ef4444' },
    blue: { tailwind: 'text-blue-500', hex: '#3b82f6' },
    green: { tailwind: 'text-green-500', hex: '#22c55e' },
    yellow: { tailwind: 'text-yellow-400', hex: '#facc15' },
};

const ColorMatch: React.FC<ColorMatchProps> = ({ seed, onScore, isPlaying }) => {
    const WRONG_COOLDOWN_MS = 400;
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [panelIndex, setPanelIndex] = usePanelProgress(seed);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [shakeId, setShakeId] = useState<number | null>(null);
    const [isSolved, setIsSolved] = useState(false);
    const [isInputLocked, setIsInputLocked] = useState(false);
    const [isWrongFlash, setIsWrongFlash] = useState(false);

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
        const maxCorrectCount = Math.min(2, count - 1);
        const targetCorrectCount = maxCorrectCount === 1
            ? 1
            : (rng.next() < 0.5 ? 1 : 2);

        const indices = Array.from({ length: count }, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(rng.next() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        const matchIndexSet = new Set(indices.slice(0, targetCorrectCount));

        for (let i = 0; i < count; i++) {
            const visual = keys[Math.floor(rng.next() * keys.length)];
            const isMatch = matchIndexSet.has(i);
            const text = isMatch
                ? visual
                : keys.filter((key) => key !== visual)[Math.floor(rng.next() * (keys.length - 1))];

            items.push({ visual, text, isMatch, id: i });
        }

        return { items, level };
    }, [seed, panelIndex]);

    const handleItemClick = (index: number) => {
        if (!currentPanel || isSolved || !isPlaying || isInputLocked) return;
        if (selectedIndices.has(index)) return;

        // Toggle selection
        const newSelected = new Set(selectedIndices);
        if (newSelected.has(index)) {
            newSelected.delete(index);
        } else {
            newSelected.add(index);
        }
        setSelectedIndices(newSelected);

        const item = currentPanel.items[index];

        // Check Logic - Actually ColorMatch logic usually isn't "click one by one to verify".
        // It's "Select all Red things".
        // If I click a WRONG item, it should penalize immediately? or just toggle?
        // Instruction says: "Select all [Red] items".
        // Usually clicking a wrong item acts as penalty.

        if (item.isMatch) {
            // Correct item selected. Award per-correct hit.
            onScore(60);
            // Check if ALL are selected.
            const correctIndices = currentPanel.items
                .map((it, idx) => it.isMatch ? idx : -1)
                .filter(idx => idx !== -1);

            // We need to check if the CURRENT selection state (after update) is complete.
            // But wait, React state update is async.
            // Let's check based on `newSelected`.

            const allCorrectSelected = correctIndices.every(idx => newSelected.has(idx));
            const noWrongSelected = Array.from(newSelected).every(idx => currentPanel.items[idx].isMatch);

            if (allCorrectSelected && noWrongSelected) {
                // Level Complete bonus
                setIsInputLocked(true);
                setIsSolved(true);
                onScore(30);
                playSound('correct');

                setTimeout(() => {
                    setPanelIndex(prev => prev + 1);
                    setSelectedIndices(new Set());
                    setIsSolved(false);
                    setIsInputLocked(false);
                }, 250);
            }
        } else {
            // Wrong item selected!
            // Penalty
            setIsInputLocked(true);
            setIsWrongFlash(true);
            onScore(-60);
            playSound('error');
            setShakeId(index);
            setTimeout(() => {
                setShakeId(null);
                setIsInputLocked(false);
                setIsWrongFlash(false);
            }, WRONG_COOLDOWN_MS);

            // Should we allow it to stay selected? Probably not if it's "Wrong".
            // Deselect it
            newSelected.delete(index);
            setSelectedIndices(newSelected);
        }
    };

    if (!currentPanel) return <div className="text-slate-900 dark:text-white">{t('common.loading')}</div>;

    return (
        <div className="flex flex-col items-center justify-center w-full h-full gap-8 relative">
            <div className={`grid gap-6 ${currentPanel.items.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                {currentPanel.items.map((item, idx) => (
                    <button
                        key={`${panelIndex}-${idx}`}
                        disabled={isInputLocked || !isPlaying || isSolved}
                        onPointerDown={(e) => {
                            e.preventDefault();
                            if (e.currentTarget.setPointerCapture) {
                                try {
                                    e.currentTarget.setPointerCapture(e.pointerId);
                                } catch {
                                    // Ignore capture errors on unsupported pointer types
                                }
                            }
                            handleItemClick(idx);
                        }}
                        className={`w-36 h-36 rounded-2xl flex items-center justify-center text-4xl font-bold bg-slate-50 dark:bg-gray-900 border-8 shadow-lg transition-colors active:scale-95 ${shakeId === idx ? 'animate-shake' : ''} ${selectedIndices.has(idx) ? 'ring-4 ring-white/30' : ''} ${COLORS[item.visual].tailwind}`}
                        style={{
                            borderColor: isWrongFlash ? '#b91c1c' : COLORS[item.visual].hex,
                            backgroundColor: isWrongFlash ? '#ef4444' : (selectedIndices.has(idx) ? '#ffffff33' : '#111827')
                        }}
                    >
                        {t(`color.${item.text}`)}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default ColorMatch;
