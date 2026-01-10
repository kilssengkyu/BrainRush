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
    mmrChange: number | null;
}

export const useGameState = (roomId: string, myId: string, opponentId: string) => {
    const [gameState, setGameState] = useState<GameState>({
        status: 'waiting',
        gameType: null,
        round: 0,
        scores: { me: 0, opponent: 0 },
        gameData: null,
        targetMove: null,
        resultMessage: null,
        timeLeft: 0,
        mmrChange: null
    });

    const isHost = myId < opponentId;

    // Using Ref to track round changes for UI effects
    const lastRoundRef = useRef<number>(0);
    const isCountingDownRef = useRef<boolean>(false);

    // Unified State Handler
    const handleGameUpdate = useCallback((record: any) => {
        if (!record) return;

        const isPlayer1 = myId === record.player1_id;
        const myScore = isPlayer1 ? record.player1_score : record.player2_score;
        const opScore = isPlayer1 ? record.player2_score : record.player1_score;
        const myMmrChange = isPlayer1 ? record.player1_mmr_change : record.player2_mmr_change;

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
                timeLeft: remaining,
                mmrChange: myMmrChange
            };
        });

        // Host Logic: Trigger Transitions (Server Authoritative via RPC)
        if (isHost) {
            // WAITING -> COUNTDOWN (Only when BOTH are ready)
            if (record.status === 'waiting' && record.player1_ready && record.player2_ready) {
                console.log('Both players ready! Starting game...');
                supabase.rpc('start_next_round', { p_room_id: roomId }).then();
            }

            // COUNTDOWN -> PLAYING
            if (record.status === 'countdown' && remaining <= 0) {
                supabase.rpc('trigger_game_start', { p_room_id: roomId }).then();
            }
            // PLAYING -> ROUND END
            if (record.status === 'playing' && remaining <= 0) {
                supabase.rpc('resolve_round', { p_room_id: roomId }).then();
            }
        }
    }, [myId, isHost, roomId, gameState.scores]);

    // --- Actions ---
    const startRoundRpc = useCallback(async () => {
        const { error } = await supabase.rpc('start_next_round', { p_room_id: roomId });
        if (error) console.error('[Game] start_next_round Failed:', error);
    }, [roomId]);

    const submitMove = useCallback(async (move: string) => {
        const { error } = await supabase.rpc('submit_move', { p_room_id: roomId, p_player_id: myId, p_move: move });
        if (error) console.error('[Game] submitMove Failed:', error);
    }, [roomId, myId]);


    // --- Effects ---

    // 0. SIGNAL READY ON MOUNT
    useEffect(() => {
        if (!roomId || !myId) return;
        console.log('Signaling READY...');
        supabase.rpc('set_player_ready', { p_room_id: roomId, p_player_id: myId }).then(({ error }) => {
            if (error) console.error('Failed to set ready:', error);
        });
    }, [roomId, myId]);

    // 1. UI Countdown Timer & Initial Fetch
    useEffect(() => {
        // Initial Fetch
        supabase.from('game_sessions').select('*').eq('id', roomId).single()
            .then(({ data }) => {
                if (data) {
                    handleGameUpdate(data);
                }
            });

        const timer = setInterval(() => {
            supabase.from('game_sessions').select('*').eq('id', roomId).single()
                .then(({ data }) => { if (data) handleGameUpdate(data); });
        }, 1000);
        return () => clearInterval(timer);
    }, [roomId, handleGameUpdate]);

    // 2. Realtime Subscription
    useEffect(() => {
        const channel = supabase.channel(`game_${roomId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${roomId}` },
                (payload) => handleGameUpdate(payload.new)
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [roomId, handleGameUpdate]);

    // 3. Host Auto-Next-Round (3s after Result)
    useEffect(() => {
        if (!isHost) return;
        if (gameState.status === 'round_end') {
            const t = setTimeout(() => {
                startRoundRpc();
            }, 3000);
            return () => clearTimeout(t);
        }
    }, [gameState.status, isHost, startRoundRpc]);

    return { gameState, submitMove };
};
