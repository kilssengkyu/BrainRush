import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { useSound } from '../../contexts/SoundContext';
import { SeededRandom } from '../../utils/seededRandom';

interface BlindPathRunnerProps {
    seed: string | null;
    onScore: (amount: number) => void;
    isPlaying: boolean;
}

type Direction = 'up' | 'down' | 'left' | 'right';
type Coord = { r: number; c: number };

const BASE_SIZE = 8;
const MOVE_SCORE = 15;
const GOAL_SCORE = 100;
const WALL_PENALTY = -50;

const coordKey = (r: number, c: number) => `${r},${c}`;

const buildBoard = (rows: number, cols: number, seed: string, level: number) => {
    const rng = new SeededRandom(`${seed}-blind-path-${rows}x${cols}-${level}`);
    const path = new Set<string>();

    let row = rng.nextInt(0, rows);
    const start: Coord = { r: row, c: 0 };
    path.add(coordKey(row, 0));

    for (let col = 0; col < cols - 1; col += 1) {
        const roll = rng.next();
        let delta = 0;
        if (roll < 0.33) delta = -1;
        else if (roll > 0.66) delta = 1;

        const nextRow = Math.max(0, Math.min(rows - 1, row + delta));
        const step = nextRow > row ? 1 : -1;
        while (row !== nextRow) {
            row += step;
            path.add(coordKey(row, col));
        }

        path.add(coordKey(row, col + 1));
    }

    const goal: Coord = { r: row, c: cols - 1 };
    return { path, start, goal };
};

const BlindPathRunner: React.FC<BlindPathRunnerProps> = ({ seed, onScore, isPlaying }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [rows, setRows] = useState(BASE_SIZE);
    const [cols, setCols] = useState(BASE_SIZE);
    const [level, setLevel] = useState(0);
    const [expandWidthNext, setExpandWidthNext] = useState(true);
    const [pathSet, setPathSet] = useState<Set<string>>(new Set());
    const [goal, setGoal] = useState<Coord>({ r: 0, c: 0 });
    const [player, setPlayer] = useState<Coord>({ r: 0, c: 0 });
    const [visited, setVisited] = useState<Set<string>>(new Set());
    const [showPath, setShowPath] = useState(true);
    const [errorFlash, setErrorFlash] = useState(false);
    const errorTimerRef = useRef<number | null>(null);

    const resetBoard = useCallback((nextRows: number, nextCols: number, nextLevel: number) => {
        if (!seed) return;
        const { path, start: newStart, goal: newGoal } = buildBoard(nextRows, nextCols, seed, nextLevel);
        setRows(nextRows);
        setCols(nextCols);
        setLevel(nextLevel);
        setGoal(newGoal);
        setPlayer(newStart);
        setPathSet(path);
        setVisited(new Set([coordKey(newStart.r, newStart.c)]));
        setShowPath(true);
    }, [seed]);

    useEffect(() => {
        if (!seed) return;
        setExpandWidthNext(true);
        resetBoard(BASE_SIZE, BASE_SIZE, 0);
    }, [seed, resetBoard]);

    useEffect(() => {
        return () => {
            if (errorTimerRef.current !== null) {
                window.clearTimeout(errorTimerRef.current);
            }
        };
    }, []);

    const triggerErrorFlash = () => {
        setErrorFlash(true);
        if (errorTimerRef.current !== null) {
            window.clearTimeout(errorTimerRef.current);
        }
        errorTimerRef.current = window.setTimeout(() => {
            setErrorFlash(false);
        }, 180);
    };

    const applyMove = useCallback((dir: Direction) => {
        if (!isPlaying) return;
        if (showPath) {
            setShowPath(false);
        }
        const next: Coord = { r: player.r, c: player.c };
        if (dir === 'up') next.r -= 1;
        if (dir === 'down') next.r += 1;
        if (dir === 'left') next.c -= 1;
        if (dir === 'right') next.c += 1;

        const inBounds = next.r >= 0 && next.r < rows && next.c >= 0 && next.c < cols;
        const key = coordKey(next.r, next.c);
        const isPath = inBounds && pathSet.has(key);

        if (isPath) {
            setPlayer(next);
            if (!visited.has(key)) {
                onScore(MOVE_SCORE);
            }
            playSound('tick');
            setVisited(prev => {
                if (prev.has(key)) {
                    return prev;
                }
                const nextVisited = new Set(prev);
                nextVisited.add(key);
                return nextVisited;
            });
            if (next.r === goal.r && next.c === goal.c) {
                onScore(GOAL_SCORE);
                playSound('correct');
                const nextLevel = level + 1;
                const nextRows = expandWidthNext ? rows : rows + 1;
                const nextCols = expandWidthNext ? cols + 1 : cols;
                setExpandWidthNext(prev => !prev);
                resetBoard(nextRows, nextCols, nextLevel);
            }
        } else {
            onScore(WALL_PENALTY);
            playSound('error');
            triggerErrorFlash();
            setShowPath(true);
        }
    }, [expandWidthNext, goal, isPlaying, level, onScore, pathSet, playSound, player, resetBoard, rows, cols, visited, showPath]);

    const boardStyle = useMemo(() => ({
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`
    }), [cols, rows]);

    const renderDirectionIcon = (dir: Direction) => {
        const props = { size: 22, strokeWidth: 2.5 };
        if (dir === 'up') return <ArrowUp {...props} />;
        if (dir === 'down') return <ArrowDown {...props} />;
        if (dir === 'left') return <ArrowLeft {...props} />;
        return <ArrowRight {...props} />;
    };

    const containerStyle: React.CSSProperties = {
        aspectRatio: `${cols} / ${rows}`
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center px-4 select-none">
            <div className="text-center mb-3">
                <h2 className="text-3xl font-black text-white drop-shadow-md">{t('blindPath.title')}</h2>
                <p className="text-xs text-gray-400 mt-1">{t('blindPath.instruction')}</p>
            </div>

            <div
                className={`w-[92vw] max-w-[360px] rounded-2xl border border-white/10 bg-gray-800/40 p-2 shadow-2xl transition-colors ${errorFlash ? 'ring-4 ring-red-500/70' : ''}`}
                style={containerStyle}
            >
                <div className="grid w-full h-full gap-[2px]" style={boardStyle}>
                    {Array.from({ length: rows }).map((_, r) =>
                        Array.from({ length: cols }).map((_, c) => {
                            const key = coordKey(r, c);
                            const isPlayer = r === player.r && c === player.c;
                            const isGoal = r === goal.r && c === goal.c;
                            const isPath = pathSet.has(key);

                            let cellClass = 'bg-gray-800/80';
                            if (showPath && isPath) cellClass = 'bg-white/90';
                            if (isGoal) cellClass = 'bg-blue-500';
                            if (isPlayer) cellClass = 'bg-emerald-500';

                            return (
                                <div
                                    key={key}
                                    className={`rounded-[4px] ${cellClass}`}
                                />
                            );
                        })
                    )}
                </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
                <div />
                <button
                    onClick={() => applyMove('up')}
                    className="w-14 h-14 rounded-xl bg-gray-800/70 border border-white/10 text-white flex items-center justify-center active:scale-95 transition-transform"
                >
                    {renderDirectionIcon('up')}
                </button>
                <div />

                <button
                    onClick={() => applyMove('left')}
                    className="w-14 h-14 rounded-xl bg-gray-800/70 border border-white/10 text-white flex items-center justify-center active:scale-95 transition-transform"
                >
                    {renderDirectionIcon('left')}
                </button>
                <button
                    onClick={() => applyMove('down')}
                    className="w-14 h-14 rounded-xl bg-gray-800/70 border border-white/10 text-white flex items-center justify-center active:scale-95 transition-transform"
                >
                    {renderDirectionIcon('down')}
                </button>
                <button
                    onClick={() => applyMove('right')}
                    className="w-14 h-14 rounded-xl bg-gray-800/70 border border-white/10 text-white flex items-center justify-center active:scale-95 transition-transform"
                >
                    {renderDirectionIcon('right')}
                </button>
            </div>
        </div>
    );
};

export default BlindPathRunner;
