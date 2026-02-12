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
// 회전 유형을 구분하기 위한 타입입니다.
type Turn = 'left' | 'right' | 'straight' | 'back';

const BASE_SIZE = 8;
const MOVE_SCORE = 15;
const GOAL_SCORE = 100;
const WALL_PENALTY = -50;

const coordKey = (r: number, c: number) => `${r},${c}`;

// 방향에 따른 이동 벡터를 정의합니다.
const directionDelta: Record<Direction, Coord> = {
    up: { r: -1, c: 0 },
    down: { r: 1, c: 0 },
    left: { r: 0, c: -1 },
    right: { r: 0, c: 1 }
};

// 이전 방향 대비 회전 방향을 계산합니다.
const getTurn = (prev: Direction, next: Direction): Turn => {
    if (prev === next) return 'straight';
    if (prev === 'up') return next === 'left' ? 'left' : next === 'right' ? 'right' : 'back';
    if (prev === 'down') return next === 'right' ? 'left' : next === 'left' ? 'right' : 'back';
    if (prev === 'left') return next === 'down' ? 'left' : next === 'up' ? 'right' : 'back';
    return next === 'up' ? 'left' : next === 'down' ? 'right' : 'back';
};

// 후보 칸이 기존 경로와 얼마나 인접하는지 계산합니다.
const countAdjacentPath = (r: number, c: number, path: Set<string>) => {
    let count = 0;
    const neighbors: Coord[] = [
        { r: r - 1, c },
        { r: r + 1, c },
        { r, c: c - 1 },
        { r, c: c + 1 }
    ];
    neighbors.forEach(neighbor => {
        if (path.has(coordKey(neighbor.r, neighbor.c))) {
            count += 1;
        }
    });
    return count;
};

const buildBoard = (rows: number, cols: number, seed: string, level: number) => {
    // 시드 기반 난수를 생성합니다.
    const rng = new SeededRandom(`${seed}-blind-path-${rows}x${cols}-${level}`);
    // 최종 경로 셋을 준비합니다.
    const path = new Set<string>();

    // 전체 격자 크기를 계산합니다.
    const maxCells = rows * cols;
    // 기본 경로 길이를 설정합니다.
    const baseLength = Math.max(6, rows + cols - 2);
    // 레벨에 따라 경로 길이를 추가로 늘립니다.
    const extraLength = Math.min(maxCells - baseLength, Math.floor(level * 1.5));
    // 최종 목표 경로 길이를 결정합니다.
    const targetLength = Math.min(maxCells, baseLength + extraLength);
    // 여러 번 시도해 최대 길이를 확보합니다.
    const maxAttempts = 18;
    // 최적 경로 좌표를 보관합니다.
    let bestCoords: Coord[] = [];
    // 최적 시작 좌표를 보관합니다.
    let bestStart: Coord = { r: 0, c: 0 };
    // 최적 종료 좌표를 보관합니다.
    let bestGoal: Coord = { r: 0, c: 0 };

    // 가장자리 점수를 계산합니다 (중앙이 높음, 가장자리가 낮음).
    const getEdgeScore = (r: number, c: number): number => {
        const centerR = (rows - 1) / 2;
        const centerC = (cols - 1) / 2;
        const distR = Math.abs(r - centerR) / centerR;
        const distC = Math.abs(c - centerC) / centerC;
        // 중앙에 가까울수록 점수가 높음 (0~1 범위, 1이 중앙)
        return 1 - (distR + distC) / 2;
    };

    // 하나의 경로 생성 시도를 수행합니다.
    const attemptBuild = () => {
        // 시도별 경로 집합을 생성합니다.
        const localPath = new Set<string>();
        // 시도별 경로 좌표를 기록합니다.
        const coords: Coord[] = [];
        // 시작 지점을 중앙 근처에서 선택합니다.
        const marginR = Math.floor(rows * 0.25);
        const marginC = Math.floor(cols * 0.25);
        const start: Coord = {
            r: rng.nextInt(marginR, rows - marginR),
            c: rng.nextInt(marginC, cols - marginC)
        };
        // 시작 지점을 경로에 추가합니다.
        localPath.add(coordKey(start.r, start.c));
        coords.push(start);

        // 현재 위치를 추적합니다.
        let current = start;
        // 직전 이동 방향을 추적합니다.
        let prevDir: Direction | null = null;
        // 직전 회전 방향을 추적합니다.
        let lastTurn: Turn | null = null;
        // 연속 직진 횟수를 추적합니다.
        let straightCount = 0;
        // 강제 회전까지 남은 직진 횟수 (2~3 사이 랜덤).
        let maxStraight = rng.nextInt(2, 4);

        // 목표 길이만큼 경로를 확장합니다.
        for (let step = 1; step < targetLength; step += 1) {
            // 가능한 이동 방향 후보를 생성합니다.
            const candidates = (['up', 'down', 'left', 'right'] as Direction[])
                .map(dir => ({ dir, delta: directionDelta[dir] }))
                .map(({ dir, delta }) => ({
                    dir,
                    next: { r: current.r + delta.r, c: current.c + delta.c }
                }))
                .filter(({ next }) => next.r >= 0 && next.r < rows && next.c >= 0 && next.c < cols)
                .filter(({ next }) => !localPath.has(coordKey(next.r, next.c)));

            if (candidates.length === 0) break;

            // 연속 직진이 최대치에 도달하면 회전을 강제합니다.
            const mustTurn = straightCount >= maxStraight && prevDir !== null;

            // 회전 방향 반복을 피한 후보를 선별합니다.
            let turnFiltered = candidates.filter(({ dir }) => {
                if (!prevDir) return true;
                const turn = getTurn(prevDir, dir);
                if (turn === 'back') return false;
                // 강제 회전 시 직진 제외
                if (mustTurn && turn === 'straight') return false;
                if (turn === 'left' || turn === 'right') {
                    return lastTurn !== turn;
                }
                return true;
            });

            // 강제 회전인데 후보가 없으면 뒤로가기만 제외하고 다시 시도
            if (mustTurn && turnFiltered.length === 0) {
                turnFiltered = candidates.filter(({ dir }) => {
                    if (!prevDir) return true;
                    return getTurn(prevDir, dir) !== 'back';
                });
            }

            // 회전 규칙으로 후보가 없으면 원 후보를 사용합니다.
            const turnCandidates = turnFiltered.length > 0 ? turnFiltered : candidates;

            // 경로가 뭉치지 않도록 인접 칸 수를 기준으로 후보를 추립니다.
            const spacedCandidates = turnCandidates.filter(({ next }) => countAdjacentPath(next.r, next.c, localPath) <= 1);
            const spacedOrTurn = spacedCandidates.length > 0 ? spacedCandidates : turnCandidates;

            // 가장자리 점수로 후보를 정렬하고 상위 후보를 우선 선택합니다.
            const scoredCandidates = spacedOrTurn
                .map(c => ({ ...c, score: getEdgeScore(c.next.r, c.next.c) }))
                .sort((a, b) => b.score - a.score);

            // 상위 50% 후보 중에서 랜덤 선택 (다양성 유지)
            const topCount = Math.max(1, Math.ceil(scoredCandidates.length * 0.5));
            const topCandidates = scoredCandidates.slice(0, topCount);
            const picked = topCandidates[rng.nextInt(0, topCandidates.length)];
            const nextPos = picked.next;

            // 회전 방향 상태 및 직진 카운터를 갱신합니다.
            if (prevDir) {
                const turn = getTurn(prevDir, picked.dir);
                if (turn === 'straight') {
                    straightCount += 1;
                } else {
                    straightCount = 0;
                    maxStraight = rng.nextInt(2, 4); // 다음 강제 회전까지 거리 재설정
                    if (turn === 'left' || turn === 'right') {
                        lastTurn = turn;
                    }
                }
            }
            prevDir = picked.dir;
            current = nextPos;
            localPath.add(coordKey(nextPos.r, nextPos.c));
            coords.push(nextPos);
        }

        return { coords, start };
    };

    // 여러 번 시도해 가장 긴 경로를 선택합니다.
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const result = attemptBuild(); // 시도 결과를 저장합니다.
        if (result.coords.length > bestCoords.length) {
            bestCoords = result.coords;
            bestStart = result.start;
            bestGoal = result.coords[result.coords.length - 1];
        }
        if (bestCoords.length >= targetLength) break;
    }

    // 최종 경로 좌표를 Set으로 변환합니다.
    bestCoords.forEach(coord => {
        path.add(coordKey(coord.r, coord.c));
    });

    return { path, start: bestStart, goal: bestGoal };
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
