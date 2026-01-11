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
    phaseEndAt: string | null;
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
        phaseEndAt: null,
        mmrChange: null
    });

    const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

    // Dynamic Host Logic
    const isHostUser = (() => {
        if (onlineUsers.length === 0) return myId < opponentId;
        if (onlineUsers.length === 1 && onlineUsers.includes(myId)) return true;
        // If opponent is missing from onlineUsers but we are not alone? (e.g. a spectator?)
        // Ideally ensure we filter for valid players. For now assume room is p1/p2.
        if (onlineUsers.includes(opponentId)) return myId < opponentId;
        return myId < opponentId;
    })();


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

        setGameState(prev => {
            // Determine Result Message
            let result = prev.resultMessage;

            // Only calculate new result if we just entered round_end state
            if (record.status === 'round_end') {
                // Check if scores actually changed compared to our LOCAL previous state
                // This implies a win/loss just happened.
                if (myScore > prev.scores.me) result = 'WIN';
                else if (opScore > prev.scores.opponent) result = 'LOSE';
                else if (prev.status !== 'round_end') result = 'DRAW'; // No score change but ended? Timeout Draw.
                // If already in round_end, keep the result (don't overwrite with DRAW potentially)
            } else if (record.status === 'countdown' || record.status === 'playing') {
                result = null; // Reset result for new round
            }

            return {
                status: record.status,
                gameType: record.game_type,
                round: record.current_round,
                scores: { me: myScore, opponent: opScore },
                gameData: record.game_data,
                targetMove: record.target_move,
                resultMessage: result,
                timeLeft: remaining,
                phaseEndAt: record.phase_end_at,
                mmrChange: myMmrChange
            };
        });

        // Host Logic: Trigger Transitions (Server Authoritative via RPC)
        // Use the calculated isHostUser value (caught in closure or passed?)
        // Since handleGameUpdate is recreated when IS_HOST changes (dep array), it uses fresh value.
        if (isHostUser) {
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
    }, [myId, isHostUser, roomId]);

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

    // 2. Realtime Subscription & Presence
    useEffect(() => {
        const channel = supabase.channel(`game_${roomId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${roomId}` },
                (payload) => handleGameUpdate(payload.new)
            )
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const userIds = Object.values(state).flat().map((p: any) => p.user_id);
                // Unique user IDs just in case
                const uniqueIds = Array.from(new Set(userIds)) as string[];
                console.log('[Presence] Online Users:', uniqueIds);
                setOnlineUsers(uniqueIds);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({ user_id: myId, online_at: new Date().toISOString() });
                }
            });

        return () => { supabase.removeChannel(channel); };
    }, [roomId, myId, handleGameUpdate]); // Re-subscribe if handleGameUpdate changes (which happens if isHost changes)

    // 3. Host Auto-Next-Round (3s after Result)
    useEffect(() => {
        if (!isHostUser) return;
        if (gameState.status === 'round_end') {
            const t = setTimeout(() => {
                startRoundRpc();
            }, 3000);
            return () => clearTimeout(t);
        }
    }, [gameState.status, isHostUser, startRoundRpc]);

    const [isReconnecting, setIsReconnecting] = useState(false);
    const [reconnectTimer, setReconnectTimer] = useState(30);

    // 4. Reconnection Monitor
    // 4. Reconnection Monitor (with Debounce Buffer)
    useEffect(() => {
        // Condition: Game is active (playing/countdown/round_end) AND opponent is offline
        const isGameActive = ['playing', 'countdown', 'round_end'].includes(gameState.status);
        const isOpponentOffline = onlineUsers.length > 0 && !onlineUsers.includes(opponentId);

        let bufferTimer: ReturnType<typeof setTimeout>;

        if (isGameActive && isOpponentOffline) {
            // Buffer: Wait 2 seconds before declaring disconnection
            bufferTimer = setTimeout(() => {
                setIsReconnecting(true);
            }, 2000);
        } else {
            setIsReconnecting(false);
            // setReconnectTimer(30); // REMOVED: Keep remaining time (Cumulative Budget)
        }

        return () => clearTimeout(bufferTimer);
    }, [gameState.status, onlineUsers, opponentId]);

    // 5. Reconnection Countdown & Forfeit Trigger
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isReconnecting) {
            interval = setInterval(async () => {
                setReconnectTimer((prev) => {
                    if (prev <= 1) {
                        // Timeout! Trigger Forfeit
                        clearInterval(interval);
                        console.log('Opponent Timed Out! Triggering Forfeit...');

                        // Only the remaining player (Host or not) should trigger this to avoid race conditions?
                        // Actually, anyone online can trigger it.
                        supabase.rpc('handle_disconnection', {
                            p_room_id: roomId,
                            p_leaver_id: opponentId
                        }).then(({ error }) => {
                            if (error) console.error('Failed to handle disconnection:', error);
                        });

                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isReconnecting, roomId, opponentId]);

    const [serverOffset, setServerOffset] = useState<number>(0);

    // Sync Clock on Mount
    useEffect(() => {
        const syncTime = async () => {
            const start = Date.now();
            const { data, error } = await supabase.rpc('get_server_time');
            const end = Date.now();
            if (data && !error) {
                const latency = (end - start) / 2;
                const serverTime = new Date(data).getTime();
                const offset = serverTime - (end - latency);
                console.log('[TimeSync] Offset:', offset, 'ms (Latency:', latency, 'ms)');
                setServerOffset(Math.round(offset));
            }
        };
        syncTime();
    }, []);

    // ... (rest of the file)
    return { gameState, submitMove, isReconnecting, reconnectTimer, serverOffset };
};
