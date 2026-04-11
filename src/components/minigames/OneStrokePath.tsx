import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePanelProgress } from '../../hooks/usePanelProgress';
import { SeededRandom } from '../../utils/seededRandom';
import { useSound } from '../../contexts/SoundContext';

interface OneStrokePathProps {
    seed: string | null;
    onScore: (amount: number) => void;
    isPlaying: boolean;
}

type Coord = { r: number; c: number };
type Dir = 'U' | 'D' | 'L' | 'R';
type StrokePalette = {
    fillClass: string;
    lineColor: string;
};
const STROKE_PALETTES: readonly StrokePalette[] = [
    { fillClass: 'bg-emerald-400', lineColor: '#059669' },
    { fillClass: 'bg-cyan-400', lineColor: '#0891b2' },
    { fillClass: 'bg-sky-400', lineColor: '#0369a1' },
    { fillClass: 'bg-violet-400', lineColor: '#7c3aed' },
    { fillClass: 'bg-amber-400', lineColor: '#d97706' },
    { fillClass: 'bg-rose-400', lineColor: '#be123c' }
] as const;

const keyOf = (r: number, c: number) => `${r},${c}`;

const isAdjacent = (a: Coord, b: Coord) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

const getConfig = (panelIndex: number) => {
    // Start smaller and ramp gradually: 4x4 -> 5x5 -> 6x6 -> 7x7 -> 8x8
    if (panelIndex < 4) return { size: 4, pathLength: 8 + panelIndex * 2 }; // 8,10,12,14
    if (panelIndex < 8) return { size: 5, pathLength: 12 + (panelIndex - 4) * 2 }; // 12..18
    if (panelIndex < 12) return { size: 6, pathLength: 16 + (panelIndex - 8) * 2 }; // 16..22
    if (panelIndex < 16) return { size: 7, pathLength: 20 + (panelIndex - 12) * 2 }; // 20..26
    return { size: 8, pathLength: 24 + Math.min(8, panelIndex - 16) * 2 }; // 24..40
};

const getNeighbors = (cell: Coord, size: number): Coord[] => {
    const cand = [
        { r: cell.r - 1, c: cell.c },
        { r: cell.r + 1, c: cell.c },
        { r: cell.r, c: cell.c - 1 },
        { r: cell.r, c: cell.c + 1 }
    ];
    return cand.filter((n) => n.r >= 0 && n.r < size && n.c >= 0 && n.c < size);
};

const getDir = (from: Coord, to: Coord): Dir => {
    if (to.r < from.r) return 'U';
    if (to.r > from.r) return 'D';
    if (to.c < from.c) return 'L';
    return 'R';
};

const isOpposite = (a: Dir, b: Dir) =>
    (a === 'U' && b === 'D')
    || (a === 'D' && b === 'U')
    || (a === 'L' && b === 'R')
    || (a === 'R' && b === 'L');

const shuffleInPlace = <T,>(arr: T[], rng: SeededRandom) => {
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng.next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
};

const evaluatePathEase = (path: Coord[]): number => {
    if (path.length <= 1) return Number.MAX_SAFE_INTEGER;

    let minR = Infinity;
    let minC = Infinity;
    let maxR = -Infinity;
    let maxC = -Infinity;
    for (const p of path) {
        if (p.r < minR) minR = p.r;
        if (p.r > maxR) maxR = p.r;
        if (p.c < minC) minC = p.c;
        if (p.c > maxC) maxC = p.c;
    }

    const bboxArea = (maxR - minR + 1) * (maxC - minC + 1);
    const holesInBbox = Math.max(0, bboxArea - path.length);

    let turns = 0;
    let backtracks = 0;
    let prevDir: Dir | null = null;
    for (let i = 1; i < path.length; i += 1) {
        const dir = getDir(path[i - 1], path[i]);
        if (prevDir && dir !== prevDir) turns += 1;
        if (prevDir && isOpposite(prevDir, dir)) backtracks += 1;
        prevDir = dir;
    }

    // Lower score = easier visual pattern.
    return (holesInBbox * 14) + (backtracks * 6) + (turns * 1.2) + (bboxArea * 0.15);
};

const generateLinearPath = (seed: string, size: number, pathLength: number): Coord[] => {
    const maxRetries = 500;
    const targetSuccesses = 24;
    let bestPath: Coord[] | null = null;
    let bestScore = Number.MAX_SAFE_INTEGER;
    let successCount = 0;

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
        const rng = new SeededRandom(`${seed}-one-stroke-${size}-${pathLength}-${attempt}`);
        const start: Coord = {
            r: Math.floor(rng.next() * size),
            c: Math.floor(rng.next() * size)
        };

        const path: Coord[] = [start];
        const visited = new Set<string>([keyOf(start.r, start.c)]);

        const dfs = (current: Coord, prevDir: Dir | null, straightRun: number): boolean => {
            if (path.length >= pathLength) return true;

            const neighbors = getNeighbors(current, size).filter((n) => !visited.has(keyOf(n.r, n.c)));
            shuffleInPlace(neighbors, rng);

            for (const next of neighbors) {
                const nextDir = getDir(current, next);
                const nextStraightRun = prevDir === nextDir ? straightRun + 1 : 1;

                // Keep path dense: force frequent turns.
                if (nextStraightRun > 2) continue;
                if (nextStraightRun === 2) {
                    // Prefer single-step segments: allow 2-step straight only sometimes.
                    if (rng.next() < 0.45) continue;
                }

                const nk = keyOf(next.r, next.c);
                visited.add(nk);
                path.push(next);

                if (dfs(next, nextDir, nextStraightRun)) return true;

                path.pop();
                visited.delete(nk);
            }
            return false;
        };

        if (dfs(start, null, 0)) {
            successCount += 1;
            const score = evaluatePathEase(path);
            if (score < bestScore) {
                bestScore = score;
                bestPath = [...path];
            }
            if (successCount >= targetSuccesses) break;
        }
    }

    if (bestPath) return bestPath;

    // Guaranteed fallback: deterministic snake path (always valid one-stroke)
    const fallback: Coord[] = [];
    for (let r = 0; r < size; r += 1) {
        if (r % 2 === 0) {
            for (let c = 0; c < size; c += 1) fallback.push({ r, c });
        } else {
            for (let c = size - 1; c >= 0; c -= 1) fallback.push({ r, c });
        }
    }
    return fallback.slice(0, pathLength);
};

const OneStrokePath: React.FC<OneStrokePathProps> = ({ seed, onScore, isPlaying }) => {
    const { playSound } = useSound();
    const [panelIndex, setPanelIndex] = usePanelProgress(seed, 'one_stroke');
    const [trail, setTrail] = useState<Coord[]>([]);
    const [isDrawing, setIsDrawing] = useState(false);
    const [flashState, setFlashState] = useState<'success' | 'fail' | null>(null);
    const lastHoverKeyRef = useRef<string | null>(null);

    const puzzle = useMemo(() => {
        if (!seed) return null;
        const conf = getConfig(panelIndex);
        const path = generateLinearPath(`${seed}-${panelIndex}`, conf.size, conf.pathLength);
        const pathSet = new Set(path.map((p) => keyOf(p.r, p.c)));
        return {
            size: conf.size,
            path,
            pathSet,
            start: path[0]
        };
    }, [seed, panelIndex]);

    const strokePalette = useMemo(() => {
        if (!seed) return STROKE_PALETTES[0];
        const rng = new SeededRandom(`${seed}_one_stroke_color_${panelIndex}`);
        return STROKE_PALETTES[Math.floor(rng.next() * STROKE_PALETTES.length)];
    }, [seed, panelIndex]);

    const resetCurrentTry = () => {
        setTrail([]);
        setIsDrawing(false);
        lastHoverKeyRef.current = null;
    };

    const failTry = () => {
        onScore(-20);
        playSound('error');
        setFlashState('fail');
        setTimeout(() => setFlashState(null), 180);
        resetCurrentTry();
    };

    const completePanel = () => {
        const reward = (60 + panelIndex * 10) * 2;
        onScore(reward);
        playSound('correct');
        setFlashState('success');
        setTimeout(() => {
            setFlashState(null);
            setTrail([]);
            setIsDrawing(false);
            setPanelIndex((prev) => prev + 1);
        }, 150);
    };

    const handleEnterCell = (r: number, c: number) => {
        if (!isPlaying || !puzzle || !isDrawing) return;

        const next: Coord = { r, c };
        const nextKey = keyOf(r, c);
        const trailSet = new Set(trail.map((p) => keyOf(p.r, p.c)));
        const last = trail[trail.length - 1];
        if (!last) return;

        if (!puzzle.pathSet.has(nextKey)) {
            failTry();
            return;
        }
        if (!isAdjacent(last, next)) {
            failTry();
            return;
        }
        if (trailSet.has(nextKey)) {
            failTry();
            return;
        }

        const nextTrail = [...trail, next];

        setTrail(nextTrail);
        playSound('tick');

        if (nextTrail.length === puzzle.path.length) {
            completePanel();
        }
    };

    const handlePointerDownCell = (r: number, c: number) => {
        if (!isPlaying || !puzzle) return;

        if (r === puzzle.start.r && c === puzzle.start.c) {
            setTrail([{ r, c }]);
            setIsDrawing(true);
            lastHoverKeyRef.current = keyOf(r, c);
            playSound('click');
            return;
        }

        failTry();
    };

    const handleReleaseDrawing = () => {
        if (!isDrawing || !puzzle) return;

        // Lifting finger before completion is an immediate fail.
        const isCompleted = trail.length >= puzzle.path.length;
        if (!isCompleted) {
            failTry();
            return;
        }

        setIsDrawing(false);
        lastHoverKeyRef.current = null;
    };

    useEffect(() => {
        const stopDrawing = () => {
            if (!isDrawing) return;
            handleReleaseDrawing();
        };
        window.addEventListener('pointerup', stopDrawing);
        window.addEventListener('pointercancel', stopDrawing);
        return () => {
            window.removeEventListener('pointerup', stopDrawing);
            window.removeEventListener('pointercancel', stopDrawing);
        };
    }, [isDrawing, trail, puzzle]);

    if (!puzzle) return null;

    const boardStyle: React.CSSProperties = {
        gridTemplateColumns: `repeat(${puzzle.size}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${puzzle.size}, minmax(0, 1fr))`
    };
    const boardMax =
        puzzle.size <= 4 ? 'max-w-[300px]'
            : puzzle.size === 5 ? 'max-w-[330px]'
                : puzzle.size === 6 ? 'max-w-[360px]'
                    : puzzle.size === 7 ? 'max-w-[400px]'
                        : 'max-w-[430px]';
    const trailSet = new Set(trail.map((p) => keyOf(p.r, p.c)));
    const trailPolylinePoints = useMemo(() => {
        if (trail.length < 2) return '';
        const unit = 100 / puzzle.size;
        return trail
            .map((p) => {
                const x = (p.c + 0.5) * unit;
                const y = (p.r + 0.5) * unit;
                return `${x},${y}`;
            })
            .join(' ');
    }, [trail, puzzle.size]);

    const getCellFromPointer = (
        clientX: number,
        clientY: number,
        element: HTMLDivElement
    ): Coord | null => {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;

        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const col = Math.floor((x / rect.width) * puzzle.size);
        const row = Math.floor((y / rect.height) * puzzle.size);
        if (row < 0 || row >= puzzle.size || col < 0 || col >= puzzle.size) return null;
        return { r: row, c: col };
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4 px-4 select-none">
            <div
                className={`w-[92vw] ${boardMax} aspect-square rounded-2xl border p-2
                    ${flashState === 'success' ? 'border-emerald-400 bg-emerald-200/20' : ''}
                    ${flashState === 'fail' ? 'border-rose-400 bg-rose-200/20' : ''}
                    ${flashState === null ? 'border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-900/45' : ''}`}
            >
                <div
                    className="relative grid w-full h-full gap-[3px] touch-none"
                    style={boardStyle}
                    onPointerDown={(e) => {
                        if (!isPlaying) return;
                        e.preventDefault();
                        const cell = getCellFromPointer(e.clientX, e.clientY, e.currentTarget);
                        if (!cell) return;
                        handlePointerDownCell(cell.r, cell.c);
                        try {
                            e.currentTarget.setPointerCapture(e.pointerId);
                        } catch {
                            // Ignore if pointer capture is not available.
                        }
                    }}
                    onPointerMove={(e) => {
                        if (!isDrawing || !isPlaying) return;
                        const cell = getCellFromPointer(e.clientX, e.clientY, e.currentTarget);
                        if (!cell) return;
                        const nextKey = keyOf(cell.r, cell.c);
                        if (lastHoverKeyRef.current === nextKey) return;
                        lastHoverKeyRef.current = nextKey;
                        handleEnterCell(cell.r, cell.c);
                    }}
                    onPointerUp={() => {
                        handleReleaseDrawing();
                    }}
                    onPointerCancel={() => {
                        handleReleaseDrawing();
                    }}
                >
                    {trail.length > 1 && (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" viewBox="0 0 100 100" preserveAspectRatio="none">
                            <polyline
                                points={trailPolylinePoints}
                                fill="none"
                                stroke={strokePalette.lineColor}
                                strokeWidth={2.6}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    )}
                    {Array.from({ length: puzzle.size }).map((_, r) =>
                        Array.from({ length: puzzle.size }).map((_, c) => {
                            const k = keyOf(r, c);
                            const isPath = puzzle.pathSet.has(k);
                            const isVisited = trailSet.has(k);
                            const isStart = r === puzzle.start.r && c === puzzle.start.c;

                            let cellClass = 'bg-slate-300/70 dark:bg-slate-700/70';
                            if (isPath) cellClass = 'bg-white dark:bg-white/90';
                            if (isVisited) cellClass = strokePalette.fillClass;
                            if (isStart && !isVisited) cellClass = strokePalette.fillClass;

                            return (
                                <div
                                    key={k}
                                    className={`rounded-[6px] ${cellClass} border border-black/5 dark:border-white/5`}
                                />
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

export default OneStrokePath;
