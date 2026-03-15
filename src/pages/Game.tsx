import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, User, MoreHorizontal } from 'lucide-react';
import { AnimatedScore } from '../components/ui/AnimatedScore';
import { useGameState } from '../hooks/useGameState';
import { useSound } from '../contexts/SoundContext';
import { supabase } from '../lib/supabaseClient';
import RockPaperScissors from '../components/minigames/RockPaperScissors';
import NumberSortGame from '../components/minigames/NumberSortGame';
import MathChallenge from '../components/minigames/MathChallenge';
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
import TimingBar from '../components/minigames/TimingBar';
import ColorTiming from '../components/minigames/ColorTiming';
import StairwayGame from '../components/minigames/StairwayGame';
import ScoreProgressBar from '../components/ui/ScoreProgressBar';
import Flag from '../components/ui/Flag';
import HexRadar from '../components/ui/HexRadar';
import { isBotId } from '../constants/bot';
import { useUI } from '../contexts/UIContext';
import { useAuth } from '../contexts/AuthContext';
import ReportReasonModal from '../components/ui/ReportReasonModal';
import { resolveRoundWinner } from '../effects/roundWinner';
import { getLevelFromXp, getXpSnapshotStorageKey } from '../utils/levelUtils';
import TierMMRBadge from '../components/ui/TierMMRBadge';
import { getTierFromMMR, getTierIcon } from '../utils/rankUtils';
import ReviewPromptModal from '../components/ui/ReviewPromptModal';
// useTheme removed — Game board uses Tailwind dark: variants directly

const IS_DEV = import.meta.env.DEV;
const REVIEW_PROMPT_THRESHOLD = 1; // TODO: change to 5 for production release
const REVIEW_LS_PLAYED_KEY = 'brainrush_games_played';
const REVIEW_LS_PROMPTED_KEY = 'brainrush_review_prompted';
const BOT_EMOJI_POOL = ['🙂', '😭', '😂', '☹️', '❤️', '💔', '👍', '👎'];
const BOT_EMOJI_BURST = ['😂', '😭', '👍', '👎'];
const BOT_EMOJI_REACTIVE = {
    winning: ['😂', '🙂', '👍'],
    losing: ['😭', '☹️', '💔'],
    close: ['🙂', '👍', '👎']
};
type BotEmojiPattern = 'burst' | 'silent' | 'reactive';

const FINAL_ROUND_FINISHED_MS = 2000;
const REMATCH_WINDOW_MS = 30000;

const Game: React.FC = () => {
    const { t } = useTranslation();
    const { roomId: routeRoomId } = useParams<{ roomId: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const { showToast, confirm } = useUI();
    const { user, profile } = useAuth();

    // Route state check
    const { roomId: stateRoomId, myId, opponentId, skipWaiting } = location.state || {};
    const roomId = routeRoomId || stateRoomId;

    // Profiles
    const [myProfile, setMyProfile] = useState<any>(null);
    const [opponentProfile, setOpponentProfile] = useState<any>(null);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [isResultActionsOpen, setIsResultActionsOpen] = useState(false);
    const [rematchSourceSessionId, setRematchSourceSessionId] = useState<string | null>(null);
    const [pendingRematchInviteId, setPendingRematchInviteId] = useState<string | null>(null);
    const [isRematchClosed, setIsRematchClosed] = useState(false);
    const [rematchDeadlineMs, setRematchDeadlineMs] = useState<number | null>(null);
    const [rematchSecondsLeft, setRematchSecondsLeft] = useState<number>(30);
    const [isSubmittingRematch, setIsSubmittingRematch] = useState(false);
    const [botRoundDebugPreview, setBotRoundDebugPreview] = useState<{
        gameType: string;
        myBestScore: number;
        botGhostScore: number;
        gap: number;
    } | null>(null);

    // --- Realtime Score Sync (Broadcast) ---
    const [realtimeOpScore, setRealtimeOpScore] = useState<number | null>(null);
    const lastBroadcastScore = useRef<number>(0);
    const lastBroadcastTime = useRef<number>(0);
    const botRematchRejectTimeoutRef = useRef<number | null>(null);

    // Game Hook
    const { gameState, incrementScore, serverOffset, isWaitingTimeout, isTimeUp, onlineUsers, connectionStatus } = useGameState(roomId!, myId, opponentId);
    const { playBGM, stopBGM } = useSound();

    // BGM Control for timing-focused games
    useEffect(() => {
        if (gameState.gameType === 'TIMING_BAR' || gameState.gameType === 'COLOR_TIMING') {
            stopBGM();
        } else if (gameState.gameType) {
            playBGM('bgm_game');
        }
    }, [gameState.gameType, playBGM, stopBGM]);

    const isOpponentOnline = !opponentId || opponentId.startsWith('practice') || isBotId(opponentId) || onlineUsers.includes(opponentId);
    const canReportOpponent = Boolean(
        opponentId &&
        myId &&
        opponentId !== myId &&
        !opponentId.startsWith('guest_') &&
        !opponentId.startsWith('bot_') &&
        !opponentId.startsWith('practice') &&
        !isBotId(opponentId)
    );
    const canAddFriendOpponent = canReportOpponent;
    const canRematchOpponent = Boolean(
        opponentId &&
        myId &&
        opponentId !== myId &&
        !opponentId.startsWith('guest_') &&
        !opponentId.startsWith('practice')
    );
    const myPencils = typeof myProfile?.pencils === 'number'
        ? myProfile.pencils
        : typeof profile?.pencils === 'number'
            ? profile.pencils
            : null;
    const hasRematchPencils = typeof myPencils === 'number' && myPencils > 0;
    const canShowRematch = Boolean(
        roomId &&
        user &&
        myId === user.id &&
        (gameState.mode === 'rank' || gameState.mode === 'normal') &&
        canRematchOpponent &&
        !rematchSourceSessionId
    );

    useEffect(() => {
        if (!roomId) return;
        let active = true;
        supabase
            .from('game_sessions')
            .select('rematch_source_session_id')
            .eq('id', roomId)
            .maybeSingle()
            .then(({ data, error }) => {
                if (!active) return;
                if (error) {
                    console.error('Failed to load rematch source session', error);
                    return;
                }
                setRematchSourceSessionId((data as any)?.rematch_source_session_id ?? null);
            });
        return () => {
            active = false;
        };
    }, [roomId]);

    useEffect(() => {
        if (!roomId || !user || myId !== user.id || !profile) return;

        const xp = Math.max(0, Math.floor(Number(profile.xp ?? 0)));
        const level = typeof profile.level === 'number'
            ? Math.max(1, Math.floor(profile.level))
            : getLevelFromXp(xp);
        const storageKey = getXpSnapshotStorageKey(user.id);

        try {
            const raw = window.sessionStorage.getItem(storageKey);
            const existing = raw ? JSON.parse(raw) : null;
            if (existing?.roomId === roomId) return;

            window.sessionStorage.setItem(storageKey, JSON.stringify({
                roomId,
                beforeXp: xp,
                beforeLevel: level,
                capturedAt: Date.now()
            }));
        } catch (error) {
            console.error('Failed to store xp snapshot', error);
        }
    }, [roomId, user, myId, profile]);

    // Determine Status Logic
    const isPlaying = gameState.status === 'playing';
    const isFinished = gameState.status === 'finished';
    const [resultRevealReady, setResultRevealReady] = useState(false);
    const [terminalRoundFinishedActive, setTerminalRoundFinishedActive] = useState(false);
    const isWaiting = gameState.status === 'waiting';
    const isCountdown = gameState.status === 'countdown';
    const isCountdownActive = Boolean(
        isCountdown || (gameState.startAt && new Date(gameState.startAt).getTime() > (Date.now() + serverOffset))
    );
    const isUrgentRound = isPlaying && !isCountdownActive && gameState.remainingTime <= 5 && gameState.remainingTime > 0;
    const isGameplayActive = isPlaying && !isCountdownActive && !isTimeUp;


    const now = Date.now() + serverOffset;
    const warmupStart = gameState.startAt ? new Date(gameState.startAt).getTime() : 0;
    const warmupDiff = (warmupStart - now) / 1000;
    const isWarmup = warmupDiff > 0;
    // All UI phases derived from server's start_at timestamp (no client-side timers!)
    // Server sets start_at = now() + 8s in start_next_round
    // warmupDiff > 3: "Round Finished" phase (first ~5s)
    // warmupDiff 0~3: "Game Description" phase (last ~3s)
    // warmupDiff <= 0: Game starts
    const hasCompletedRound = gameState.roundScores.length > 0;
    const showRoundFinished = hasCompletedRound && ((isWarmup && warmupDiff > 3 && !isFinished) || terminalRoundFinishedActive);
    const showFinalResult = isFinished && resultRevealReady;
    const showWarmupOverlay = (isWarmup || isCountdown) && !showRoundFinished;
    const showEmojiBar = (showRoundFinished || isWaiting) && !showFinalResult;
    const showEmojiOverlay = showEmojiBar || showFinalResult;
    const isGameplayInteractable = isGameplayActive;



    useEffect(() => {
        if (!isFinished || gameState.mode === 'practice' || !hasCompletedRound) {
            setTerminalRoundFinishedActive(false);
            return;
        }

        setTerminalRoundFinishedActive(true);
        const timer = window.setTimeout(() => setTerminalRoundFinishedActive(false), FINAL_ROUND_FINISHED_MS);
        return () => window.clearTimeout(timer);
    }, [isFinished, gameState.mode, hasCompletedRound, gameState.roundScores.length]);



    // Display scores: during Round Finished, use server's roundScores snapshot (reliable)
    const lastRoundSnapshot = showRoundFinished && gameState.roundScores.length > 0
        ? gameState.roundScores[gameState.roundScores.length - 1]
        : null;
    const displayMyScore = lastRoundSnapshot
        ? (gameState.isPlayer1 ? lastRoundSnapshot.p1_score : lastRoundSnapshot.p2_score)
        : gameState.myScore;
    const displayOpScore = realtimeOpScore !== null
        ? realtimeOpScore
        : (lastRoundSnapshot
            ? (gameState.isPlayer1 ? lastRoundSnapshot.p2_score : lastRoundSnapshot.p1_score)
            : gameState.opScore);
    const [isMyBackdropScoreFlashing, setIsMyBackdropScoreFlashing] = useState(false);
    const [isOpBackdropScoreFlashing, setIsOpBackdropScoreFlashing] = useState(false);
    const prevDisplayMyScoreRef = useRef(displayMyScore);
    const prevDisplayOpScoreRef = useRef(displayOpScore);
    const myBackdropFlashTimerRef = useRef<number | null>(null);
    const opBackdropFlashTimerRef = useRef<number | null>(null);
    const requiredWins = gameState.mode === 'rank' ? 3 : 2;
    const player1Id = gameState.isPlayer1 ? myId : opponentId;
    const player2Id = gameState.isPlayer1 ? opponentId : myId;
    const settledWins = (gameState.roundScores || []).reduce(
        (acc, round) => {
            const winner = resolveRoundWinner(round, player1Id, player2Id);
            if (winner === 'p1') {
                if (gameState.isPlayer1) acc.my += 1;
                else acc.op += 1;
            } else if (winner === 'p2') {
                if (gameState.isPlayer1) acc.op += 1;
                else acc.my += 1;
            }
            return acc;
        },
        { my: 0, op: 0 }
    );
    const myWinsForLives = Math.max(settledWins.my, gameState.myWins);
    const opWinsForLives = Math.max(settledWins.op, gameState.opWins);
    const myLives = Math.max(0, requiredWins - opWinsForLives);
    const opLives = Math.max(0, requiredWins - myWinsForLives);
    const buildSideMask = (side: 'my' | 'op', lives: number) =>
        Array.from({ length: requiredWins }, (_, idx) =>
            side === 'my' ? idx < lives : idx >= (requiredWins - lives)
        );
    const [backdropHeartOn, setBackdropHeartOn] = useState<{ my: boolean[]; op: boolean[] }>({
        my: Array.from({ length: requiredWins }, () => true),
        op: Array.from({ length: requiredWins }, () => true)
    });
    const [displayedLives, setDisplayedLives] = useState<{ my: number; op: number }>({
        my: requiredWins,
        op: requiredWins
    });
    const [finishRevealDelayMs, setFinishRevealDelayMs] = useState(460);
    const displayedLivesRef = useRef(displayedLives);
    const roundLifeFxRoundRef = useRef<string>('');

    useEffect(() => {
        displayedLivesRef.current = displayedLives;
    }, [displayedLives]);

    useEffect(() => {
        if (gameState.roundScores.length === 0) {
            roundLifeFxRoundRef.current = '';
            setDisplayedLives({ my: myLives, op: opLives });
            setBackdropHeartOn({
                my: buildSideMask('my', myLives),
                op: buildSideMask('op', opLives)
            });
        }
    }, [gameState.roundScores.length, myLives, opLives, requiredWins]);

    useEffect(() => {
        if (gameState.mode === 'practice') return;
        // Never allow visual lives to exceed authoritative lives from server snapshots.
        setDisplayedLives((prev) => ({
            my: Math.min(prev.my, myLives),
            op: Math.min(prev.op, opLives)
        }));
    }, [gameState.mode, myLives, opLives]);

    useEffect(() => {
        if (gameState.mode === 'practice' || isFinished || showRoundFinished) return;
        // Outside round-finished animation, always mirror authoritative lives.
        setDisplayedLives({ my: myLives, op: opLives });
        setBackdropHeartOn({
            my: buildSideMask('my', myLives),
            op: buildSideMask('op', opLives)
        });
    }, [gameState.mode, isFinished, showRoundFinished, myLives, opLives, requiredWins]);

    useEffect(() => {
        const prevScore = prevDisplayMyScoreRef.current;
        if (displayMyScore > prevScore) {
            if (myBackdropFlashTimerRef.current) window.clearTimeout(myBackdropFlashTimerRef.current);
            setIsMyBackdropScoreFlashing(true);
            myBackdropFlashTimerRef.current = window.setTimeout(() => {
                setIsMyBackdropScoreFlashing(false);
                myBackdropFlashTimerRef.current = null;
            }, 320);
        }
        prevDisplayMyScoreRef.current = displayMyScore;
    }, [displayMyScore]);

    useEffect(() => {
        const prevScore = prevDisplayOpScoreRef.current;
        if (displayOpScore > prevScore) {
            if (opBackdropFlashTimerRef.current) window.clearTimeout(opBackdropFlashTimerRef.current);
            setIsOpBackdropScoreFlashing(true);
            opBackdropFlashTimerRef.current = window.setTimeout(() => {
                setIsOpBackdropScoreFlashing(false);
                opBackdropFlashTimerRef.current = null;
            }, 320);
        }
        prevDisplayOpScoreRef.current = displayOpScore;
    }, [displayOpScore]);

    useEffect(() => () => {
        if (myBackdropFlashTimerRef.current) window.clearTimeout(myBackdropFlashTimerRef.current);
        if (opBackdropFlashTimerRef.current) window.clearTimeout(opBackdropFlashTimerRef.current);
    }, []);

    useEffect(() => {
        if (!showRoundFinished || gameState.mode === 'practice') return;
        const roundIdx = gameState.roundScores.length - 1;
        const fxKey = `${gameState.currentRound}:${gameState.roundScores.length}:${myLives}:${opLives}`;
        if (roundLifeFxRoundRef.current === fxKey) return;

        const round = gameState.roundScores[roundIdx];
        const winner = resolveRoundWinner(round, player1Id, player2Id);
        const baseLives = displayedLivesRef.current;

        setBackdropHeartOn({
            my: buildSideMask('my', baseLives.my),
            op: buildSideMask('op', baseLives.op)
        });

        if (winner === 'draw') return;

        let losingSide: 'my' | 'op' | null = null;
        if (winner === 'p1' || winner === 'p2') {
            losingSide =
                (winner === 'p1' && gameState.isPlayer1) || (winner === 'p2' && !gameState.isPlayer1)
                    ? 'op'
                    : 'my';
        } else if (myLives < baseLives.my) {
            losingSide = 'my';
        } else if (opLives < baseLives.op) {
            losingSide = 'op';
        }
        if (!losingSide) return;
        roundLifeFxRoundRef.current = fxKey;

        const targetIdx = losingSide === 'my'
            ? Math.max(0, baseLives.my - 1)
            : Math.max(0, requiredWins - baseLives.op);
        const forceTargetOff = () => {
            setBackdropHeartOn((prev) => {
                const next = { ...prev, [losingSide]: [...prev[losingSide]] };
                next[losingSide][targetIdx] = false;
                return next;
            });
        };

        const timers: number[] = [];
        const flickerCount = 3 + Math.floor(Math.random() * 3); // 3~5 toggles
        const flickerTimes: number[] = [];
        let cursor = 180 + Math.floor(Math.random() * 120);
        for (let i = 0; i < flickerCount; i++) {
            flickerTimes.push(cursor);
            // Uneven cadence like failing light bulb: short, long, short...
            const nextGap = (i % 2 === 0)
                ? (70 + Math.floor(Math.random() * 90))
                : (140 + Math.floor(Math.random() * 220));
            cursor += nextGap;
        }

        flickerTimes.forEach((at) => {
            timers.push(window.setTimeout(() => {
                setBackdropHeartOn((prev) => {
                    const next = { ...prev, [losingSide]: [...prev[losingSide]] };
                    next[losingSide][targetIdx] = !next[losingSide][targetIdx];
                    return next;
                });
            }, at));
        });

        timers.push(window.setTimeout(() => {
            // Final frame must always be OFF.
            forceTargetOff();
            setDisplayedLives({ my: myLives, op: opLives });
        }, cursor + 120 + Math.floor(Math.random() * 120)));

        return () => {
            timers.forEach((id) => window.clearTimeout(id));
            // Guarantee "power off" even if timers are cleared early.
            forceTargetOff();
        };
    }, [
        isFinished,
        showRoundFinished,
        gameState.mode,
        gameState.roundScores,
        gameState.isPlayer1,
        player1Id,
        player2Id,
        requiredWins,
        myLives,
        opLives
    ]);

    useEffect(() => {
        if (!isFinished) {
            setFinishRevealDelayMs(460);
            return;
        }

        if (terminalRoundFinishedActive) return;

        if (gameState.mode === 'practice' || !gameState.winnerId || !myId) {
            setFinishRevealDelayMs(460);
            return;
        }

        const losingSide: 'my' | 'op' | null = gameState.winnerId === myId
            ? 'op'
            : (gameState.winnerId === opponentId ? 'my' : null);
        if (!losingSide) {
            setFinishRevealDelayMs(460);
            return;
        }
        const forceSideAllOff = () => {
            setBackdropHeartOn((prev) => {
                const next = { ...prev, [losingSide]: [...prev[losingSide]] };
                for (let i = 0; i < requiredWins; i++) {
                    next[losingSide][i] = false;
                }
                return next;
            });
        };

        const timers: number[] = [];
        let maxEnd = 0;
        for (let idx = 0; idx < requiredWins; idx++) {
            const startAt = idx * 220 + Math.floor(Math.random() * 140);
            const flickers = 8 + Math.floor(Math.random() * 5);
            let cursor = startAt;

            for (let step = 0; step < flickers; step++) {
                // Accelerate blink cadence for a "power dying" feel.
                const interval = Math.max(38, 86 - step * 6) + Math.floor(Math.random() * 16);
                cursor += interval;
                const at = cursor;
                maxEnd = Math.max(maxEnd, at);
                timers.push(window.setTimeout(() => {
                    setBackdropHeartOn((prev) => {
                        const next = { ...prev, [losingSide]: [...prev[losingSide]] };
                        next[losingSide][idx] = !next[losingSide][idx];
                        return next;
                    });
                }, at));
            }

            const offAt = cursor + 120 + Math.floor(Math.random() * 70);
            maxEnd = Math.max(maxEnd, offAt);
            timers.push(window.setTimeout(() => {
                setBackdropHeartOn((prev) => {
                    const next = { ...prev, [losingSide]: [...prev[losingSide]] };
                    next[losingSide][idx] = false;
                    return next;
                });
            }, offAt));
        }

        setFinishRevealDelayMs(Math.max(760, maxEnd + 220));
        return () => {
            timers.forEach((timerId) => window.clearTimeout(timerId));
            forceSideAllOff();
        };
    }, [isFinished, terminalRoundFinishedActive, gameState.mode, gameState.winnerId, myId, opponentId, requiredWins]);

    const renderEmojiButton = (emoji: string, className: string) => {
        return (
            <span className={`inline-flex items-center justify-center leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)] ${className}`}>
                {emoji}
            </span>
        );
    };

    const renderEmojiBurst = (emoji: string, className: string) => {
        return (
            <span className={`inline-flex aspect-square items-center justify-center rounded-full bg-white/15 border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_24px_rgba(0,0,0,0.24)] backdrop-blur-sm ${className}`}>
                <span className="text-[4.25rem] leading-none drop-shadow-[0_3px_6px_rgba(0,0,0,0.4)]">
                    {emoji}
                </span>
            </span>
        );
    };
    const radarLabels = {
        speed: t('profile.stats.speed'),
        memory: t('profile.stats.memory'),
        judgment: t('profile.stats.judgment'),
        calculation: t('profile.stats.calculation'),
        accuracy: t('profile.stats.accuracy'),
        observation: t('profile.stats.observation')
    };
    const myRadarStats = {
        speed: myProfile?.speed || 0,
        memory: myProfile?.memory || 0,
        judgment: myProfile?.judgment || 0,
        calculation: myProfile?.calculation || 0,
        accuracy: myProfile?.accuracy || 0,
        observation: myProfile?.observation || 0
    };
    const opRadarStats = {
        speed: opponentProfile?.speed || 0,
        memory: opponentProfile?.memory || 0,
        judgment: opponentProfile?.judgment || 0,
        calculation: opponentProfile?.calculation || 0,
        accuracy: opponentProfile?.accuracy || 0,
        observation: opponentProfile?.observation || 0
    };

    const showEmojiOverlayRef = useRef(false);
    /* REMOVED: realtimeOpScore moved to top */

    /* REMOVED: realtimeOpScore declaration was here */

    useEffect(() => {
        showEmojiOverlayRef.current = showEmojiOverlay;
    }, [showEmojiOverlay]);

    useEffect(() => {
        if (!isFinished) {
            setResultRevealReady(false);
            return;
        }

        if (gameState.mode === 'practice') {
            setResultRevealReady(true);
            return;
        }

        if (terminalRoundFinishedActive) {
            setResultRevealReady(false);
            return;
        }

        // Delay final popup until loser-side heart flicker/power-down is completed.
        const timer = window.setTimeout(() => setResultRevealReady(true), finishRevealDelayMs);
        return () => window.clearTimeout(timer);
    }, [isFinished, terminalRoundFinishedActive, gameState.mode, finishRevealDelayMs]);

    // Reset realtime score on round change
    useEffect(() => {
        setRealtimeOpScore(null);
        lastBroadcastScore.current = 0;
    }, [gameState.currentRound, gameState.gameType]);

    // Throttled Score Sender
    useEffect(() => {
        if (!myId || !emojiChannelRef.current || gameState.status !== 'playing') return;

        const now = Date.now();
        const score = gameState.myScore;
        const timeDiff = now - lastBroadcastTime.current;

        // Condition: Score changed AND (Enough time passed OR Significant change)
        if (score !== lastBroadcastScore.current) {
            if (timeDiff > 150) { // 150ms Throttle
                emojiChannelRef.current.send({
                    type: 'broadcast',
                    event: 'score',
                    payload: { score, senderId: myId }
                });
                lastBroadcastScore.current = score;
                lastBroadcastTime.current = now;
            }
        }
    }, [gameState.myScore, myId, gameState.status]);

    const [emojiBursts, setEmojiBursts] = useState<Array<{ id: string; emoji: string; side: 'left' | 'right'; driftX: number; driftY: number; baseY: number; travelX: number }>>([]);
    const emojiChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    const spawnEmoji = useCallback((emoji: string, side: 'left' | 'right') => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const driftX = Math.floor(Math.random() * 18) - 9;
        const driftY = Math.floor(Math.random() * 18) - 9;
        const baseY = 45 + (Math.random() * 12 - 6);
        const travelX = 70 + Math.floor(Math.random() * 30) - 15;
        setEmojiBursts(prev => [...prev, { id, emoji, side, driftX, driftY, baseY, travelX }]);
        window.setTimeout(() => {
            setEmojiBursts(prev => prev.filter(item => item.id !== id));
        }, 1400);
    }, []);

    useEffect(() => {
        if (!roomId || !myId) return;
        const channel = supabase.channel(`game_emoji_${roomId}`, {
            config: { broadcast: { self: false } }
        });

        channel.on('broadcast', { event: 'emoji' }, ({ payload }) => {
            if (!showEmojiOverlayRef.current) return;
            const incomingEmoji = payload?.emoji;
            const senderId = payload?.senderId;
            if (!incomingEmoji || senderId === myId) return;
            spawnEmoji(incomingEmoji, 'right');
        });

        /* REMOVED: score listener logic was here */

        channel.subscribe();
        emojiChannelRef.current = channel;

        // Listen for Score Updates (Moved here to use the same channel)
        channel.on('broadcast', { event: 'score' }, ({ payload }) => {
            const score = payload?.score;
            const senderId = payload?.senderId;
            if (typeof score === 'number' && senderId !== myId) {
                setRealtimeOpScore(score);
            }
        });

        return () => {
            supabase.removeChannel(channel);
            emojiChannelRef.current = null;
        };
    }, [roomId, myId, spawnEmoji]);

    const handleEmojiSend = useCallback((emoji: string) => {
        if (!myId || !emojiChannelRef.current) return;
        spawnEmoji(emoji, 'left');
        emojiChannelRef.current.send({
            type: 'broadcast',
            event: 'emoji',
            payload: { emoji, senderId: myId }
        });
    }, [myId, spawnEmoji]);

    const emojiRowTop = ['🙂', '😭', '😂', '☹️'];
    const emojiRowBottom = ['❤️', '💔', '👍', '👎'];
    const isConnectionUnstable = connectionStatus !== 'connected';
    const connectionLabel = connectionStatus === 'disconnected'
        ? t('game.connectionLost')
        : connectionStatus === 'reconnecting'
            ? t('game.connectionUnstable')
            : t('game.connecting');

    const botEmojiPatternRef = useRef<BotEmojiPattern | null>(null);
    const botBurstEmojiRef = useRef<string>('🙂');

    useEffect(() => {
        if (!isBotId(opponentId)) {
            botEmojiPatternRef.current = null;
            return;
        }
        const roll = Math.random();
        if (roll < 0.25) botEmojiPatternRef.current = 'silent';
        else if (roll < 0.6) botEmojiPatternRef.current = 'burst';
        else botEmojiPatternRef.current = 'reactive';
        botBurstEmojiRef.current = BOT_EMOJI_BURST[Math.floor(Math.random() * BOT_EMOJI_BURST.length)];
    }, [opponentId]);

    useEffect(() => {
        if (!isBotId(opponentId) || !showEmojiOverlay) return;
        if (botEmojiPatternRef.current === 'silent') return;
        let timeoutId: number | null = null;
        let cancelled = false;

        const schedule = () => {
            if (cancelled) return;
            const pattern = botEmojiPatternRef.current;
            const delay = pattern === 'burst' ? 2000 + Math.random() * 2200 : 1400 + Math.random() * 2600;
            timeoutId = window.setTimeout(() => {
                if (!showEmojiOverlayRef.current) {
                    schedule();
                    return;
                }

                const pattern = botEmojiPatternRef.current;
                if (pattern === 'burst') {
                    const emoji = botBurstEmojiRef.current || BOT_EMOJI_POOL[Math.floor(Math.random() * BOT_EMOJI_POOL.length)];
                    spawnEmoji(emoji, 'right');
                    window.setTimeout(() => spawnEmoji(emoji, 'right'), 200);
                    window.setTimeout(() => spawnEmoji(emoji, 'right'), 420);
                } else if (pattern === 'reactive') {
                    const diff = gameState.opScore - gameState.myScore;
                    const bucket = diff >= 150 ? 'winning' : diff <= -150 ? 'losing' : 'close';
                    const pool = BOT_EMOJI_REACTIVE[bucket];
                    const emoji = pool[Math.floor(Math.random() * pool.length)];
                    spawnEmoji(emoji, 'right');
                } else {
                    const emoji = BOT_EMOJI_POOL[Math.floor(Math.random() * BOT_EMOJI_POOL.length)];
                    spawnEmoji(emoji, 'right');
                }
                schedule();
            }, delay);
        };

        schedule();
        return () => {
            cancelled = true;
            if (timeoutId) window.clearTimeout(timeoutId);
        };
    }, [opponentId, showEmojiOverlay, spawnEmoji, gameState.myScore, gameState.opScore]);

    useEffect(() => {
        if (!roomId) {
            navigate('/');
        }
    }, [roomId, navigate]);

    useEffect(() => {
        const fetchBotRoundDebugPreview = async () => {
            if (!IS_DEV || !roomId || !myId || !isBotId(opponentId) || !showWarmupOverlay || !gameState.gameType) {
                setBotRoundDebugPreview(null);
                return;
            }

            const { data: session } = await supabase
                .from('game_sessions')
                .select('game_type, game_data')
                .eq('id', roomId)
                .maybeSingle();

            if (!session?.game_type) {
                setBotRoundDebugPreview(null);
                return;
            }

            const { data: roundHighscore, error: highscoreError } = await supabase
                .from('player_highscores')
                .select('best_score')
                .eq('user_id', myId)
                .eq('game_type', session.game_type)
                .maybeSingle();

            if (highscoreError) {
                setBotRoundDebugPreview(null);
                return;
            }

            const { data: ghostRows, error: ghostError } = await supabase
                .from('ghost_scores' as any)
                .select('final_score, score_timeline')
                .eq('game_type', session.game_type);

            if (ghostError || !ghostRows?.length) {
                setBotRoundDebugPreview(null);
                return;
            }

            const targetTimeline = JSON.stringify(session.game_data?.ghost_timeline ?? null);
            const exactGhost = ghostRows.find((row: any) => JSON.stringify(row.score_timeline ?? null) === targetTimeline);
            const myBestScore = typeof roundHighscore?.best_score === 'number' ? roundHighscore.best_score : 0;
            const sumTimelineScore = (timeline: unknown): number => {
                if (!Array.isArray(timeline)) return 0;
                return timeline.reduce((total, point) => {
                    if (!Array.isArray(point) || point.length < 2) return total;
                    const delta = Number(point[1]);
                    return Number.isFinite(delta) ? total + delta : total;
                }, 0);
            };

            const selectedGhost = exactGhost ?? ghostRows.reduce((best: any, row: any) => {
                const bestGap = Math.abs(sumTimelineScore(best.score_timeline) - myBestScore);
                const nextGap = Math.abs(sumTimelineScore(row.score_timeline) - myBestScore);
                return nextGap < bestGap ? row : best;
            });
            const botGhostScore = sumTimelineScore(selectedGhost.score_timeline);

            setBotRoundDebugPreview({
                gameType: session.game_type,
                myBestScore,
                botGhostScore,
                gap: botGhostScore - myBestScore
            });
        };

        fetchBotRoundDebugPreview();
    }, [roomId, myId, opponentId, showWarmupOverlay, gameState.gameType, gameState.currentRound]);

    // Fetch Profiles
    useEffect(() => {
        const fetchProfiles = async () => {
            if (myId) {
                const { data } = await supabase.from('profiles').select('*').eq('id', myId).single();
                setMyProfile(data || { nickname: t('game.me'), avatar_url: null });
            }
            if (opponentId) {
                if (opponentId === 'practice_solo') {
                    setOpponentProfile(null); // No opponent
                } else if (opponentId === 'practice_bot') {
                    setOpponentProfile({
                        nickname: t('game.aiBot'),
                        avatar_url: 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=BrainRushBot',
                        country: 'KR' // Or generic
                    });
                } else if (isBotId(opponentId)) {
                    const { data } = await supabase
                        .from('bot_profiles')
                        .select('*')
                        .eq('id', opponentId)
                        .maybeSingle();
                    if (data) {
                        setOpponentProfile({
                            nickname: data.nickname,
                            avatar_url: data.avatar_url,
                            country: data.country
                        });
                    } else {
                        setOpponentProfile({ nickname: t('game.unknownPlayer'), avatar_url: null });
                    }
                } else {
                    const { data } = await supabase.from('profiles').select('*').eq('id', opponentId).single();
                    setOpponentProfile(data || { nickname: t('game.opponent'), avatar_url: null });
                }
            }
        };
        fetchProfiles();
    }, [myId, opponentId, t]);

    // Handle Timeout / Exit
    useEffect(() => {
        if (isWaitingTimeout) {
            navigate('/');
        }
    }, [isWaitingTimeout, navigate]);


    const [isButtonEnabled, setIsButtonEnabled] = useState(false);
    const [isReturningToMenu, setIsReturningToMenu] = useState(false);

    useEffect(() => {
        if (showFinalResult) {
            // Wait for animations to finish (approx 4.5s)
            const timer = setTimeout(() => setIsButtonEnabled(true), 4500);
            return () => clearTimeout(timer);
        } else {
            setIsButtonEnabled(false);
            setIsResultActionsOpen(false);
        }
    }, [showFinalResult]);

    useEffect(() => {
        if (!showFinalResult) {
            setRematchDeadlineMs(null);
            setRematchSecondsLeft(30);
            setIsRematchClosed(false);
            setPendingRematchInviteId(null);
            return;
        }

        const deadline = Date.now() + REMATCH_WINDOW_MS;
        setRematchDeadlineMs(deadline);
        setRematchSecondsLeft(Math.ceil(REMATCH_WINDOW_MS / 1000));
        setIsRematchClosed(false);
    }, [showFinalResult, roomId]);

    useEffect(() => {
        if (!showFinalResult || !rematchDeadlineMs || isRematchClosed) return;

        const updateRemaining = () => {
            const remainingMs = rematchDeadlineMs - Date.now();
            const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
            setRematchSecondsLeft(remainingSec);

            if (remainingMs <= 0) {
                setIsRematchClosed(true);
                setPendingRematchInviteId(null);
            }
        };

        updateRemaining();
        const timer = window.setInterval(updateRemaining, 250);
        return () => window.clearInterval(timer);
    }, [isRematchClosed, rematchDeadlineMs, showFinalResult]);

    const handleReturnMenu = useCallback(async () => {
        if (isReturningToMenu) return;
        setIsReturningToMenu(true);
        try {
            // Show interstitial only when user explicitly leaves result screen.
            if (myProfile && !myProfile.ads_removed) {
                const { AdLogic } = await import('../utils/AdLogic');
                await AdLogic.checkAndShowInterstitial();
            }
        } finally {
            navigate('/');
        }
    }, [isReturningToMenu, myProfile, navigate]);

    const handleRequestRematch = useCallback(async () => {
        if (!canShowRematch || !roomId || !opponentId || isSubmittingRematch || pendingRematchInviteId) return;
        if (isRematchClosed || rematchSecondsLeft <= 0) {
            setIsRematchClosed(true);
            showToast(t('game.rematchExpired', '재대결 신청 시간이 종료되었습니다.'), 'info');
            return;
        }
        if (myPencils !== null && myPencils < 1) {
            showToast(t('game.rematchNoPencils', '연필이 부족합니다'), 'error');
            return;
        }

        const confirmed = await confirm(
            t('game.rematchConfirmTitle', '재대결 신청'),
            t('game.rematchConfirmBody', '재대결을 요청하시겠습니까?') + '\n\n' + t('game.rematchRequesterCostNotice', '신청 시에만 연필 1개가 차감됩니다.')
        );
        if (!confirmed) return;

        const inviteId = `rematch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        if (isBotId(opponentId)) {
            setPendingRematchInviteId(inviteId);
            showToast(t('game.rematchWaiting', '재대결 요청을 보냈습니다.'), 'info');

            const delay = 1000 + Math.random() * 4000;
            botRematchRejectTimeoutRef.current = window.setTimeout(() => {
                setPendingRematchInviteId(null);
                setIsRematchClosed(true);
                showToast(t('game.rematchRejected', '상대가 재대결을 거절했습니다.'), 'info');
            }, delay);
            return;
        }

        setIsSubmittingRematch(true);
        try {
            const { error } = await supabase
                .from('chat_messages')
                .insert({
                    sender_id: myId,
                    receiver_id: opponentId,
                    content: `REMATCH_REQUEST:${inviteId}:${roomId}`
                });

            if (error) throw error;
            setPendingRematchInviteId(inviteId);
            showToast(t('game.rematchWaiting', '재대결 요청을 보냈습니다.'), 'info');
        } catch (error: any) {
            console.error('Failed to request rematch', error);
            showToast(error?.message || t('game.rematchRequestFail', '재대결 요청 중 오류가 발생했습니다.'), 'error');
        } finally {
            setIsSubmittingRematch(false);
        }
    }, [canShowRematch, confirm, isRematchClosed, isSubmittingRematch, myId, myPencils, navigate, opponentId, pendingRematchInviteId, rematchSecondsLeft, roomId, showToast, t]);

    useEffect(() => {
        return () => {
            if (botRematchRejectTimeoutRef.current) {
                window.clearTimeout(botRematchRejectTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const handleRematchResponse = (event: Event) => {
            const detail = (event as CustomEvent<{ type?: string; inviteId?: string }>).detail;
            if (!pendingRematchInviteId || !detail?.inviteId || detail.inviteId !== pendingRematchInviteId) return;

            if (detail.type === 'REMATCH_ACCEPTED' || detail.type === 'REMATCH_REJECTED') {
                setPendingRematchInviteId(null);
            }
            if (detail.type === 'REMATCH_REJECTED') {
                setIsRematchClosed(true);
            }
        };

        window.addEventListener('brainrush:rematch-response', handleRematchResponse as EventListener);
        return () => {
            window.removeEventListener('brainrush:rematch-response', handleRematchResponse as EventListener);
        };
    }, [pendingRematchInviteId]);

    const handleSubmitReport = useCallback(async (reason: string) => {
        if (!canReportOpponent || !opponentId || !roomId) return;
        try {
            const { error } = await supabase.rpc('submit_player_report', {
                p_reason: reason,
                p_reported_user_id: opponentId,
                p_session_id: roomId
            });
            if (error) throw error;
            showToast(t('report.success', '신고가 접수되었습니다.'), 'success');
            setIsReportModalOpen(false);
        } catch (error: any) {
            console.error('Report submit error:', error);
            showToast(error?.message || t('report.fail', '신고 접수 중 오류가 발생했습니다.'), 'error');
        }
    }, [canReportOpponent, opponentId, roomId, showToast, t]);

    const handleAddFriend = useCallback(async () => {
        if (!canAddFriendOpponent || !myId || !opponentId) return;
        try {
            const { error } = await supabase
                .from('friendships')
                .insert({
                    user_id: myId,
                    friend_id: opponentId,
                    status: 'pending'
                });
            if (error) throw error;
            showToast(t('social.requestSent'), 'success');
            setIsResultActionsOpen(false);
        } catch (err: any) {
            if (err?.code === '23505' || String(err?.message || '').toLowerCase().includes('duplicate')) {
                showToast(t('social.requestPending'), 'error');
            } else {
                showToast(t('social.requestFail'), 'error');
            }
        }
    }, [canAddFriendOpponent, myId, opponentId, showToast, t]);

    // MMR Animation Logic
    const [displayMMR, setDisplayMMR] = useState<number | null>(null);
    const [mmrDelta, setMmrDelta] = useState<number | null>(null);
    const [streakBonus, setStreakBonus] = useState<number>(0);
    const [showLosePencilModal, setShowLosePencilModal] = useState(false);
    const [showReviewPrompt, setShowReviewPrompt] = useState(false);

    useEffect(() => {
        const handleModalCloseRequest = (event: Event) => {
            const customEvent = event as CustomEvent<{ handled?: boolean }>;
            if (customEvent.detail?.handled) return;
            if (!showLosePencilModal) return;
            setShowLosePencilModal(false);
            if (customEvent.detail) customEvent.detail.handled = true;
        };
        window.addEventListener('brainrush:request-modal-close', handleModalCloseRequest as EventListener);
        return () => {
            window.removeEventListener('brainrush:request-modal-close', handleModalCloseRequest as EventListener);
        };
    }, [showLosePencilModal]);

    useEffect(() => {
        if (showFinalResult && gameState.mode === 'rank' && myProfile?.id) {
            // Delay start to sync with "Total Score" appearance
            const startDelay = setTimeout(() => {
                // Fetch both the new MMR and the streak bonus from the session
                Promise.all([
                    supabase.from('profiles').select('mmr').eq('id', myProfile.id).single(),
                    supabase.from('game_sessions').select('player1_id, player1_streak_bonus, player2_streak_bonus, player1_lose_pencil, player2_lose_pencil').eq('id', roomId).single()
                ]).then(([profileRes, sessionRes]) => {
                    if (profileRes.data && myProfile.mmr) {
                        const start = myProfile.mmr;
                        const end = profileRes.data.mmr;
                        setMmrDelta(end - start);
                        setDisplayMMR(start);

                        // Determine my streak bonus
                        if (sessionRes.data) {
                            const isP1 = sessionRes.data.player1_id === myId;
                            const bonus = isP1 ? (sessionRes.data.player1_streak_bonus ?? 0) : (sessionRes.data.player2_streak_bonus ?? 0);
                            setStreakBonus(bonus);

                            // Check lose pencil reward
                            const gotPencil = isP1 ? sessionRes.data.player1_lose_pencil : sessionRes.data.player2_lose_pencil;
                            if (gotPencil) {
                                setTimeout(() => setShowLosePencilModal(true), 2500);
                            }
                        }

                        // Faster counting: 1.5s duration
                        const duration = 1500;
                        const steps = 60;
                        const intervalTime = duration / steps;
                        const stepValue = (end - start) / steps;
                        let output = start;
                        let count = 0;

                        const timer = setInterval(() => {
                            count++;
                            output += stepValue;
                            if (count >= steps) {
                                setDisplayMMR(end);
                                clearInterval(timer);
                            } else {
                                setDisplayMMR(Math.round(output));
                            }
                        }, intervalTime);
                    }
                });
            }, 1000);

            return () => clearTimeout(startDelay);
        }
    }, [showFinalResult, gameState.mode, myProfile]);

    const isMatchWin = Boolean(gameState.winnerId && gameState.winnerId === myId);
    const isMatchLoss = Boolean(gameState.winnerId && gameState.winnerId !== myId);
    const isMyWinnerCard = isMatchWin;
    const isOpWinnerCard = isMatchLoss;
    const myFinalMMR = gameState.mode === 'rank' && displayMMR !== null ? displayMMR : (myProfile?.mmr ?? 1000);
    const opFinalMMR = opponentProfile?.mmr ?? 1000;
    const myFinalTier = getTierFromMMR(myFinalMMR);
    const opFinalTier = getTierFromMMR(opFinalMMR);
    const MyFinalTierIcon = getTierIcon(myFinalTier);
    const OpFinalTierIcon = getTierIcon(opFinalTier);

    // Review prompt: track games played and trigger on win
    useEffect(() => {
        if (!showFinalResult || gameState.mode === 'practice') return;
        const alreadyPrompted = localStorage.getItem(REVIEW_LS_PROMPTED_KEY) === 'true';
        if (alreadyPrompted) return;

        const prev = parseInt(localStorage.getItem(REVIEW_LS_PLAYED_KEY) || '0', 10);
        const next = prev + 1;
        localStorage.setItem(REVIEW_LS_PLAYED_KEY, String(next));

        if (next >= REVIEW_PROMPT_THRESHOLD && isMatchWin) {
            // Small delay so it doesn't compete with MMR animation / lose-pencil modal
            const timer = setTimeout(() => setShowReviewPrompt(true), 3000);
            return () => clearTimeout(timer);
        }
    }, [showFinalResult, gameState.mode, isMatchWin]);

    const handleReviewPromptClose = useCallback(() => {
        setShowReviewPrompt(false);
        localStorage.setItem(REVIEW_LS_PROMPTED_KEY, 'true');
    }, []);

    const getRoundGameTitle = (gameType: string | null | undefined) => {
        switch (gameType) {
            case 'RPS': return t('rps.title');
            case 'NUMBER': return t('number.title');
            case 'NUMBER_DESC': return t('number.titleDesc');
            case 'MATH': return t('math.title');
            case 'TEN': return t('ten.title');
            case 'COLOR': return t('color.title');
            case 'MEMORY': return t('memory.title');
            case 'SEQUENCE': return t('sequence.title');
            case 'SEQUENCE_NORMAL': return t('sequence.titleNormal');
            case 'LARGEST': return t('largest.title');
            case 'PAIR': return t('pair.title');
            case 'UPDOWN': return t('updown.title');
            case 'SLIDER': return t('slider.title');
            case 'ARROW': return t('arrow.title');
            case 'BLANK': return t('fillBlanks.title');
            case 'OPERATOR': return t('findOperator.title');
            case 'LADDER': return t('ladder.title');
            case 'TAP_COLOR': return t('tapTheColor.title');
            case 'AIM': return t('aim.title');
            case 'MOST_COLOR': return t('mostColor.title');
            case 'SORTING': return t('sorting.title');
            case 'SPY': return t('spy.title');
            case 'PATH': return t('path.title');
            case 'BALLS': return t('balls.title');
            case 'BLIND_PATH': return t('blindPath.title');
            case 'CATCH_COLOR': return t('catchColor.title');
            case 'TIMING_BAR': return t('timingBar.title');
            case 'COLOR_TIMING': return t('colorTiming.title', '컬러 타이밍');
            case 'STAIRWAY': return t('stairway.title', '천국의 계단');
            case 'MAKE_ZERO': return t('zero.title', '0을 만들어라');
            default: return gameType || '-';
        }
    };

    const totalScores = React.useMemo(() => {
        const rounds = gameState.roundScores || [];
        if (rounds.length === 0) {
            return { my: gameState.myScore, op: gameState.opScore };
        }
        const sum = rounds.reduce(
            (acc, round) => {
                const p1 = Number(round?.p1_score || 0);
                const p2 = Number(round?.p2_score || 0);
                if (gameState.isPlayer1) {
                    acc.my += p1;
                    acc.op += p2;
                } else {
                    acc.my += p2;
                    acc.op += p1;
                }
                return acc;
            },
            { my: 0, op: 0 }
        );
        return sum;
    }, [gameState.roundScores, gameState.isPlayer1, gameState.myScore, gameState.opScore]);

    const maxBackdropScoreDigits = Math.max(
        String(Math.max(0, Math.floor(displayMyScore))).length,
        String(Math.max(0, Math.floor(displayOpScore))).length
    );
    const backdropScoreSizeClass =
        maxBackdropScoreDigits >= 5
            ? 'text-[clamp(40px,10vw,110px)]'
            : maxBackdropScoreDigits === 4
                ? 'text-[clamp(52px,13vw,150px)]'
                : 'text-[clamp(72px,20vw,220px)]';

    return (
        <div className={`relative w-full h-[100dvh] overflow-hidden flex flex-col font-sans select-none pt-[env(safe-area-inset-top)] bg-slate-50 dark:bg-gray-900 text-slate-900 dark:text-white`}>

            {isUrgentRound && <div className="round-urgent-frame z-[70]" aria-hidden="true" />}

            {/* Top Info Bar (Timer & Scores) */}
            {!showFinalResult && (
                <header className="h-24 w-full bg-white dark:bg-gray-800/80 backdrop-blur-md flex items-center justify-between px-4 shadow-lg z-50 relative">

                    {/* Score Progress Bar - Hide in Practice */}
                    {gameState.mode !== 'practice' && (
                        <div className="absolute bottom-0 left-0 w-full px-0">
                            <div className="w-full h-1.5 bg-slate-50 dark:bg-gray-900/50 overflow-hidden backdrop-blur-sm">
                                <ScoreProgressBar myScore={displayMyScore} opScore={displayOpScore} />
                            </div>
                        </div>
                    )}

                    {/* My Profile */}
                    <div className="flex items-center gap-2 flex-1 min-w-0 pt-2">
                        <div className="relative flex-shrink-0">
                            {myProfile?.avatar_url ? (
                                <img src={myProfile.avatar_url} className="w-11 h-11 rounded-full border-2 border-blue-500 object-cover" />
                            ) : (
                                <div className="w-11 h-11 rounded-full border-2 border-blue-500 flex items-center justify-center bg-white dark:bg-gray-800 text-blue-500">
                                    <User size={20} />
                                </div>
                            )}
                            {isConnectionUnstable && (
                                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-yellow-300 border-t-transparent animate-spin bg-slate-50 dark:bg-gray-900/80" />
                            )}
                        </div>
                            <div className="min-w-0">
                                <div className="font-bold text-sm flex items-center gap-1 truncate">
                                    <Flag code={myProfile?.country} />
                                    <span className="hidden sm:inline truncate">{myProfile?.nickname}</span>
                                </div>
                                <AnimatedScore value={displayMyScore} useGrouping={false} className="text-2xl font-black text-blue-400 font-mono" />
                            </div>
                    </div>

                    {/* Center Timer */}
                    <div className="flex flex-col items-center flex-shrink-0 px-2 pt-2">
                        {gameState.mode !== 'practice' && (
                            <div className="flex flex-col items-center mb-0.5">
                                <div className="text-xs font-bold text-blue-500 dark:text-blue-300 tracking-wider uppercase whitespace-nowrap">
                                    {t('game.table.round')} {gameState.currentRound}/{gameState.totalRounds}
                                </div>
                            </div>
                        )}
                        <div
                            key={gameState.remainingTime <= 10 ? 'urgent' : 'normal'}
                            className={`text-4xl font-black font-mono tracking-wider ${gameState.remainingTime <= 10 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}
                        >
                            {Math.floor(gameState.remainingTime)}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-gray-400 font-bold uppercase tracking-wider">{t('game.timeLeft')}</div>
                    </div>

                    {/* Opponent Profile - Hide in Solo Practice */}
                    <div className="flex items-center justify-end gap-2 flex-1 min-w-0 text-right pt-2 relative">
                        {opponentProfile && (
                            <>
                                <div className="min-w-0">
                                    <div className="font-bold text-sm flex items-center justify-end gap-1 truncate">
                                        <span className="hidden sm:inline truncate">{opponentProfile?.nickname}</span>
                                        <Flag code={opponentProfile?.country} />
                                    </div>
                                    <AnimatedScore value={displayOpScore} useGrouping={false} className="text-2xl font-black text-red-400 font-mono" />
                                </div>
                                <div className="relative flex-shrink-0">
                                    {opponentProfile?.avatar_url ? (
                                        <img src={opponentProfile.avatar_url} className={`w-11 h-11 rounded-full border-2 object-cover ${!isOpponentOnline ? 'border-gray-500 grayscale opacity-50' : 'border-red-500'}`} />
                                    ) : (
                                        <div className={`w-11 h-11 rounded-full border-2 flex items-center justify-center bg-white dark:bg-gray-800 ${!isOpponentOnline ? 'border-gray-500 text-gray-500' : 'border-red-500 text-red-500'}`}>
                                            <User size={20} />
                                        </div>
                                    )}
                                    {!isOpponentOnline && gameState.status !== 'finished' && (
                                        <div className="absolute -bottom-2 -right-2 bg-red-600 text-slate-900 dark:text-white text-[10px] font-bold px-1.5 py-0.5 rounded animate-pulse border border-red-400 whitespace-nowrap z-50">
                                            {t('game.disconnected')}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                        {!opponentProfile && gameState.mode === 'practice' && (
                            <div className="text-gray-500 font-bold uppercase tracking-widest text-xs">
                                Practice
                            </div>
                        )}
                    </div>
                </header>
            )}

            {isConnectionUnstable && (
                <div className="absolute top-24 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-yellow-100 dark:bg-yellow-500/20 border border-yellow-400/40 text-yellow-800 dark:text-yellow-100 text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-md shadow-md dark:shadow-none">
                    <span className="w-3 h-3 rounded-full border-2 border-yellow-500 dark:border-yellow-200 border-t-transparent animate-spin" />
                    <span>{connectionLabel}</span>
                </div>
            )}

            {/* Round Finished Overlay (Standalone - shows during transition) */}
            {showRoundFinished && gameState.mode !== 'practice' && (
                <div className="absolute inset-0 z-[65] pointer-events-none">
                    <div className="absolute inset-0 bg-black/20" />
                    <div className="absolute inset-x-0 top-32 flex items-center justify-center">
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="text-4xl sm:text-5xl font-black text-slate-900 dark:text-white/80 uppercase tracking-widest font-mono"
                        >
                            {t('game.roundFinished')}
                        </motion.div>
                    </div>
                </div>
            )}

            {/* Main Game Area */}
            <main className="flex-1 relative flex items-center justify-center bg-gradient-to-br from-slate-100 via-slate-200 to-slate-300 dark:from-gray-900 dark:via-gray-800 dark:to-black">
                {/* Background Scoreboard (play tension UI) */}
                {(isPlaying || showRoundFinished) && (
                    <div className="absolute inset-0 pointer-events-none z-0 select-none overflow-hidden">
                        {/* Score Ratio Background */}
                        <div className="absolute inset-0 pointer-events-none flex opacity-20">
                            {/* Blue Side (My Score) */}
                            <div
                                className={`relative h-full overflow-hidden transition-[width,background-color] duration-300 ease-out ${isMyBackdropScoreFlashing ? 'bg-blue-400/42' : 'bg-blue-500/22'}`}
                                style={{
                                    width: `${displayMyScore === 0 && displayOpScore === 0 ? 50 : (displayMyScore / (displayMyScore + displayOpScore)) * 100}%`
                                }}
                            >
                                <div
                                    className={`absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-blue-200/35 to-transparent transition-opacity duration-200 ${isMyBackdropScoreFlashing ? 'opacity-100' : 'opacity-0'}`}
                                />
                            </div>
                            {/* Red Side (Op Score) */}
                            <div
                                className={`relative h-full overflow-hidden transition-[width,background-color] duration-300 ease-out ${isOpBackdropScoreFlashing ? 'bg-red-400/42' : 'bg-red-500/22'}`}
                                style={{
                                    width: `${displayMyScore === 0 && displayOpScore === 0 ? 50 : (displayOpScore / (displayMyScore + displayOpScore)) * 100}%`
                                }}
                            >
                                <div
                                    className={`absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-red-200/35 to-transparent transition-opacity duration-200 ${isOpBackdropScoreFlashing ? 'opacity-100' : 'opacity-0'}`}
                                />
                            </div>
                        </div>

                        <div className="absolute inset-0 flex items-start justify-between px-4 sm:px-8 pt-32">
                            <div
                                className={`w-[42%] font-black font-mono tabular-nums tracking-tight leading-none transition-all duration-300 ${backdropScoreSizeClass}
                                    ${displayMyScore >= displayOpScore ? 'text-blue-400' : 'text-blue-400'}
                                    ${showRoundFinished ? 'opacity-90' : 'opacity-10'}
                                    ${isMyBackdropScoreFlashing ? 'scale-[1.03] opacity-20' : ''}`}
                            >
                                <AnimatedScore value={displayMyScore} duration={360} useGrouping={false} />
                            </div>
                            <div
                                className={`w-[42%] font-black font-mono tabular-nums tracking-tight leading-none text-right transition-all duration-300 ${backdropScoreSizeClass}
                                    ${displayOpScore > displayMyScore ? 'text-red-400' : 'text-red-400'}
                                    ${showRoundFinished ? 'opacity-90' : 'opacity-10'}
                                    ${isOpBackdropScoreFlashing ? 'scale-[1.03] opacity-20' : ''}`}
                            >
                                <AnimatedScore value={displayOpScore} duration={360} useGrouping={false} />
                            </div>
                        </div>
                    </div>
                )}
                {(isPlaying || showRoundFinished || (isFinished && !showFinalResult)) && gameState.mode !== 'practice' && (
                    <div className="absolute inset-0 pointer-events-none z-0 select-none overflow-hidden">
                        <div className="absolute inset-x-0 flex items-start justify-between px-4 sm:px-8 pt-[4.0rem]">
                            <div className="w-[42%] flex gap-2 justify-start">
                                {Array.from({ length: requiredWins }).map((_, idx) => {
                                    const isAlive = idx < displayedLives.my;
                                    const isOn = (isFinished || showRoundFinished)
                                        ? (backdropHeartOn.my[idx] ?? true)
                                        : isAlive;
                                    return (
                                        <Heart
                                            key={`bg-heart-my-${idx}`}
                                            className={`w-[clamp(38px,6vw,74px)] h-[clamp(38px,6vw,74px)] text-blue-400 transition-opacity duration-120 ${showRoundFinished ? (isOn ? 'opacity-80' : 'opacity-24') : (isOn ? 'opacity-30' : 'opacity-0')}`}
                                            strokeWidth={2.1}
                                        />
                                    );
                                })}
                            </div>
                            <div className="w-[42%] flex gap-2 justify-end">
                                {Array.from({ length: requiredWins }).map((_, idx) => {
                                    const isAlive = idx >= (requiredWins - displayedLives.op);
                                    const isOn = (isFinished || showRoundFinished)
                                        ? (backdropHeartOn.op[idx] ?? true)
                                        : isAlive;
                                    return (
                                        <Heart
                                            key={`bg-heart-op-${idx}`}
                                            className={`w-[clamp(38px,6vw,74px)] h-[clamp(38px,6vw,74px)] text-red-400 transition-opacity duration-120 ${showRoundFinished ? (isOn ? 'opacity-80' : 'opacity-24') : (isOn ? 'opacity-30' : 'opacity-0')}`}
                                            strokeWidth={2.1}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Waiting Screen */}
                {isWaiting && !skipWaiting && (
                    <div className="absolute inset-0 flex flex-col items-center pb-44">
                        {/* Background gradients */}
                        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/10 via-transparent to-red-500/10 dark:from-blue-900/30 dark:via-transparent dark:to-red-900/30 pointer-events-none" />

                        {/* My Profile - Top */}
                        <div className="mt-4 flex flex-col items-center">
                            <div className="flex items-center gap-3 bg-slate-50 dark:bg-gray-900/70 border border-blue-400/30 rounded-2xl px-5 py-3 shadow-xl backdrop-blur-sm">
                                <Flag code={myProfile?.country} className="w-6 h-4" />
                                <span className="text-base font-bold text-slate-900 dark:text-white">{myProfile?.nickname || t('game.unknownPlayer')}</span>
                                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-blue-500 bg-white dark:bg-gray-800 flex items-center justify-center">
                                    {myProfile?.avatar_url ? (
                                        <img src={myProfile.avatar_url} className="w-full h-full object-cover" />
                                    ) : (
                                        <User size={20} className="text-blue-500" />
                                    )}
                                </div>
                            </div>
                            <TierMMRBadge
                                mmr={myProfile?.mmr}
                                className="mt-1"
                            />
                        </div>

                        {/* Hex Radar - Center with Labels */}
                        <div className="flex-1 flex items-center justify-center">
                            <div className="relative bg-slate-50 dark:bg-gray-900/60 border border-white/10 rounded-3xl p-3 shadow-2xl backdrop-blur-sm">
                                <HexRadar
                                    values={myRadarStats}
                                    compareValues={opRadarStats}
                                    labels={radarLabels}
                                    size={180}
                                    showLabels={true}
                                    primaryColor={{ fill: 'rgba(59,130,246,0.28)', stroke: 'rgba(59,130,246,0.95)' }}
                                    compareColor={{ fill: 'rgba(239,68,68,0.25)', stroke: 'rgba(239,68,68,0.95)' }}
                                />
                            </div>
                        </div>

                        {/* Opponent Profile - Above Emoji Bar (mirrored layout) */}
                        <div className="mb-4 flex flex-col items-center">
                            <TierMMRBadge
                                mmr={opponentProfile?.mmr}
                                className="mb-1"
                            />
                            <div className="flex items-center gap-3 bg-slate-50 dark:bg-gray-900/70 border border-red-400/30 rounded-2xl px-5 py-3 shadow-xl backdrop-blur-sm">
                                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-red-500 bg-white dark:bg-gray-800 flex items-center justify-center">
                                    {opponentProfile?.avatar_url ? (
                                        <img src={opponentProfile.avatar_url} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-white dark:bg-gray-800 text-red-500">
                                            <User size={20} />
                                        </div>
                                    )}
                                </div>
                                <span className="text-base font-bold text-slate-900 dark:text-white">{opponentProfile?.nickname || t('game.opponentWaiting')}</span>
                                <Flag code={opponentProfile?.country} className="w-6 h-4" />
                            </div>
                        </div>
                    </div>
                )}

                {/* Playing Area */}
                {(isPlaying || isCountdown) && gameState.gameType && (
                    <motion.div
                        key="gameContainer"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full h-full p-4 relative"
                    >
                        {/* WARM UP OVERLAY */}
                        {showWarmupOverlay && (
                            <div className="absolute inset-0 bg-white/95 dark:bg-black/90 z-50 flex flex-col items-center justify-center p-8 text-center backdrop-blur-sm">
                                {IS_DEV && isBotId(opponentId) && botRoundDebugPreview && (
                                    <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[min(92vw,28rem)] rounded-2xl border border-amber-400/30 bg-black/55 px-4 py-3 text-xs font-mono text-amber-100 shadow-lg backdrop-blur-sm">
                                        <div className="mb-1 text-[10px] font-black uppercase tracking-[0.24em] text-amber-300/80">
                                            {t('game.devGhostPreview')}
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-amber-200/80">{t('game.devGhostPreviewGame')}</span>
                                            <span className="font-black text-white">{botRoundDebugPreview.gameType}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-amber-200/80">{t('game.devGhostPreviewRoundHighscore')}</span>
                                            <span className="font-black text-blue-300">{botRoundDebugPreview.myBestScore.toLocaleString()}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-amber-200/80">{t('game.devGhostPreviewBotGhost')}</span>
                                            <span className="font-black text-red-300">{botRoundDebugPreview.botGhostScore.toLocaleString()}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-amber-200/80">{t('game.devGhostPreviewGap')}</span>
                                            <span className={`font-black ${botRoundDebugPreview.gap >= 0 ? 'text-red-200' : 'text-blue-200'}`}>
                                                {botRoundDebugPreview.gap >= 0 ? '+' : ''}{botRoundDebugPreview.gap.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                )}
                                <motion.div
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 2, opacity: 0 }}
                                    className="flex flex-col items-center"
                                >
                                    {/* Previous round result removed */}
                                    <h2 className="w-full max-w-[94vw] font-black text-amber-500 dark:text-yellow-400 mb-6 drop-shadow-lg flex flex-col items-center">
                                        <span className="text-3xl text-slate-900 dark:text-white mb-2">{t('game.table.round')} {gameState.currentRound}</span>
                                        <span className="block w-full text-center whitespace-nowrap text-[clamp(1.4rem,8vw,3.75rem)] leading-none px-3">
                                            {gameState.gameType === 'RPS' && t('rps.title')}
                                            {gameState.gameType === 'NUMBER' && t('number.title')}
                                            {gameState.gameType === 'NUMBER_DESC' && t('number.titleDesc')}
                                            {gameState.gameType === 'MATH' && t('math.title')}
                                            {gameState.gameType === 'TEN' && t('ten.title')}
                                            {gameState.gameType === 'COLOR' && t('color.title')}
                                            {gameState.gameType === 'MEMORY' && t('memory.title')}
                                            {gameState.gameType === 'SEQUENCE' && t('sequence.title')}
                                            {gameState.gameType === 'SEQUENCE_NORMAL' && t('sequence.titleNormal')}
                                            {gameState.gameType === 'LARGEST' && t('largest.title')}
                                            {gameState.gameType === 'PAIR' && t('pair.title')}
                                            {gameState.gameType === 'UPDOWN' && t('updown.title')}
                                            {gameState.gameType === 'SLIDER' && t('slider.title')}
                                            {gameState.gameType === 'ARROW' && t('arrow.title')}
                                            {gameState.gameType === 'BLANK' && t('fillBlanks.title')}
                                            {gameState.gameType === 'OPERATOR' && t('findOperator.title')}
                                            {gameState.gameType === 'LADDER' && t('ladder.title')}
                                            {gameState.gameType === 'TAP_COLOR' && t('tapTheColor.title')}
                                            {gameState.gameType === 'AIM' && t('aim.title')}
                                            {gameState.gameType === 'MOST_COLOR' && t('mostColor.title')}
                                            {gameState.gameType === 'SORTING' && t('sorting.title')}
                                            {gameState.gameType === 'SPY' && t('spy.title')}
                                            {gameState.gameType === 'PATH' && t('path.title')}
                                            {gameState.gameType === 'BALLS' && t('balls.title')}
                                            {gameState.gameType === 'BLIND_PATH' && t('blindPath.title')}
                                            {gameState.gameType === 'CATCH_COLOR' && t('catchColor.title')}
                                            {gameState.gameType === 'TIMING_BAR' && t('timingBar.title')}
                                            {gameState.gameType === 'COLOR_TIMING' && t('colorTiming.title', '컬러 타이밍')}
                                            {gameState.gameType === 'STAIRWAY' && t('stairway.title', '천국의 계단')}
                                            {gameState.gameType === 'MAKE_ZERO' && t('zero.title', '0을 만들어라')}
                                        </span>
                                    </h2>
                                    <p className="text-2xl text-slate-700 dark:text-white/80 mb-12 font-bold max-w-2xl">
                                        {gameState.gameType === 'RPS' && t('rps.instruction')}
                                        {gameState.gameType === 'NUMBER' && t('number.instruction')}
                                        {gameState.gameType === 'NUMBER_DESC' && t('number.instructionDesc')}
                                        {gameState.gameType === 'MATH' && t('math.instruction')}
                                        {gameState.gameType === 'TEN' && t('ten.instruction')}
                                        {gameState.gameType === 'COLOR' && t('color.instruction')}
                                        {gameState.gameType === 'MEMORY' && t('memory.instruction')}
                                        {gameState.gameType === 'SEQUENCE' && t('sequence.instruction')}
                                        {gameState.gameType === 'SEQUENCE_NORMAL' && t('sequence.instructionNormal')}
                                        {gameState.gameType === 'LARGEST' && t('largest.instruction')}
                                        {gameState.gameType === 'PAIR' && t('pair.instruction')}
                                        {gameState.gameType === 'UPDOWN' && t('updown.instruction')}
                                        {gameState.gameType === 'SLIDER' && t('slider.instruction')}
                                        {gameState.gameType === 'ARROW' && t('arrow.instruction')}
                                        {gameState.gameType === 'BLANK' && t('fillBlanks.instruction')}
                                        {gameState.gameType === 'OPERATOR' && t('findOperator.instruction')}
                                        {gameState.gameType === 'LADDER' && t('ladder.instruction')}
                                        {gameState.gameType === 'TAP_COLOR' && t('tapTheColor.memorize')}
                                        {gameState.gameType === 'AIM' && t('aim.instruction')}
                                        {gameState.gameType === 'MOST_COLOR' && t('mostColor.instruction')}
                                        {gameState.gameType === 'SORTING' && t('sorting.instruction')}
                                        {gameState.gameType === 'SPY' && t('spy.instruction')}
                                        {gameState.gameType === 'PATH' && t('path.instruction')}
                                        {gameState.gameType === 'BALLS' && t('balls.instruction')}
                                        {gameState.gameType === 'BLIND_PATH' && t('blindPath.instruction')}
                                        {gameState.gameType === 'CATCH_COLOR' && t('catchColor.instruction')}
                                        {gameState.gameType === 'TIMING_BAR' && t('timingBar.instruction')}
                                        {gameState.gameType === 'COLOR_TIMING' && t('colorTiming.instruction', '왼쪽은 파란 공, 오른쪽은 빨간 공이 원 안에 들어올 때 누르세요. 색이 반대면 감점됩니다.')}
                                        {gameState.gameType === 'STAIRWAY' && t('stairway.instruction', '올바른 방향을 터치해 계단을 올라가세요!')}
                                        {gameState.gameType === 'MAKE_ZERO' && t('zero.instruction', '숫자를 채워 0을 만드세요')}
                                    </p>
                                </motion.div>
                            </div>
                        )}

                        <div className="w-full h-full select-none minigame-area">
                            {isGameplayInteractable && (
                                <>
                                    {gameState.gameType === 'RPS' && (
                                        <RockPaperScissors seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'NUMBER' && (
                                        <NumberSortGame mode="asc" seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'NUMBER_DESC' && (
                                        <NumberSortGame mode="desc" seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'MATH' && (
                                        <MathChallenge seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'TEN' && (
                                        <MakeTen seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'COLOR' && (
                                        <ColorMatch seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'MEMORY' && (
                                        <MemoryMatch seed={gameState.seed || ''} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'SEQUENCE' && (
                                        <SequenceGame
                                            mode="reverse"
                                            seed={gameState.seed}
                                            onScore={incrementScore}
                                            isPlaying={isGameplayInteractable}
                                        />
                                    )}
                                    {gameState.gameType === 'SEQUENCE_NORMAL' && (
                                        <SequenceGame
                                            mode="forward"
                                            seed={gameState.seed}
                                            onScore={incrementScore}
                                            isPlaying={isGameplayInteractable}
                                        />
                                    )}
                                    {gameState.gameType === 'LARGEST' && (
                                        <FindLargest seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'PAIR' && (
                                        <FindPair seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'UPDOWN' && (
                                        <NumberUpDown seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'SLIDER' && (
                                        <NumberSlider seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'ARROW' && (
                                        <ArrowSlider seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'BLANK' && (
                                        <FillBlanks seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'OPERATOR' && (
                                        <FindOperator seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'LADDER' && (
                                        <LadderGame seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'TAP_COLOR' && (
                                        <TapTheColor seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'AIM' && (
                                        <AimingGame seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'MOST_COLOR' && (
                                        <FindMostColor seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'SORTING' && (
                                        <SortingGame seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'SPY' && (
                                        <FindTheSpy seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'PATH' && (
                                        <PathRunner seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'BALLS' && (
                                        <BallCounter seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'BLIND_PATH' && (
                                        <BlindPathRunner seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'CATCH_COLOR' && (
                                        <CatchColor seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'TIMING_BAR' && (
                                        <TimingBar
                                            onScore={incrementScore}
                                            isPlaying={isGameplayInteractable}
                                            remainingTime={gameState.remainingTime}
                                        />
                                    )}
                                    {gameState.gameType === 'COLOR_TIMING' && (
                                        <ColorTiming
                                            onScore={incrementScore}
                                            isPlaying={isGameplayInteractable}
                                        />
                                    )}
                                    {gameState.gameType === 'STAIRWAY' && (
                                        <StairwayGame seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                    {gameState.gameType === 'MAKE_ZERO' && (
                                        <MakeZero seed={gameState.seed} onScore={incrementScore} isPlaying={isGameplayInteractable} />
                                    )}
                                </>
                            )}
                        </div>
                    </motion.div>
                )}


                {/* Result Overlay */}
                {showFinalResult && (
                    <div className="absolute inset-0 bg-white/90 dark:bg-black/80 backdrop-blur-md z-50 overflow-y-auto">
                        <div className="min-h-full flex flex-col items-center justify-center p-4">
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className={`relative p-8 rounded-3xl border-4 shadow-2xl text-center max-w-2xl w-full overflow-hidden ${gameState.mode === 'practice'
                                    ? 'bg-white dark:bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_42%),linear-gradient(180deg,_rgba(31,41,55,0.94),_rgba(15,23,42,0.96))] border-green-300 dark:border-white/10'
                                    : isMatchWin
                                        ? 'bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.32),_transparent_42%),linear-gradient(180deg,_rgba(30,58,138,0.92),_rgba(15,23,42,0.96))] border-blue-300/25'
                                        : isMatchLoss
                                            ? 'bg-[radial-gradient(circle_at_top,_rgba(248,113,113,0.28),_transparent_42%),linear-gradient(180deg,_rgba(127,29,29,0.92),_rgba(24,24,27,0.96))] border-red-300/20'
                                            : 'bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_42%),linear-gradient(180deg,_rgba(31,41,55,0.94),_rgba(15,23,42,0.96))] border-white/10'
                                    }`}
                            >
                                {gameState.mode === 'practice' ? (
                                    <div className="text-center">
                                        <h2 className="text-5xl font-black mb-4 text-green-600 dark:text-green-400 tracking-wider">
                                            {t('game.practiceComplete', '연습 완료!')}
                                        </h2>
                                        <div className="text-2xl text-slate-700 dark:text-white mb-8">
                                            {/* Show Score or Time based on game type if tracked, currently just completion */}
                                            <p>{t('game.greatJob', '수고하셨습니다!')}</p>
                                        </div>
                                        <motion.button
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.5 }}
                                            onClick={() => navigate('/practice')}
                                            className="px-8 py-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-xl transition-all shadow-lg hover:shadow-green-500/50"
                                        >
                                            {t('game.returnMenu')}
                                        </motion.button>
                                    </div>
                                ) : (
                                    /* NORMAL / RANK MODE RESULT */
                                    <>
                                        {(canAddFriendOpponent || canReportOpponent) && (
                                            <div className="absolute top-4 right-4 z-20">
                                                <button
                                                    onClick={() => setIsResultActionsOpen((prev) => !prev)}
                                                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-700 dark:text-gray-200 transition-colors"
                                                    title={t('common.more', '더보기')}
                                                >
                                                    <MoreHorizontal className="w-5 h-5" />
                                                </button>
                                                {isResultActionsOpen && (
                                                    <div className="absolute right-0 mt-2 w-40 bg-slate-50 dark:bg-gray-900 border border-white/10 rounded-xl p-1.5 shadow-xl text-left">
                                                        {canAddFriendOpponent && (
                                                            <button
                                                                onClick={handleAddFriend}
                                                                className="w-full px-3 py-2 rounded-lg text-sm text-green-300 hover:bg-green-600/20 transition-colors"
                                                            >
                                                                {t('social.addFriend')}
                                                            </button>
                                                        )}
                                                        {canReportOpponent && (
                                                            <button
                                                                onClick={() => {
                                                                    setIsResultActionsOpen(false);
                                                                    setIsReportModalOpen(true);
                                                                }}
                                                                className="w-full px-3 py-2 rounded-lg text-sm text-red-300 hover:bg-red-600/20 transition-colors"
                                                            >
                                                                {t('report.button', '신고')}
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {/* MATCH RESULT Header Removed */}

                                        {/* VICTORY / DEFEAT TEXT - SLAM ANIMATION (After Rounds) */}
                                        <motion.div
                                            initial={{ scale: 5, opacity: 0, rotate: -10 }}
                                            animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                            transition={{
                                                delay: 0.2 + (gameState.roundScores.length + 1) * 0.4,
                                                type: "spring", stiffness: 200, damping: 15
                                            }}
                                            className="mb-8 w-full grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 md:gap-5"
                                        >
                                            <motion.div
                                                className={`relative overflow-hidden justify-self-start min-w-0 max-w-[170px] md:max-w-[240px] rounded-xl border bg-slate-50/80 dark:bg-gray-900/70 px-2 py-2 md:px-3 md:py-2.5 ${isMyWinnerCard ? 'border-amber-300/80 ring-1 ring-amber-300/50 dark:ring-amber-300/35' : 'border-blue-300/30'}`}
                                            >
                                                {isMyWinnerCard && (
                                                    <motion.div
                                                        className="absolute inset-y-0 -left-1/2 w-1/2 pointer-events-none"
                                                        initial={{ x: '-130%' }}
                                                        animate={{ x: '300%' }}
                                                        transition={{ duration: 1.9, repeat: Infinity, ease: 'linear' }}
                                                        style={{ background: 'linear-gradient(105deg, rgba(255,255,255,0) 0%, rgba(251,191,36,0.0) 20%, rgba(251,191,36,0.35) 50%, rgba(255,255,255,0) 85%)' }}
                                                    />
                                                )}
                                                <div className="relative z-10">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <Flag code={myProfile?.country} className="w-5 h-3.5 shrink-0" />
                                                        <span
                                                            className="text-xs md:text-sm font-bold text-slate-900 dark:text-white truncate min-w-0 max-w-[90px] md:max-w-[140px]"
                                                            title={myProfile?.nickname || t('game.unknownPlayer')}
                                                        >
                                                            {myProfile?.nickname || t('game.unknownPlayer')}
                                                        </span>
                                                    </div>
                                                    <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-blue-100/80 dark:bg-blue-500/20 px-1.5 py-0.5 text-[10px] md:text-xs font-bold text-blue-800 dark:text-blue-200">
                                                        <MyFinalTierIcon className="w-3 h-3 md:w-3.5 md:h-3.5" />
                                                        <span>{myFinalTier}</span>
                                                    </div>
                                                </div>
                                            </motion.div>

                                            <div className="flex flex-col items-center px-2">
                                                <h3 className={`text-4xl md:text-6xl font-black tracking-[0.08em] drop-shadow-2xl ${isMatchWin
                                                    ? 'text-blue-300'
                                                    : isMatchLoss
                                                        ? 'text-red-300'
                                                        : 'text-slate-200'
                                                    }`}>
                                                    {myWinsForLives} : {opWinsForLives}
                                                </h3>
                                                <p className="mt-2 text-xs md:text-sm font-semibold tracking-[0.2em] text-slate-900 dark:text-white/60">
                                                    {t('game.setScore', '세트 스코어')}
                                                </p>
                                            </div>

                                            <motion.div
                                                className={`relative overflow-hidden justify-self-end min-w-0 max-w-[170px] md:max-w-[240px] rounded-xl border bg-slate-50/80 dark:bg-gray-900/70 px-2 py-2 md:px-3 md:py-2.5 text-right ${isOpWinnerCard ? 'border-amber-300/80 ring-1 ring-amber-300/50 dark:ring-amber-300/35' : 'border-red-300/30'}`}
                                            >
                                                {isOpWinnerCard && (
                                                    <motion.div
                                                        className="absolute inset-y-0 -left-1/2 w-1/2 pointer-events-none"
                                                        initial={{ x: '-130%' }}
                                                        animate={{ x: '300%' }}
                                                        transition={{ duration: 1.9, repeat: Infinity, ease: 'linear' }}
                                                        style={{ background: 'linear-gradient(105deg, rgba(255,255,255,0) 0%, rgba(251,191,36,0.0) 20%, rgba(251,191,36,0.35) 50%, rgba(255,255,255,0) 85%)' }}
                                                    />
                                                )}
                                                <div className="relative z-10">
                                                    <div className="flex items-center justify-end gap-1.5 min-w-0">
                                                        <span
                                                            className="text-xs md:text-sm font-bold text-slate-900 dark:text-white truncate min-w-0 max-w-[90px] md:max-w-[140px]"
                                                            title={opponentProfile?.nickname || t('game.unknownPlayer')}
                                                        >
                                                            {opponentProfile?.nickname || t('game.unknownPlayer')}
                                                        </span>
                                                        <Flag code={opponentProfile?.country} className="w-5 h-3.5 shrink-0" />
                                                    </div>
                                                    <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-red-100/80 dark:bg-red-500/20 px-1.5 py-0.5 text-[10px] md:text-xs font-bold text-red-800 dark:text-red-200">
                                                        <OpFinalTierIcon className="w-3 h-3 md:w-3.5 md:h-3.5" />
                                                        <span>{opFinalTier}</span>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        </motion.div>

                                        {/* Scoreboard Table */}
                                        <div className="w-full bg-slate-50 dark:bg-gray-900/50 rounded-xl overflow-hidden mb-4 md:mb-8 border border-white/5">
                                            <div className="grid grid-cols-3 bg-white dark:bg-gray-800 p-2 md:p-3 text-[10px] md:text-xs font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest">
                                                <div className="text-left pl-4">{t('game.table.round')}</div>
                                                <div>{t('game.table.myScore')}</div>
                                                <div>{t('game.table.opScore')}</div>
                                            </div>
                                            {gameState.roundScores.map((round, idx) => {
                                                const myS = gameState.isPlayer1 ? round.p1_score : round.p2_score;
                                                const opS = gameState.isPlayer1 ? round.p2_score : round.p1_score;
                                                const totalS = myS + opS;
                                                const myRatio = totalS > 0 ? (myS / totalS) * 100 : 50;

                                                return (
                                                    <motion.div
                                                        key={idx}
                                                        initial={{ opacity: 0, x: -50 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: 0.5 + idx * 0.4 }}
                                                        className="grid grid-cols-3 p-2 md:p-4 border-t border-white/5 items-center font-mono relative overflow-hidden"
                                                    >
                                                        {/* Background Bar */}
                                                        <div className="absolute inset-0 z-0 opacity-10">
                                                            {/* Left (Blue) - Anchored Left */}
                                                            <motion.div
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${myRatio}%` }}
                                                                transition={{ delay: 0.5 + idx * 0.4, duration: 0.8, ease: "easeOut" }}
                                                                className="absolute left-0 top-0 h-full bg-blue-500"
                                                            />
                                                            {/* Right (Red) - Anchored Right */}
                                                            <motion.div
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${100 - myRatio}%` }}
                                                                transition={{ delay: 0.5 + idx * 0.4, duration: 0.8, ease: "easeOut" }}
                                                                className="absolute right-0 top-0 h-full bg-red-500"
                                                            />
                                                        </div>

                                                        <div className="text-left pl-2 md:pl-4 text-slate-900 dark:text-white font-bold relative z-10 text-xs md:text-sm truncate pr-2">{getRoundGameTitle(round?.game_type)}</div>
                                                        <div className="text-blue-400 font-bold text-base md:text-lg relative z-10">{myS}</div>
                                                        <div className="text-red-400 font-bold text-base md:text-lg relative z-10">{opS}</div>
                                                    </motion.div>
                                                );
                                            })}
                                            {/* TOTAL */}
                                            <motion.div
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.5 + gameState.roundScores.length * 0.4 }}
                                                className="grid grid-cols-3 p-2 md:p-4 bg-white/5 border-t-2 border-white/10 items-center font-mono"
                                            >
                                                <div className="text-left pl-2 md:pl-4 text-yellow-400 font-black text-sm md:text-base">{t('game.total')}</div>
                                                <div className="text-blue-400 font-black text-base md:text-xl">{totalScores.my}</div>
                                                <div className="text-red-400 font-black text-base md:text-xl">{totalScores.op}</div>
                                            </motion.div>
                                        </div>

                                        {/* Rank Result Animation */}
                                        {gameState.mode === 'rank' && displayMMR !== null && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                transition={{ delay: 0.8 + gameState.roundScores.length * 0.4 }}
                                                className="mb-8 p-4 bg-white/10 rounded-xl border border-white/20 overflow-hidden"
                                            >
                                                <div className="flex items-center justify-center gap-4 text-3xl font-black">
                                                    <div className="text-slate-900 dark:text-white">{displayMMR}</div>
                                                    {mmrDelta !== null && mmrDelta !== 0 && (
                                                        <div className="flex flex-col items-start">
                                                            <motion.div
                                                                initial={{ opacity: 0, y: 10 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                transition={{ delay: 0.5 }}
                                                                className={`text-2xl ${mmrDelta > 0 ? 'text-green-400' : 'text-red-400'}`}
                                                            >
                                                                {mmrDelta > 0 ? `+${mmrDelta}` : mmrDelta}
                                                            </motion.div>
                                                            {streakBonus > 0 && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, y: 5 }}
                                                                    animate={{ opacity: 1, y: 0 }}
                                                                    transition={{ delay: 1.0 }}
                                                                    className="text-xs text-yellow-400 font-bold flex items-center gap-1"
                                                                >
                                                                    🔥 {t('streak.bonusIncluded', '연승 보너스 +{{bonus}}', { bonus: streakBonus })}
                                                                </motion.div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}

                                        <div className="w-full bg-slate-100 dark:bg-black/20 rounded-xl p-4 mb-6 border border-slate-200 dark:border-white/5">
                                            <div className="grid grid-cols-4 gap-3">
                                                {[...emojiRowTop, ...emojiRowBottom].map((emoji) => (
                                                    <button
                                                        key={emoji}
                                                        onClick={() => handleEmojiSend(emoji)}
                                                        className="aspect-square rounded-xl bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center transition active:scale-95 border border-slate-200 dark:border-white/5 shadow-sm dark:shadow-none"
                                                    >
                                                        {renderEmojiButton(emoji, 'text-[2.35rem]')}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className={`grid gap-2 ${canShowRematch ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                            {canShowRematch && (
                                                <motion.button
                                                    initial={{ opacity: 0, y: 20 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: 1.5 + (gameState.roundScores.length + 1) * 0.4 }}
                                                    onClick={handleRequestRematch}
                                                    disabled={!isButtonEnabled || isSubmittingRematch || isReturningToMenu || !!pendingRematchInviteId || isRematchClosed || !hasRematchPencils}
                                                    className={`w-full rounded-xl px-4 py-3 text-slate-900 dark:text-white transition-all ${!isButtonEnabled || isSubmittingRematch || isReturningToMenu || !!pendingRematchInviteId || isRematchClosed
                                                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed opacity-60'
                                                        : !hasRematchPencils
                                                            ? 'bg-red-500 hover:bg-red-600'
                                                            : 'bg-emerald-500 hover:bg-emerald-600'
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="text-left">
                                                            <div className="font-bold text-lg">
                                                                {!isButtonEnabled
                                                                    ? t('common.loading')
                                                                    : pendingRematchInviteId
                                                                        ? t('game.rematchPending', '응답 대기중')
                                                                        : isRematchClosed
                                                                            ? t('game.rematchClosed', '재대결 종료')
                                                                            : isSubmittingRematch
                                                                                ? t('common.loading')
                                                                                : t('game.rematchRequest', '재대결 신청')}
                                                            </div>
                                                            <div className="mt-1 flex items-center gap-2 text-xs text-slate-900 dark:text-white/85">
                                                                <img
                                                                    src="/images/icon/icon_pen.png"
                                                                    alt={t('ad.pencils', '연필')}
                                                                    className="h-4 w-4 object-contain"
                                                                />
                                                                <span>
                                                                    {isRematchClosed
                                                                        ? t('game.rematchExpiredShort', '종료')
                                                                        : myPencils !== null && myPencils < 1
                                                                            ? t('game.rematchNoPencilsShort', '부족')
                                                                            : t('game.rematchCostCountdownShort', '신청 1개 · {{seconds}}초', { seconds: rematchSecondsLeft })}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </motion.button>
                                            )}
                                            <motion.button
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 1.5 + (gameState.roundScores.length + 1) * 0.4 }}
                                                onClick={handleReturnMenu}
                                                disabled={!isButtonEnabled || isReturningToMenu}
                                                className={`w-full py-4 font-bold text-xl rounded-xl transition-all ${isButtonEnabled
                                                    ? 'bg-white text-black hover:bg-gray-200'
                                                    : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'
                                                    }`}
                                            >
                                                {isButtonEnabled
                                                    ? (isReturningToMenu ? t('common.loading') : t('game.returnMenu'))
                                                    : t('common.loading')}
                                            </motion.button>
                                        </div>
                                    </>
                                )}
                            </motion.div>
                        </div>
                    </div>
                )}
                <ReportReasonModal
                    isOpen={isReportModalOpen}
                    targetName={opponentProfile?.nickname || t('game.unknownPlayer')}
                    onClose={() => setIsReportModalOpen(false)}
                    onSubmit={handleSubmitReport}
                />

                {/* Lose Streak Pencil Reward Modal */}
                <AnimatePresence>
                    {showLosePencilModal && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6"
                            onClick={() => setShowLosePencilModal(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.7, opacity: 0, y: 30 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                                className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-3xl p-8 max-w-sm w-full border border-gray-600/50 shadow-2xl text-center"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="mb-4 flex justify-center">
                                    <img
                                        src="/images/icon/icon_pen.png"
                                        alt="Pencil"
                                        className="w-16 h-16 object-contain"
                                    />
                                </div>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3">
                                    {t('streak.loseBonusTitle', '3연패를 하셨네요...')}
                                </h3>
                                <p className="text-slate-600 dark:text-gray-300 text-sm leading-relaxed mb-2">
                                    {t('streak.loseBonusMessage', '위로의 마음을 담아 연필을 하나 드립니다.')}
                                </p>
                                <p className="text-gray-500 text-xs mb-6">
                                    {t('streak.loseBonusSubtext', '(계속 주는거 아니에요 그만 지세요 😅)')}
                                </p>
                                <div className="flex items-center justify-center gap-2 mb-6 py-3 px-4 bg-yellow-500/10 rounded-xl border border-yellow-500/20">
                                    <img
                                        src="/images/icon/icon_pen.png"
                                        alt="Pencil"
                                        className="w-7 h-7 object-contain"
                                    />
                                    <span className="text-yellow-400 font-bold text-lg">+1</span>
                                </div>
                                <button
                                    onClick={() => setShowLosePencilModal(false)}
                                    className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition active:scale-95"
                                >
                                    {t('common.ok', '확인')}
                                </button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Review Prompt Modal */}
                <ReviewPromptModal isOpen={showReviewPrompt} onClose={handleReviewPromptClose} />

                {showEmojiOverlay && (
                    <div className="absolute inset-0 z-[70] pointer-events-none">
                        <AnimatePresence>
                            {emojiBursts.map((item) => (
                                <motion.span
                                    key={item.id}
                                    style={{ top: `${item.baseY}%` }}
                                    className={`absolute -translate-y-1/2 ${item.side === 'left' ? 'left-6' : 'right-6'} inline-flex items-center justify-center w-28 h-28 drop-shadow-[0_8px_18px_rgba(0,0,0,0.35)]`}
                                    initial={{ opacity: 0, y: 0, x: item.side === 'left' ? -6 : 6, scale: 0.7 }}
                                    animate={{
                                        opacity: 1,
                                        y: item.driftY,
                                        x: (item.side === 'left' ? item.travelX : -item.travelX) + item.driftX,
                                        scale: 1
                                    }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    transition={{ duration: 1.1, ease: 'easeOut' }}
                                >
                                    {renderEmojiBurst(item.emoji, 'w-28 h-28')}
                                </motion.span>
                            ))}
                        </AnimatePresence>
                        {showEmojiBar && (
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto">
                                <div className="bg-white/80 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-2xl px-4 py-4 backdrop-blur-md w-[360px] max-w-[92vw] shadow-lg dark:shadow-none">
                                    <div className="grid grid-cols-4 gap-4 mb-4 justify-items-center">
                                        {emojiRowTop.map((emoji) => (
                                            <button
                                                key={emoji}
                                                onClick={() => handleEmojiSend(emoji)}
                                                className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition active:scale-95 flex items-center justify-center"
                                            >
                                                {renderEmojiButton(emoji, 'text-[2.35rem]')}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-4 gap-4 justify-items-center">
                                        {emojiRowBottom.map((emoji) => (
                                            <button
                                                key={emoji}
                                                onClick={() => handleEmojiSend(emoji)}
                                                className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition active:scale-95 flex items-center justify-center"
                                            >
                                                {renderEmojiButton(emoji, 'text-[2.35rem]')}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

export default Game;
