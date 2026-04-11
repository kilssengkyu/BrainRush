import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { usePanelProgress } from '../../hooks/usePanelProgress';
import { useSound } from '../../contexts/SoundContext';
import { SeededRandom } from '../../utils/seededRandom';

interface InfiniteAdditionProps {
    seed: string | null;
    onScore: (amount: number) => void;
    isPlaying: boolean;
}

const TILE_COUNT = 9;
const WRONG_COOLDOWN_MS = 400;

const createTile = (rng: SeededRandom) => Math.floor(rng.next() * 9) + 1;

const createTiles = (rng: SeededRandom) => (
    Array.from({ length: TILE_COUNT }, () => createTile(rng))
);

const getReachableSums = (tiles: number[]) => {
    const sums = new Set<number>([0]);

    tiles.forEach((tile) => {
        Array.from(sums).forEach((sum) => {
            sums.add(sum + tile);
        });
    });

    sums.delete(0);
    return Array.from(sums).sort((a, b) => a - b);
};

const canMakeValue = (target: number, tiles: number[]) => (
    target > 0 && getReachableSums(tiles).includes(target)
);

const canMakeWithOneTile = (target: number, tiles: number[]) => (
    target > 0 && tiles.includes(target)
);

const canReachTarget = (target: number, tiles: number[], clearCount: number) => (
    clearCount < 10 ? canMakeWithOneTile(target, tiles) : canMakeValue(target, tiles)
);

const getTargetIncrement = (rng: SeededRandom, tiles: number[], clearCount: number) => {
    const minTile = Math.min(...tiles);
    if (clearCount < 10) {
        return tiles[Math.floor(rng.next() * tiles.length)] ?? minTile;
    }

    const reachableSums = getReachableSums(tiles);
    const preferred = reachableSums.filter((sum) => sum >= minTile && sum <= 24 && (sum > 9 || rng.next() > 0.35));
    const candidates = preferred.length > 0 ? preferred : reachableSums;
    return candidates[Math.floor(rng.next() * candidates.length)] ?? minTile;
};

const getScoreValue = (clearCount: number) => Math.min(260, 100 + (Math.min(clearCount, 20) * 8));

const InfiniteAddition: React.FC<InfiniteAdditionProps> = ({ seed, onScore, isPlaying }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [clearCount, setClearCount] = usePanelProgress(seed);
    const rngRef = useRef<SeededRandom | null>(null);
    const [tiles, setTiles] = useState<number[]>([]);
    const [currentValue, setCurrentValue] = useState(0);
    const [targetValue, setTargetValue] = useState(0);
    const [isInputLocked, setIsInputLocked] = useState(false);
    const [wrongTileIndex, setWrongTileIndex] = useState<number | null>(null);
    const [successPulse, setSuccessPulse] = useState(false);
    const [targetPulseKey, setTargetPulseKey] = useState(0);

    useEffect(() => {
        if (!seed) return;

        const rng = new SeededRandom(`${seed}_infinite_add`);
        const initialTiles = createTiles(rng);
        rngRef.current = rng;
        setTiles(initialTiles);
        setCurrentValue(0);
        setTargetValue(getTargetIncrement(rng, initialTiles, 0));
        setIsInputLocked(false);
        setWrongTileIndex(null);
        setSuccessPulse(false);
        setTargetPulseKey(0);
    }, [seed]);

    const replaceTile = (index: number, sourceTiles: number[], remainingTarget: number | null = null, nextClearCount = clearCount) => {
        const rng = rngRef.current;
        if (!rng) return sourceTiles;

        for (let attempt = 0; attempt < 20; attempt += 1) {
            const candidate = sourceTiles.map((value, tileIndex) => (
                tileIndex === index ? createTile(rng) : value
            ));

            if (remainingTarget === null || canReachTarget(remainingTarget, candidate, nextClearCount)) {
                return candidate;
            }
        }

        return sourceTiles.map((value, tileIndex) => (
            tileIndex === index ? Math.min(9, Math.max(1, remainingTarget || createTile(rng))) : value
        ));
    };

    const handleTilePress = (index: number) => {
        const rng = rngRef.current;
        if (!rng || !isPlaying || isInputLocked || tiles.length !== TILE_COUNT) return;

        const addedValue = tiles[index];
        const nextCurrentValue = currentValue + addedValue;
        const nextRemainingTarget = targetValue - nextCurrentValue;
        const nextTiles = replaceTile(index, tiles, nextRemainingTarget > 0 ? nextRemainingTarget : null);

        setTiles(nextTiles);
        setCurrentValue(nextCurrentValue);

        if (nextCurrentValue === targetValue) {
            setSuccessPulse(true);
            onScore(getScoreValue(clearCount));
            playSound('correct');
            const nextClearCount = clearCount + 1;
            setClearCount(nextClearCount);
            setTargetValue(nextCurrentValue + getTargetIncrement(rng, nextTiles, nextClearCount));
            setTargetPulseKey((prev) => prev + 1);
            window.setTimeout(() => setSuccessPulse(false), 180);
            return;
        }

        if (nextCurrentValue > targetValue) {
            setIsInputLocked(true);
            setWrongTileIndex(index);
            onScore(-Math.floor(getScoreValue(clearCount) * 0.65));
            playSound('error');
            setTargetValue(nextCurrentValue + getTargetIncrement(rng, nextTiles, clearCount));
            setTargetPulseKey((prev) => prev + 1);
            window.setTimeout(() => {
                setWrongTileIndex(null);
                setIsInputLocked(false);
            }, WRONG_COOLDOWN_MS);
            return;
        }

        if (!canReachTarget(targetValue - nextCurrentValue, nextTiles, clearCount)) {
            setTargetValue(nextCurrentValue + getTargetIncrement(rng, nextTiles, clearCount));
            setTargetPulseKey((prev) => prev + 1);
        }
    };

    if (!seed || tiles.length !== TILE_COUNT) {
        return <div className="text-slate-900 dark:text-white">{t('common.loading')}</div>;
    }

    return (
        <div className="relative flex h-full w-full flex-col items-center justify-center gap-5 overflow-hidden">
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_15%,rgba(251,191,36,0.18),transparent_35%),radial-gradient(circle_at_18%_82%,rgba(34,197,94,0.16),transparent_30%)]" />

            <div className="flex w-full max-w-md items-end justify-center gap-4">
                <div className="rounded-2xl border border-white/15 bg-white/75 px-4 py-3 text-left shadow-lg dark:bg-slate-900/80">
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                        {t('infiniteAdd.total', 'Total')}
                    </div>
                    <div className="text-4xl font-black tabular-nums text-slate-900 dark:text-white">
                        {currentValue}
                    </div>
                </div>

                <motion.div
                    key={targetPulseKey}
                    initial={{ y: -8, scale: 0.92 }}
                    animate={{ y: 0, scale: 1 }}
                    className="rounded-3xl border border-amber-300/50 bg-amber-300/20 px-5 py-4 text-center shadow-xl"
                >
                    <div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-600 dark:text-amber-200">
                        {t('infiniteAdd.target', 'Target')}
                    </div>
                    <div className="text-5xl font-black tabular-nums text-amber-500 dark:text-amber-200">
                        {targetValue}
                    </div>
                </motion.div>
            </div>

            <motion.div
                animate={successPulse ? { scale: [1, 1.03, 1], boxShadow: '0 0 28px rgba(34,197,94,0.38)' } : {}}
                className="grid w-full max-w-md grid-cols-3 gap-3 rounded-[2rem] border border-white/10 bg-slate-950/10 p-3 shadow-2xl backdrop-blur-sm dark:bg-black/30"
            >
                {tiles.map((value, index) => (
                    <motion.button
                        key={index}
                        disabled={isInputLocked || !isPlaying}
                        onPointerDown={(event) => {
                            event.preventDefault();
                            if (event.currentTarget.setPointerCapture) {
                                try {
                                    event.currentTarget.setPointerCapture(event.pointerId);
                                } catch {
                                    // Pointer capture can fail on unsupported event sources.
                                }
                            }
                            handleTilePress(index);
                        }}
                        animate={
                            wrongTileIndex === index
                                ? { x: [-5, 5, -5, 5, 0], backgroundColor: '#ef4444' }
                                : {}
                        }
                        whileTap={{ scale: 0.94 }}
                        className="flex aspect-square items-center justify-center rounded-2xl border-b-4 border-emerald-800/30 bg-white text-5xl font-black tabular-nums text-slate-900 shadow-lg transition-all hover:bg-emerald-50 active:translate-y-1 active:border-b-0 disabled:cursor-not-allowed dark:border-black dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
                    >
                        {value}
                    </motion.button>
                ))}
            </motion.div>
        </div>
    );
};

export default InfiniteAddition;
