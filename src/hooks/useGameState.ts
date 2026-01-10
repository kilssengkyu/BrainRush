import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface GameState {
    status: 'waiting' | 'countdown' | 'playing' | 'round_end' | 'finished';
    gameType: 'RPS' | 'NUMBER_ASC' | 'NUMBER_DESC' | null;
    round: number;
    scores: { me: number; opponent: number };
    gameData: any;
    targetMove: string | null;
    resultMessage: string | null;
    timeLeft: number;
}

export const useGameState = (myId: string, opponentId: string) => {
    const [gameState, setGameState] = useState<GameState>({
        status: 'waiting',
        gameType: null,
        round: 0,
        scores: { me: 0, opponent: 0 },
        gameData: null,
        targetMove: null,
        resultMessage: null,
        timeLeft: 0
    });

    const [sessionId, setSessionId] = useState<string | null>(null);
    const isHost = myId < opponentId;
    const p1Id = isHost ? myId : opponentId;
    const p2Id = isHost ? opponentId : myId;

    const lastRoundRef = useRef<number>(0);
    const isCountingDownRef = useRef<boolean>(false);

    // Unified State Handler
    const handleGameUpdate = useCallback((record: any) => {
        if (!record) return;

        const isPlayer1 = myId === record.player1_id;
        const myScore = isPlayer1 ? record.player1_score : record.player2_score;
        const opScore = isPlayer1 ? record.player2_score : record.player1_score;

        // Detect New Round
        if (record.current_round > lastRoundRef.current) {
            console.log(`[Game] New Round Detected: ${lastRoundRef.current} -> ${record.current_round}`);
            lastRoundRef.current = record.current_round;
            isCountingDownRef.current = true;
        }

        // Calculate Time Left
        const now = Date.now();
        const endTime = record.phase_end_at ? new Date(record.phase_end_at).getTime() : now;
        const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));

        // Result Message
        let result = null;
        if (record.status === 'round_end') {
            if (myScore > gameState.scores.me) result = 'WIN';
            else if (opScore > gameState.scores.opponent) result = 'LOSE';
            else result = 'DRAW';
        }

        setGameState(prev => {
            // Fix WIN -> DRAW glitch:
            // If we are already in 'round_end' for this round, preserve the calculated result
            // because 'prev.scores' will catch up to 'record.scores' causing the diff check to fail.
            let finalResult = result;
            if (prev.status === 'round_end' && prev.round === record.current_round && prev.resultMessage) {
                finalResult = prev.resultMessage;
            }

            return {
                status: record.status,
                gameType: record.game_type,
                round: record.current_round,
                scores: { me: myScore, opponent: opScore },
                gameData: record.game_data,
                targetMove: record.target_move,
                resultMessage: finalResult,
                timeLeft: remaining
            };
        });

        // Host Logic: Trigger Transitions (Only if Host)
        if (isHost && sessionId) {
            // End of Countdown -> Start Game
            if (record.status === 'countdown' && remaining <= 0) {
                supabase.rpc('trigger_game_start', { p_room_id: sessionId }).then();
            }
            // End of Playing -> Resolve Round (Timeout / Sudden Death)
            if (record.status === 'playing' && remaining <= 0) {
                supabase.rpc('resolve_round', { p_room_id: sessionId }).then();
            }
        }
    }, [myId, isHost, sessionId, gameState.scores]);

    // --- Actions ---
    const startRoundRpc = useCallback(async (sid: string) => {
        const { error } = await supabase.rpc('start_next_round', { p_room_id: sid });
        if (error) console.error('[Game] start_next_round Failed:', error);
    }, []);

    const submitMove = useCallback(async (move: string) => {
        if (!sessionId) return;
        const { error } = await supabase.rpc('submit_move', { p_room_id: sessionId, p_player_id: myId, p_move: move });
        if (error) console.error('[Game] submitMove Failed:', error);
    }, [sessionId, myId]);


    // --- Effects ---

    // 1. UI Countdown Timer
    useEffect(() => {
        if (!sessionId) return;
        const timer = setInterval(() => {
            supabase.from('game_sessions').select('*').eq('id', sessionId).single()
                .then(({ data }) => { if (data) handleGameUpdate(data); });
        }, 1000);
        return () => clearInterval(timer);
    }, [sessionId, handleGameUpdate]);

    // 2. Initial Discovery (Find or Create Session)
    useEffect(() => {
        let mounted = true;
        let pollInterval: ReturnType<typeof setInterval> | null = null;

        const init = async () => {
            const { data: existing } = await supabase.from('game_sessions')
                .select('*')
                .eq('player1_id', p1Id).eq('player2_id', p2Id)
                .neq('status', 'finished')
                .order('created_at', { ascending: false }).limit(1).maybeSingle();

            if (!mounted) return;

            if (existing) {
                setSessionId(existing.id);
                handleGameUpdate(existing);
                // Host Resume
                if (isHost && existing.status === 'waiting') {
                    startRoundRpc(existing.id);
                }
                return;
            }

            if (isHost) {
                // Host Create
                const { data: newId, error: createError } = await supabase.rpc('create_session', { p_player1_id: p1Id, p_player2_id: p2Id });
                if (createError) console.error('[Game] create_session Failed:', createError);

                if (newId && mounted) {
                    setSessionId(newId);
                    startRoundRpc(newId);
                }
            } else {
                // Guest Poll
                pollInterval = setInterval(async () => {
                    const { data: found } = await supabase.from('game_sessions')
                        .select('*').eq('player1_id', p1Id).eq('player2_id', p2Id)
                        .neq('status', 'finished').order('created_at', { ascending: false }).limit(1).maybeSingle();

                    if (found && mounted) {
                        setSessionId(found.id);
                        handleGameUpdate(found);
                        if (pollInterval) clearInterval(pollInterval);
                    }
                }, 1000);
            }
        };

        init();

        return () => {
            mounted = false;
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [isHost, p1Id, p2Id, handleGameUpdate, startRoundRpc]);

    // 3. Realtime Subscription
    useEffect(() => {
        if (!sessionId) return;
        const channel = supabase.channel(`game_${sessionId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` },
                (payload) => handleGameUpdate(payload.new)
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [sessionId, handleGameUpdate]);

    // 4. Host Auto-Next-Round (3s after Result)
    useEffect(() => {
        if (!isHost || !sessionId) return;
        if (gameState.status === 'round_end') {
            const t = setTimeout(() => {
                startRoundRpc(sessionId);
            }, 3000);
            return () => clearTimeout(t);
        }
    }, [gameState.status, isHost, sessionId, startRoundRpc]);

    return { gameState, submitMove };
};
