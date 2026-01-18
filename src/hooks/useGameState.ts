import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface GameState {
    status: 'waiting' | 'playing' | 'finished';
    gameType: 'RPS' | 'NUMBER' | 'MATH' | 'TEN' | 'COLOR' | 'MEMORY' | 'SEQUENCE' | null;
    seed: string | null;
    startAt: string | null;
    endAt: string | null;
    myScore: number;
    opScore: number;
    winnerId: string | null;
    remainingTime: number;
    // New Fields for 3-Game Set
    currentRound: number; // 1, 2, 3
    totalRounds: number;  // 3
    gameTypes: string[];
    roundScores: any[];
    isPlayer1: boolean;
    mode?: 'normal' | 'rank'; // Added mode
}

export const useGameState = (roomId: string, myId: string, opponentId: string) => {
    const [gameState, setGameState] = useState<GameState>({
        status: 'waiting',
        gameType: null,
        seed: null,
        startAt: null,
        endAt: null,
        myScore: 0,
        opScore: 0,
        winnerId: null,
        remainingTime: 30,
        currentRound: 1,
        totalRounds: 3,
        gameTypes: [],
        roundScores: [],
        isPlayer1: true
    });

    const [serverOffset, setServerOffset] = useState<number>(0);
    const scoreRef = useRef(0);
    const lastSyncedScore = useRef(0);
    const hasLocalScoreChanges = useRef(false);
    const [isWaitingTimeout, setIsWaitingTimeout] = useState(false);
    const isFinishing = useRef(false);

    // --- Time Sync ---
    useEffect(() => {
        const syncTime = async () => {
            const start = Date.now();
            const { data, error } = await supabase.rpc('get_server_time');
            const end = Date.now();
            if (data && !error) {
                const latency = (end - start) / 2;
                const serverTime = new Date(data).getTime();
                const offset = serverTime - (end - latency);
                setServerOffset(Math.round(offset));
            }
        };
        syncTime();
    }, []);

    // --- Host Logic ---
    const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
    const isHostUser = (() => {
        if (onlineUsers.length > 0) return myId < opponentId;
        return myId < opponentId; // Fallback
    })();

    // --- Game Loop Update ---
    const handleUpdate = useCallback((record: any) => {
        if (!record) return;

        const isP1 = myId === record.player1_id;
        const sP1 = record.player1_score;
        const sP2 = record.player2_score;

        const myServerScore = isP1 ? sP1 : sP2;
        const opServerScore = isP1 ? sP2 : sP1;

        if (record.status === 'finished') {
            console.log('Game FINISHED! Winner:', record.winner_id);
        }

        // Fix: Sync local score ref if server is ahead (e.g. reload or round transition)
        // This ensures that if we reload page in Round 2, we pick up the accumulated score
        if (!hasLocalScoreChanges.current && myServerScore > scoreRef.current) {
            scoreRef.current = myServerScore;
        }
        if (myServerScore === scoreRef.current) {
            hasLocalScoreChanges.current = false;
        }

        setGameState(prev => {
            // Ticker Logic Update
            let remaining = prev.remainingTime;
            if (record.end_at) {
                const now = Date.now() + serverOffset;
                const start = record.start_at ? new Date(record.start_at).getTime() : 0;
                const end = new Date(record.end_at).getTime();

                // If Warm-up phase (Now < Start): Keep remaining at 30 (or duration)
                if (now < start) {
                    remaining = 30; // Fixed duration
                } else {
                    remaining = Math.max(0, (end - now) / 1000);
                }
            }

            return {
                status: record.status,
                gameType: record.game_type,
                seed: record.seed,
                startAt: record.start_at,
                endAt: record.end_at,
                myScore: record.status === 'playing' ? scoreRef.current : myServerScore,
                opScore: opServerScore,
                winnerId: record.winner_id,
                remainingTime: remaining,
                currentRound: (record.current_round_index || 0) + 1,
                totalRounds: 3,
                gameTypes: record.game_types || [],
                roundScores: record.round_scores || [],
                isPlayer1: isP1,
                mode: record.mode || 'normal'
            };
        });
    }, [myId, serverOffset]);

    const startGame = useCallback(async () => {
        if (!roomId) return;
        // RPC Call
        await supabase.rpc('start_game', { p_room_id: roomId });
        // Fallback Fetch
        const { data } = await supabase.from('game_sessions').select('*').eq('id', roomId).maybeSingle();
        if (data) handleUpdate(data);
    }, [roomId, handleUpdate]);


    // --- Realtime Subscription ---
    useEffect(() => {
        if (!roomId) return;
        const channel = supabase.channel(`game_ta_${roomId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${roomId}` },
                payload => handleUpdate(payload.new)
            )
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const ids = Object.values(state).flat().map((p: any) => p.user_id);
                setOnlineUsers(Array.from(new Set(ids)) as string[]);
            })
            .subscribe(status => {
                if (status === 'SUBSCRIBED') {
                    channel.track({ user_id: myId });
                }
            });

        // Initial Fetch
        supabase.from('game_sessions').select('*').eq('id', roomId).maybeSingle().then(({ data }) => {
            if (data) handleUpdate(data);
        });

        return () => { supabase.removeChannel(channel); };
    }, [roomId, myId, handleUpdate]);


    // --- Host Auto Start Logic (Initial) ---
    useEffect(() => {
        if (!isHostUser) return;
        if (gameState.status === 'waiting') {
            const opponentHere = onlineUsers.includes(opponentId);
            if (opponentHere) {
                startGame();
            } else {
                const timer = setTimeout(() => startGame(), 5000); // Force start fallback
                return () => clearTimeout(timer);
            }
        }
    }, [isHostUser, gameState.status, onlineUsers, opponentId, roomId, startGame]);


    // --- Game Ticker & Host Enforcer ---
    useEffect(() => {
        if (gameState.status !== 'playing' || !gameState.endAt) return;

        const ticker = setInterval(async () => {
            const now = Date.now() + serverOffset;
            const start = gameState.startAt ? new Date(gameState.startAt).getTime() : 0;
            const end = new Date(gameState.endAt!).getTime();

            // Warm-up check
            if (now < start) {
                // In warm-up, we don't tick down the MAIN game timer yet
                setGameState(prev => ({ ...prev, remainingTime: 30 }));
                return;
            }

            const diff = (end - now) / 1000;
            const remaining = Math.max(0, diff);

            setGameState(prev => ({ ...prev, remainingTime: remaining }));

            // Host Logic: Finish Game
            if (isHostUser && diff <= -1) {
                if (!isFinishing.current) {
                    isFinishing.current = true;
                    console.log('Ticker: Time is up! FORCE SYNCING FINAL SCORE...');

                    // 1. Force Push Final Score
                    const { error: syncError } = await supabase.rpc('update_score', {
                        p_room_id: roomId,
                        p_player_id: myId,
                        p_score: scoreRef.current
                    });

                    if (syncError) console.error('FINAL SCORE SYNC ERROR:', syncError);
                    else console.log('FINAL SCORE SYNC SUCCESS');

                    // 2. Next Round or Finish
                    console.log('Ticker: Calling NEXT_ROUND...');
                    const { error: finishError } = await supabase.rpc('next_round', { p_room_id: roomId });

                    if (finishError) {
                        console.error('NEXT_ROUND ERROR:', finishError);
                        isFinishing.current = false; // Allow retry
                    } else {
                        console.log('NEXT_ROUND SUCCESS');
                    }
                }
            }
        }, 500);

        return () => clearInterval(ticker);
    }, [gameState.status, gameState.endAt, gameState.startAt, serverOffset, isHostUser, roomId, myId]);


    // --- Universal Poller (Safety Net) ---
    useEffect(() => {
        if (gameState.status === 'finished') return;
        const intervalMs = gameState.status === 'waiting' ? 1000 : 2000;

        const poller = setInterval(async () => {
            if (!roomId) return;
            const { data, error } = await supabase
                .from('game_sessions')
                .select('*')
                .eq('id', roomId)
                .maybeSingle();

            if (data && !error) {
                handleUpdate(data);
            }
        }, intervalMs);

        return () => clearInterval(poller);
    }, [gameState.status, roomId, handleUpdate]);


    // --- Waiting Timeout UI ---
    useEffect(() => {
        if (gameState.status === 'waiting') {
            const timer = setTimeout(() => setIsWaitingTimeout(true), 60000);
            return () => clearTimeout(timer);
        } else {
            setIsWaitingTimeout(false);
        }
    }, [gameState.status]);


    // --- Score Sync (High Frequency) ---
    useEffect(() => {
        if (gameState.status !== 'playing') return;
        const interval = setInterval(() => {
            if (scoreRef.current !== lastSyncedScore.current) {
                lastSyncedScore.current = scoreRef.current;
                supabase.rpc('update_score', {
                    p_room_id: roomId,
                    p_player_id: myId,
                    p_score: scoreRef.current
                }).then(({ error }) => {
                    if (error) console.error('SCORE SYNC ERROR:', error);
                });
            }
        }, 300);
        return () => clearInterval(interval);
    }, [gameState.status, roomId, myId]);


    // --- Actions ---
    const incrementScore = (amount: number = 100) => {
        scoreRef.current = Math.max(0, scoreRef.current + amount);
        hasLocalScoreChanges.current = true;
        setGameState(prev => ({ ...prev, myScore: scoreRef.current }));
    };

    // Fix: Reset finishing flag AND ScoreRef when round changes
    // 라운드가 변경(또는 게임 타입 변경)되면 isFinishing 플래그를 초기화하여 다음 라운드 종료 시 트리거가 동작하도록 함
    useEffect(() => {
        isFinishing.current = false;
        scoreRef.current = 0; // Reset local score for new round
        hasLocalScoreChanges.current = false;
        console.log('Resetting isFinishing flag and scoreRef for new round/game type');
    }, [gameState.currentRound, gameState.gameType, gameState.status]);

    return { gameState, incrementScore, serverOffset, isWaitingTimeout };
};
