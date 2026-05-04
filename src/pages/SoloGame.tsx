import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, Sparkles, Trophy, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import RockPaperScissors from '../components/minigames/RockPaperScissors';
import NumberSortGame from '../components/minigames/NumberSortGame';
import MathChallenge from '../components/minigames/MathChallenge';
import MathOXGame from '../components/minigames/MathOXGame';
import InfiniteAddition from '../components/minigames/InfiniteAddition';
import OneStrokePath from '../components/minigames/OneStrokePath';
import MakeTen from '../components/minigames/MakeTen';
import MakeZero from '../components/minigames/MakeZero';
import ColorMatch from '../components/minigames/ColorMatch';
import MemoryMatch from '../components/minigames/MemoryMatch';
import SequenceGame from '../components/minigames/SequenceGame';
import FindLargest from '../components/minigames/FindLargest';
import FindPair from '../components/minigames/FindPair';
import NumberUpDown from '../components/minigames/NumberUpDown';
import NumberSlider from '../components/minigames/NumberSlider';
import ArrowSlider from '../components/minigames/ArrowSlider';
import FillBlanks from '../components/minigames/FillBlanks';
import FindOperator from '../components/minigames/FindOperator';
import LadderGame from '../components/minigames/LadderGame';
import TapTheColor from '../components/minigames/TapTheColor';
import AimingGame from '../components/minigames/AimingGame';
import FindMostColor from '../components/minigames/FindMostColor';
import SortingGame from '../components/minigames/SortingGame';
import FindTheSpy from '../components/minigames/FindTheSpy';
import PathRunner from '../components/minigames/PathRunner';
import BallCounter from '../components/minigames/BallCounter';
import BlindPathRunner from '../components/minigames/BlindPathRunner';
import CatchColor from '../components/minigames/CatchColor';
import ColorTiming from '../components/minigames/ColorTiming';
import StairwayGame from '../components/minigames/StairwayGame';
import { AnimatedScore } from '../components/ui/AnimatedScore';
import ScoreProgressBar from '../components/ui/ScoreProgressBar';
import Flag from '../components/ui/Flag';
import { useAuth } from '../contexts/AuthContext';
import { useSound } from '../contexts/SoundContext';
import { useUI } from '../contexts/UIContext';
import { PRACTICE_GAMES } from '../content/practiceGames';
import { supabase } from '../lib/supabaseClient';
import { clearGameProgress } from '../hooks/usePanelProgress';
import AdModal from '../components/ui/AdModal';
import { logAnalyticsEvent } from '../lib/analytics';

type SoloPhase = 'loading' | 'intro' | 'playing' | 'roundResult' | 'final';

type SoloRound = {
    gameType: string;
    titleKey: string;
    seed: string;
    score: number;
    durationMs: number;
    scoreTimeline?: [number, number][];
};

type SoloPercentileMap = Record<string, number | null>;

const SOLO_ROUND_COUNT = 3;
const DEFAULT_ROUND_DURATION_MS = 30000;
const AUTO_ADVANCE_MS = 5000;

const GUIDE_INSTRUCTION_KEY_BY_GAME: Record<string, string> = {
    RPS: 'rps.instruction',
    NUMBER: 'number.instruction',
    NUMBER_DESC: 'number.instructionDesc',
    MATH: 'math.instruction',
    MATH_OX: 'mathOx.instruction',
    INFINITE_ADD: 'infiniteAdd.instruction',
    ONE_STROKE: 'oneStroke.instruction',
    TEN: 'ten.instruction',
    COLOR: 'color.instruction',
    MEMORY: 'memory.instruction',
    SEQUENCE: 'sequence.instruction',
    SEQUENCE_NORMAL: 'sequence.instructionNormal',
    LARGEST: 'largest.instruction',
    PAIR: 'pair.instruction',
    UPDOWN: 'updown.instruction',
    SLIDER: 'slider.instruction',
    ARROW: 'arrow.instruction',
    BLANK: 'fillBlanks.instruction',
    OPERATOR: 'findOperator.instruction',
    LADDER: 'ladder.instruction',
    PATH: 'path.instruction',
    BLIND_PATH: 'blindPath.instruction',
    BALLS: 'balls.instruction',
    CATCH_COLOR: 'catchColor.instruction',
    TAP_COLOR: 'tapTheColor.memorize',
    AIM: 'aim.instruction',
    MOST_COLOR: 'mostColor.instruction',
    SORTING: 'sorting.instruction',
    SPY: 'spy.instruction',
    COLOR_TIMING: 'colorTiming.instruction',
    STAIRWAY: 'stairway.instruction',
    MAKE_ZERO: 'zero.instruction',
};

const createRoundSeed = (gameType: string, roundIndex: number) => {
    const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return `solo_${gameType}_${roundIndex}_${randomPart}`;
};

const shuffleArray = <T,>(items: T[]) => {
    const next = [...items];
    for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
};

const getPracticeGameTitle = (titleKey: string, t: any) => {
    if (titleKey === 'mathOx.title') return t(titleKey, 'Math OX');
    if (titleKey === 'oneStroke.title') return t(titleKey, 'One Stroke');
    return t(titleKey);
};

const getPercentileColor = (percentile: number | null) => {
    if (percentile === null || !Number.isFinite(percentile)) {
        return '#94a3b8';
    }

    if (percentile <= 1) return '#e5cc80';
    if (percentile <= 2) return '#e268a8';
    if (percentile <= 5) return '#ff8000';
    if (percentile <= 15) return '#a335ee';
    if (percentile <= 30) return '#0070ff';
    if (percentile <= 50) return '#1eff00';
    return '#9d9d9d';
};

const getSoloRoundDurationMs = async (gameType: string) => {
    try {
        const { data, error } = await supabase.rpc('get_game_duration', {
            p_game_type: gameType,
        });
        if (error) throw error;

        const durationSeconds = Number(data);
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
            return DEFAULT_ROUND_DURATION_MS;
        }

        return Math.max(1, Math.floor(durationSeconds)) * 1000;
    } catch (error) {
        console.error('Failed to load solo round duration:', gameType, error);
        return DEFAULT_ROUND_DURATION_MS;
    }
};

type AutoAdvanceButtonProps = {
    label: string;
    remainingMs: number;
    onClick: () => void;
    variant?: 'start' | 'next';
};

const AutoAdvanceButton: React.FC<AutoAdvanceButtonProps> = ({
    label,
    remainingMs,
    onClick,
    variant = 'start',
}) => {
    const size = 132;
    const strokeWidth = 8;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.max(0, Math.min(1, remainingMs / AUTO_ADVANCE_MS));
    const dashOffset = circumference * (1 - progress);
    const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
    const colorClass = variant === 'start'
        ? 'bg-amber-400 text-slate-950 shadow-amber-400/30 hover:bg-amber-300'
        : 'bg-white text-slate-950 shadow-white/25 hover:bg-slate-100';
    const ringColor = variant === 'start' ? '#facc15' : '#38bdf8';

    return (
        <button
            type="button"
            onClick={onClick}
            className="relative grid h-[132px] w-[132px] place-items-center rounded-full transition-transform duration-150 hover:scale-105 active:scale-95"
        >
            <svg className="absolute inset-0 -rotate-90" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="rgba(148, 163, 184, 0.25)"
                    strokeWidth={strokeWidth}
                />
                <motion.circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={ringColor}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    animate={{ strokeDashoffset: dashOffset }}
                    transition={{ duration: 0.12, ease: 'linear' }}
                />
            </svg>
            <span className={`relative z-10 flex h-[106px] w-[106px] flex-col items-center justify-center rounded-full text-center font-black shadow-2xl ${colorClass}`}>
                <span className="text-[13px] leading-tight tracking-tight">{label}</span>
                <span className="mt-1 font-mono text-4xl leading-none">{seconds}</span>
            </span>
        </button>
    );
};

const renderSoloMinigame = (
    gameType: string,
    seed: string,
    onScore: (amount: number) => void,
    isPlaying: boolean,
) => {
    switch (gameType) {
        case 'RPS':
            return <RockPaperScissors seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'NUMBER':
            return <NumberSortGame mode="asc" seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'NUMBER_DESC':
            return <NumberSortGame mode="desc" seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'MATH':
            return <MathChallenge seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'MATH_OX':
            return <MathOXGame seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'INFINITE_ADD':
            return <InfiniteAddition seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'ONE_STROKE':
            return <OneStrokePath seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'TEN':
            return <MakeTen seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'COLOR':
            return <ColorMatch seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'MEMORY':
            return <MemoryMatch seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'SEQUENCE':
            return <SequenceGame mode="reverse" seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'SEQUENCE_NORMAL':
            return <SequenceGame mode="forward" seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'LARGEST':
            return <FindLargest seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'PAIR':
            return <FindPair seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'UPDOWN':
            return <NumberUpDown seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'SLIDER':
            return <NumberSlider seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'ARROW':
            return <ArrowSlider seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'BLANK':
            return <FillBlanks seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'OPERATOR':
            return <FindOperator seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'LADDER':
            return <LadderGame seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'TAP_COLOR':
            return <TapTheColor seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'AIM':
            return <AimingGame seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'MOST_COLOR':
            return <FindMostColor seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'SORTING':
            return <SortingGame seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'SPY':
            return <FindTheSpy seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'PATH':
            return <PathRunner seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'BALLS':
            return <BallCounter seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'BLIND_PATH':
            return <BlindPathRunner seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'CATCH_COLOR':
            return <CatchColor seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'COLOR_TIMING':
            return <ColorTiming onScore={onScore} isPlaying={isPlaying} />;
        case 'STAIRWAY':
            return <StairwayGame seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        case 'MAKE_ZERO':
            return <MakeZero seed={seed} onScore={onScore} isPlaying={isPlaying} />;
        default:
            return null;
    }
};

const SoloGame: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { user, profile } = useAuth();
    const { playSound, playBGM, stopBGM } = useSound();
    const { showToast, confirm } = useUI();
    const [phase, setPhase] = useState<SoloPhase>('loading');
    const [enabledPracticeGameIds, setEnabledPracticeGameIds] = useState<Set<string> | null>(null);
    const [catalogLoaded, setCatalogLoaded] = useState(false);
    const [highscores, setHighscores] = useState<Record<string, number>>({});
    const [runStartHighscores, setRunStartHighscores] = useState<Record<string, number>>({});
    const [rounds, setRounds] = useState<SoloRound[]>([]);
    const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
    const [currentScore, setCurrentScore] = useState(0);
    const [remainingMs, setRemainingMs] = useState(DEFAULT_ROUND_DURATION_MS);
    const [autoAdvanceRemainingMs, setAutoAdvanceRemainingMs] = useState(AUTO_ADVANCE_MS);
    const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [soloRunId, setSoloRunId] = useState<string | null>(null);
    const [showPercentileAdModal, setShowPercentileAdModal] = useState(false);
    const [percentilesUnlocked, setPercentilesUnlocked] = useState(false);
    const [percentiles, setPercentiles] = useState<SoloPercentileMap>({});
    const [isReturningToMenu, setIsReturningToMenu] = useState(false);
    const initializedRef = useRef(false);
    const finishLockRef = useRef(false);
    const roundStartLockRef = useRef(false);
    const roundAdvanceLockRef = useRef(false);
    const phaseRef = useRef<SoloPhase>('loading');
    const runStartedAtRef = useRef<string>(new Date().toISOString());
    const scoreTimelineRef = useRef<[number, number][]>([]);
    const roundStartedAtMsRef = useRef<number | null>(null);

    useEffect(() => {
        phaseRef.current = phase;
    }, [phase]);

    const fetchHighscores = useCallback(async (captureRunStart = false) => {
        if (!user) {
            setHighscores({});
            if (captureRunStart) setRunStartHighscores({});
            return;
        }

        try {
            const { data, error } = await supabase
                .from('player_highscores')
                .select('game_type, best_score')
                .eq('user_id', user.id);

            if (error) throw error;

            const mapped = (data || []).reduce<Record<string, number>>((acc, row) => {
                acc[String(row.game_type)] = Number(row.best_score || 0);
                return acc;
            }, {});
            setHighscores(mapped);
            if (captureRunStart) {
                setRunStartHighscores(mapped);
            }
        } catch (error) {
            console.error('Failed to load solo highscores:', error);
            setHighscores({});
            if (captureRunStart) setRunStartHighscores({});
        }
    }, [user]);

    useEffect(() => {
        void fetchHighscores(true);
    }, [fetchHighscores]);

    useEffect(() => {
        let active = true;

        const fetchEnabledPracticeGames = async () => {
            try {
                const { data, error } = await (supabase as any)
                    .from('game_catalog')
                    .select('game_type')
                    .eq('is_enabled', true)
                    .eq('use_in_practice', true);
                if (error) throw error;

                const ids = new Set<string>((data || []).map((row: any) => String(row.game_type)));
                if (active) setEnabledPracticeGameIds(ids);
            } catch (error) {
                console.error('Failed to load solo game catalog:', error);
                if (active) setEnabledPracticeGameIds(new Set());
            } finally {
                if (active) setCatalogLoaded(true);
            }
        };

        void fetchEnabledPracticeGames();
        return () => {
            active = false;
        };
    }, []);

    const availableGames = useMemo(() => {
        if (!catalogLoaded) return [];
        const baseGames = PRACTICE_GAMES.filter((game) => game.id !== 'RANDOM');
        return baseGames.filter((game) => enabledPracticeGameIds?.has(game.id));
    }, [catalogLoaded, enabledPracticeGameIds]);

    useEffect(() => {
        if (!user) {
            navigate('/');
            return;
        }

        if (initializedRef.current || !catalogLoaded) return;

        let active = true;

        const initializeSoloRun = async () => {
            if (availableGames.length === 0) {
                showToast(t('practice.noEnabledGames', '현재 이용 가능한 연습 게임이 없습니다.'), 'info');
                navigate('/');
                return;
            }

            initializedRef.current = true;
            const selectedGames = shuffleArray(availableGames).slice(0, Math.min(SOLO_ROUND_COUNT, availableGames.length));
            const durations = await Promise.all(selectedGames.map((game) => getSoloRoundDurationMs(game.id)));
            if (!active) return;

            runStartedAtRef.current = new Date().toISOString();
            setRounds(selectedGames.map((game, roundIndex) => ({
                gameType: game.id,
                titleKey: game.title,
                seed: createRoundSeed(game.id, roundIndex),
                score: 0,
                durationMs: durations[roundIndex] ?? DEFAULT_ROUND_DURATION_MS,
            })));
            setCurrentRoundIndex(0);
            setCurrentScore(0);
            setRemainingMs(durations[0] ?? DEFAULT_ROUND_DURATION_MS);
            setStartedAtMs(null);
            roundStartLockRef.current = false;
            roundAdvanceLockRef.current = false;
            phaseRef.current = 'intro';
            setPhase('intro');
        };

        void initializeSoloRun();
        return () => {
            active = false;
        };
    }, [availableGames, catalogLoaded, navigate, showToast, t, user]);

    useEffect(() => {
        return () => {
            clearGameProgress();
        };
    }, []);

    const currentRound = rounds[currentRoundIndex] ?? null;

    useEffect(() => {
        if (!currentRound?.gameType || phase === 'final') return;

        if (currentRound.gameType === 'TIMING_BAR') {
            stopBGM();
        } else {
            playBGM('bgm_game');
        }
    }, [currentRound?.gameType, phase, playBGM, stopBGM]);

    const startRound = useCallback(() => {
        if (!currentRound || phaseRef.current !== 'intro' || roundStartLockRef.current) return;
        roundStartLockRef.current = true;
        phaseRef.current = 'playing';
        playSound('click');
        clearGameProgress();
        finishLockRef.current = false;
        scoreTimelineRef.current = [];
        roundStartedAtMsRef.current = Date.now();
        setCurrentScore(0);
        setRemainingMs(currentRound.durationMs);
        setStartedAtMs(roundStartedAtMsRef.current);
        setPhase('playing');
    }, [currentRound, playSound]);

    const finishSoloRun = useCallback(async (finishedRounds: SoloRound[]) => {
        if (!user) return;

        setIsSaving(true);
        try {
            const payload = finishedRounds.map((round) => ({
                game_type: round.gameType,
                score: Math.max(0, Math.floor(round.score)),
                score_timeline: round.scoreTimeline || [],
            }));

            const { data, error } = await (supabase as any).rpc('save_solo_run', {
                p_started_at: runStartedAtRef.current,
                p_rounds: payload,
            });
            if (error) throw error;
            if (data) setSoloRunId(String(data));
            void logAnalyticsEvent('br_solo_end', {
                rounds_played: finishedRounds.length,
                total_score: payload.reduce((sum, round) => sum + round.score, 0),
                game_types: payload.map((round) => round.game_type).join(','),
            });

            await fetchHighscores();
        } catch (error) {
            console.error('Failed to save solo run:', error);
            showToast(t('common.error', '오류가 발생했습니다.'), 'error');
        } finally {
            setIsSaving(false);
        }
    }, [fetchHighscores, showToast, t, user]);

    const fetchPercentiles = useCallback(async (finishedRounds: SoloRound[]): Promise<SoloPercentileMap> => {
        const payload = finishedRounds.map((round) => ({
            game_type: round.gameType,
            score: Math.max(0, Math.floor(round.score)),
        }));

        const { data, error } = await (supabase as any).rpc('get_scores_top_percent', {
            p_scores: payload,
        });

        if (error) {
            console.error('Failed to fetch solo percentiles via RPC:', error);
            return finishedRounds.reduce<SoloPercentileMap>((acc, round) => {
                acc[round.gameType] = null;
                return acc;
            }, {});
        }

        const percentileEntries = Array.isArray(data)
            ? data.map((row: any) => [
                String(row.game_type),
                row.top_percent === null || row.top_percent === undefined
                    ? null
                    : Number(row.top_percent),
            ] as const)
            : [];

        return percentileEntries.reduce<SoloPercentileMap>((acc, [gameType, percentile]) => {
            acc[gameType] = percentile;
            return acc;
        }, finishedRounds.reduce<SoloPercentileMap>((acc, round) => {
            acc[round.gameType] = null;
            return acc;
        }, {}));
    }, []);

    const handleUnlockPercentiles = useCallback(async (): Promise<'ok' | 'limit' | 'error'> => {
        if (isSaving) return 'error';

        try {
            const nextPercentiles = await fetchPercentiles(rounds);
            setPercentiles(nextPercentiles);
            setPercentilesUnlocked(true);
            const percentileValues = Object.values(nextPercentiles).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
            void logAnalyticsEvent('br_solo_percentile_unlock', {
                games_count: rounds.length,
                revealed_count: percentileValues.length,
                best_top_percent: percentileValues.length > 0 ? Math.min(...percentileValues) : null,
            });

            if (soloRunId) {
                const { error } = await (supabase as any).rpc('unlock_solo_run_percentile', {
                    p_run_id: soloRunId,
                });
                if (error) {
                    console.error('Failed to update solo percentile unlock flag:', error);
                }
            }

            return 'ok';
        } catch (error) {
            console.error('Failed to unlock solo percentiles:', error);
            return 'error';
        }
    }, [fetchPercentiles, isSaving, rounds, soloRunId]);

    const finishCurrentRound = useCallback(() => {
        if (!currentRound || finishLockRef.current) return;
        finishLockRef.current = true;

        clearGameProgress();
        const finalizedScore = Math.max(0, Math.floor(currentScore));
        const nextRounds = rounds.map((round, index) => (
            index === currentRoundIndex
                ? { ...round, score: finalizedScore, scoreTimeline: [...scoreTimelineRef.current] }
                : round
        ));

        setRounds(nextRounds);
        setCurrentScore(finalizedScore);
        roundStartedAtMsRef.current = null;
        setStartedAtMs(null);

        if (currentRoundIndex >= nextRounds.length - 1) {
            phaseRef.current = 'final';
            setPhase('final');
            void finishSoloRun(nextRounds);
            return;
        }

        roundStartLockRef.current = false;
        roundAdvanceLockRef.current = false;
        phaseRef.current = 'roundResult';
        setPhase('roundResult');
    }, [currentRound, currentRoundIndex, currentScore, finishSoloRun, rounds]);

    useEffect(() => {
        if (phase !== 'playing' || !startedAtMs || !currentRound) return;

        const timer = window.setInterval(() => {
            const nextRemaining = Math.max(0, currentRound.durationMs - (Date.now() - startedAtMs));
            setRemainingMs(nextRemaining);

            if (nextRemaining <= 0) {
                window.clearInterval(timer);
                finishCurrentRound();
            }
        }, 100);

        return () => {
            window.clearInterval(timer);
        };
    }, [currentRound, finishCurrentRound, phase, startedAtMs]);

    const handleScore = useCallback((amount: number) => {
        if (phaseRef.current !== 'playing') return;
        if (roundStartedAtMsRef.current) {
            const elapsed = Math.round((Date.now() - roundStartedAtMsRef.current) / 10) / 100;
            scoreTimelineRef.current.push([elapsed, amount]);
        }
        setCurrentScore((prev) => Math.max(0, prev + amount));
    }, []);

    const handleNextRound = useCallback(() => {
        if (phaseRef.current !== 'roundResult' || roundAdvanceLockRef.current) return;
        if (currentRoundIndex >= rounds.length - 1) return;

        roundAdvanceLockRef.current = true;
        roundStartLockRef.current = false;
        phaseRef.current = 'intro';
        playSound('click');
        finishLockRef.current = false;
        scoreTimelineRef.current = [];
        roundStartedAtMsRef.current = null;
        const nextRound = rounds[currentRoundIndex + 1];
        setCurrentRoundIndex((prev) => prev + 1);
        setCurrentScore(0);
        setRemainingMs(nextRound?.durationMs ?? DEFAULT_ROUND_DURATION_MS);
        setAutoAdvanceRemainingMs(AUTO_ADVANCE_MS);
        setStartedAtMs(null);
        setPhase('intro');
    }, [currentRoundIndex, playSound, rounds]);

    useEffect(() => {
        if (phase !== 'intro' && phase !== 'roundResult') return;
        if (!currentRound) return;

        const startedAt = Date.now();
        setAutoAdvanceRemainingMs(AUTO_ADVANCE_MS);

        const timer = window.setInterval(() => {
            const nextRemaining = Math.max(0, AUTO_ADVANCE_MS - (Date.now() - startedAt));
            setAutoAdvanceRemainingMs(nextRemaining);

            if (nextRemaining <= 0) {
                window.clearInterval(timer);
                if (phaseRef.current === 'intro') {
                    startRound();
                } else if (phaseRef.current === 'roundResult') {
                    handleNextRound();
                }
            }
        }, 100);

        return () => {
            window.clearInterval(timer);
        };
    }, [currentRound, handleNextRound, phase, startRound]);

    const handleBack = async () => {
        if (isReturningToMenu) return;

        if (phase !== 'final') {
            const shouldExit = await confirm(
                t('solo.exitConfirmTitle', '혼자하기를 종료할까요?'),
                t('solo.exitConfirmMessage', '지금 나가면 이번 혼자하기는 종료되며, 사용한 연필은 반환되지 않습니다.'),
            );
            if (!shouldExit) {
                return;
            }
        }

        playSound('click');
        setIsReturningToMenu(true);

        if (!percentilesUnlocked) {
            try {
                const { AdLogic } = await import('../utils/AdLogic');
                await AdLogic.showInterstitial();
            } catch (error) {
                console.error('Failed to show solo interstitial:', error);
            }
        }

        navigate('/');
    };

    const currentInstruction = currentRound
        ? t(
            GUIDE_INSTRUCTION_KEY_BY_GAME[currentRound.gameType] || 'practice.descriptionPending',
            '게임 규칙을 빠르게 파악하고 점수를 최대한 올려 보세요.',
        )
        : '';
    const isPlaying = phase === 'playing';
    const showWarmupOverlay = phase === 'intro';
    const showRoundFinished = phase === 'roundResult';
    const showFinalResult = phase === 'final';
    const displayMyScore = Math.max(0, Math.floor(currentScore));
    const displayOpScore = 0;
    const maxBackdropScoreDigits = String(displayMyScore).length;
    const backdropScoreSizeClass =
        maxBackdropScoreDigits >= 5
            ? 'text-[clamp(64px,16vw,180px)]'
            : maxBackdropScoreDigits === 4
                ? 'text-[clamp(84px,22vw,260px)]'
                : 'text-[clamp(110px,28vw,340px)]';

    if (!currentRound) {
        return (
            <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
                <div className="text-lg font-semibold">{t('common.loading', '로딩 중...')}</div>
            </div>
        );
    }

    return (
        <div className="relative w-full h-[100dvh] overflow-hidden flex flex-col font-sans select-none pt-[env(safe-area-inset-top)] bg-slate-50 dark:bg-gray-900 text-slate-900 dark:text-white">
            <AdModal
                isOpen={showPercentileAdModal}
                onClose={() => setShowPercentileAdModal(false)}
                onReward={handleUnlockPercentiles}
                variant="solo_percentile"
            />
            {!showFinalResult && (
                <header className="h-24 w-full bg-white dark:bg-gray-800/80 backdrop-blur-md flex items-center justify-between px-4 shadow-lg z-50 relative">
                    <div className="absolute bottom-0 left-0 w-full px-0">
                        <div className="w-full h-1.5 bg-slate-50 dark:bg-gray-900/50 overflow-hidden backdrop-blur-sm">
                            <ScoreProgressBar myScore={displayMyScore} opScore={displayOpScore} />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-1 min-w-0 pt-2">
                        <div className="relative flex-shrink-0">
                            {profile?.avatar_url ? (
                                <img src={profile.avatar_url} className="w-11 h-11 rounded-full border-2 border-blue-500 object-cover" />
                            ) : (
                                <div className="w-11 h-11 rounded-full border-2 border-blue-500 flex items-center justify-center bg-white dark:bg-gray-800 text-blue-500">
                                    <User size={20} />
                                </div>
                            )}
                        </div>
                        <div className="min-w-0">
                            <div className="font-bold text-sm flex items-center gap-1 truncate">
                                <Flag code={profile?.country} />
                                <span className="hidden sm:inline truncate">{profile?.nickname || t('game.unknownPlayer', 'Player')}</span>
                            </div>
                            <AnimatedScore value={displayMyScore} useGrouping={false} className="text-2xl font-black text-blue-400 font-mono" />
                        </div>
                    </div>

                    <div className="flex flex-col items-center flex-shrink-0 px-2 pt-2">
                        <div className="flex flex-col items-center mb-0.5">
                            <div className="text-xs font-bold text-blue-500 dark:text-blue-300 tracking-wider uppercase whitespace-nowrap">
                                {t('game.table.round', 'Round')} {currentRoundIndex + 1}/{rounds.length}
                            </div>
                        </div>
                        <div
                            key={remainingMs <= 10000 ? 'urgent' : 'normal'}
                            className={`text-4xl font-black font-mono tracking-wider ${remainingMs <= 10000 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}
                        >
                            {Math.floor(remainingMs / 1000)}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-gray-400 font-bold uppercase tracking-wider">{t('game.timeLeft', '남은 시간')}</div>
                    </div>

                    <div className="flex items-center justify-end gap-2 flex-1 min-w-0 text-right pt-2 relative">
                        <button
                            onClick={handleBack}
                            disabled={isReturningToMenu}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-black uppercase tracking-[0.2em] text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/15"
                        >
                            <LogOut className="h-3.5 w-3.5" />
                            <span>{isReturningToMenu ? t('common.loading', '로딩 중...') : t('common.exit', '나가기')}</span>
                        </button>
                    </div>
                </header>
            )}

            <main className="flex-1 relative flex items-center justify-center bg-gradient-to-br from-slate-100 via-slate-200 to-slate-300 dark:from-gray-900 dark:via-gray-800 dark:to-black">
                {(isPlaying || showRoundFinished) && (
                    <div className="absolute inset-0 pointer-events-none z-0 select-none overflow-hidden">
                        <div className="absolute inset-0 pointer-events-none opacity-20">
                            <div
                                className="absolute inset-0 bg-blue-500/22"
                            />
                        </div>

                        <div className="absolute inset-0 flex items-start justify-center px-4 sm:px-8 pt-32">
                            <div
                                className={`font-black font-mono tabular-nums tracking-tight leading-none text-center transition-all duration-300 ${backdropScoreSizeClass} text-blue-400 ${showRoundFinished ? 'opacity-90' : 'opacity-10'}`}
                            >
                                <AnimatedScore value={displayMyScore} duration={360} useGrouping={false} />
                            </div>
                        </div>
                    </div>
                )}

                <div className="w-full h-full">
                    <AnimatePresence mode="wait">
                        {showWarmupOverlay && (
                            <motion.div
                                key={`intro_${currentRound.seed}`}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -16 }}
                                className="absolute inset-0 bg-white/95 dark:bg-black/90 z-50 flex flex-col items-center justify-center p-8 text-center backdrop-blur-sm"
                            >
                                <motion.div
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 2, opacity: 0 }}
                                    className="flex flex-col items-center"
                                >
                                    <h2 className="w-full max-w-[94vw] font-black text-amber-500 dark:text-yellow-400 mb-6 drop-shadow-lg flex flex-col items-center">
                                        <span className="text-3xl text-slate-900 dark:text-white mb-2">{t('game.table.round', 'Round')} {currentRoundIndex + 1}</span>
                                        <span className="block w-full text-center whitespace-nowrap text-[clamp(1.4rem,8vw,3.75rem)] leading-none px-3">
                                            {getPracticeGameTitle(currentRound.titleKey, t)}
                                        </span>
                                    </h2>
                                    <p className="text-2xl text-slate-700 dark:text-white/80 mb-12 font-bold max-w-2xl">
                                        {currentInstruction}
                                    </p>
                                </motion.div>
                                <div className="mt-2">
                                    <AutoAdvanceButton
                                        label={t('common.start', '시작')}
                                        remainingMs={autoAdvanceRemainingMs}
                                        onClick={startRound}
                                        variant="start"
                                    />
                                </div>
                            </motion.div>
                        )}

                        {isPlaying && (
                            <motion.div
                                key={`play_${currentRound.seed}`}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.02 }}
                                className="w-full h-full p-4 relative"
                            >
                                <div className="w-full h-full select-none minigame-area">
                                    {renderSoloMinigame(currentRound.gameType, currentRound.seed, handleScore, true)}
                                </div>
                            </motion.div>
                        )}

                        {showRoundFinished && (
                            <motion.div
                                key={`round_result_${currentRound.seed}`}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -16 }}
                                className="absolute inset-0 z-[65]"
                            >
                                <div className="absolute inset-0 bg-black/20" />
                                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center">
                                    <motion.div
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className="text-4xl sm:text-5xl font-black text-slate-900 dark:text-white/80 uppercase tracking-widest font-mono"
                                    >
                                        {t('game.roundFinished', 'ROUND FINISHED')}
                                    </motion.div>
                                </div>
                                <div className="absolute inset-x-0 bottom-12 flex justify-center px-4">
                                    <AutoAdvanceButton
                                        label={t('solo.nextGame', '다음 게임')}
                                        remainingMs={autoAdvanceRemainingMs}
                                        onClick={handleNextRound}
                                        variant="next"
                                    />
                                </div>
                            </motion.div>
                        )}

                        {showFinalResult && (
                            <div className="absolute inset-0 bg-white/90 dark:bg-black/80 backdrop-blur-md z-50 overflow-y-auto">
                                <div className="min-h-full flex flex-col items-center justify-center p-4">
                                    <motion.div
                                        key="solo_final"
                                        initial={{ scale: 0.9, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className="relative p-8 rounded-3xl border-4 shadow-2xl text-center max-w-2xl w-full overflow-hidden bg-white dark:bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_42%),linear-gradient(180deg,_rgba(31,41,55,0.94),_rgba(15,23,42,0.96))] border-green-300 dark:border-white/10"
                                    >
                                        <div className="text-center">
                                            <div className="inline-flex items-center gap-2 rounded-full border border-green-400/20 bg-green-500/10 px-4 py-1 text-xs font-black uppercase tracking-[0.24em] text-green-300 mb-4">
                                                <Trophy className="h-4 w-4" />
                                                {t('solo.complete', '혼자하기 완료')}
                                            </div>
                                            <h2 className="text-5xl font-black mb-4 text-green-600 dark:text-green-400 tracking-wider">
                                                {t('solo.resultTitle', '이번 결과')}
                                            </h2>
                                            <div className="text-lg md:text-xl text-slate-700 dark:text-white mb-6">
                                                <p>
                                                    {isSaving
                                                        ? t('solo.saving', '기록을 저장하는 중입니다...')
                                                        : t('solo.saved', '세 게임 기록을 저장했어요.')}
                                                </p>
                                            </div>

                                            <div className="mb-6 flex flex-col items-center gap-3">
                                                <button
                                                    onClick={() => setShowPercentileAdModal(true)}
                                                    disabled={isSaving || percentilesUnlocked}
                                                    className={`px-5 py-3 rounded-xl font-bold transition-all ${isSaving || percentilesUnlocked
                                                        ? 'bg-slate-300 dark:bg-gray-700 text-slate-500 dark:text-gray-400 cursor-not-allowed'
                                                        : 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-lg hover:shadow-amber-400/30'
                                                        }`}
                                                >
                                                    {percentilesUnlocked
                                                        ? t('solo.percentileUnlocked', '상위 % 공개 완료')
                                                        : isSaving
                                                            ? t('solo.percentileSaving', '기록 저장 후 확인 가능')
                                                            : t('solo.unlockPercentileCta', '광고 보고 상위 % 확인')}
                                                </button>
                                                {!percentilesUnlocked && !isSaving && (
                                                    <p className="text-xs font-semibold text-slate-500 dark:text-gray-400">
                                                        {t('solo.percentileHint', '광고 한 번으로 세 게임의 상위 %를 모두 볼 수 있어요.')}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="w-full bg-slate-50 dark:bg-gray-900/50 rounded-xl overflow-hidden mb-6 border border-white/5">
                                            <div className="grid grid-cols-4 bg-white dark:bg-gray-800 p-3 text-[10px] md:text-xs font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest">
                                                <div className="text-left pl-4">{t('solo.gameLabel', '게임')}</div>
                                                <div>{t('game.table.myScore', '내 점수')}</div>
                                                <div>{t('practice.myHighscoreLabel', '내 하이스코어')}</div>
                                                <div>{t('solo.topPercent', '상위 %')}</div>
                                            </div>
                                            {rounds.map((round, idx) => {
                                                const previousHighscore = runStartHighscores[round.gameType] ?? 0;
                                                const highscore = Math.max(highscores[round.gameType] ?? 0, round.score);
                                                const isNewHighscore = round.score > previousHighscore;
                                                const percentile = percentiles[round.gameType];
                                                const percentileColor = getPercentileColor(percentile ?? null);
                                                return (
                                                    <motion.div
                                                        key={round.seed}
                                                        initial={{ opacity: 0, x: -40 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: 0.2 + idx * 0.12 }}
                                                        className={`grid grid-cols-4 p-3 md:p-4 border-t items-center font-mono relative overflow-hidden ${isNewHighscore
                                                            ? 'border-amber-300/40 bg-amber-300/10 shadow-[inset_0_0_24px_rgba(251,191,36,0.12)]'
                                                            : 'border-white/5'
                                                            }`}
                                                    >
                                                        <div className="absolute inset-0 z-0 opacity-10">
                                                            <div className={`absolute left-0 top-0 h-full ${isNewHighscore ? 'bg-amber-400' : 'bg-blue-500'}`} style={{ width: `${highscore > 0 ? (round.score / highscore) * 100 : 0}%` }} />
                                                        </div>
                                                        <div className="text-left pl-2 md:pl-4 text-slate-900 dark:text-white font-bold relative z-10 text-xs md:text-sm truncate pr-2">
                                                            {getPracticeGameTitle(round.titleKey, t)}
                                                        </div>
                                                        <div className="text-blue-400 font-bold text-base md:text-lg relative z-10">
                                                            {round.score.toLocaleString()}
                                                        </div>
                                                        <div className="relative z-10 flex flex-col items-center justify-center gap-1">
                                                            <span className={`font-bold text-base md:text-lg ${isNewHighscore ? 'text-amber-300' : 'text-emerald-400'}`}>
                                                                {highscore.toLocaleString()}
                                                            </span>
                                                            {isNewHighscore && (
                                                                <motion.span
                                                                    initial={{ scale: 0.85, opacity: 0 }}
                                                                    animate={{ scale: 1, opacity: 1 }}
                                                                    transition={{ delay: 0.35 + idx * 0.12, type: 'spring', stiffness: 420, damping: 18 }}
                                                                    className="inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-300/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.25)]"
                                                                >
                                                                    <Sparkles className="h-3 w-3" />
                                                                    {t('solo.newHighscore', '신기록')}
                                                                </motion.span>
                                                            )}
                                                        </div>
                                                        <div className="font-bold text-base md:text-lg relative z-10">
                                                            {percentilesUnlocked
                                                                ? percentile === null
                                                                    ? <span className="text-slate-400">{t('solo.percentileUnavailable', '집계 중')}</span>
                                                                    : (
                                                                        <span
                                                                            style={{ color: percentileColor }}
                                                                            className="drop-shadow-[0_0_10px_rgba(255,255,255,0.08)]"
                                                                        >
                                                                            {t('solo.topPercentValue', '상위 {{percent}}%', { percent: percentile })}
                                                                        </span>
                                                                    )
                                                                : <span className="text-slate-400">{t('solo.percentileLocked', '잠금')}</span>}
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}
                                        </div>

                                        <motion.button
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.35 }}
                                            onClick={handleBack}
                                            disabled={isReturningToMenu}
                                            className="px-8 py-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-xl transition-all shadow-lg hover:shadow-green-500/50"
                                        >
                                            {isReturningToMenu
                                                ? t('common.loading', '로딩 중...')
                                                : t('game.returnMenu', '메뉴로 돌아가기')}
                                        </motion.button>
                                    </motion.div>
                                </div>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
};

export default SoloGame;
