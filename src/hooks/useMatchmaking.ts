import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

export const useMatchmaking = (
    onMatchFound: (roomId: string, opponentId: string) => void
) => {
    const { profile, user } = useAuth();
    const [status, setStatus] = useState<'idle' | 'searching' | 'matched' | 'timeout'>('idle');
    const [searchRange, setSearchRange] = useState<number>(0);
    const [elapsedTime, setElapsedTime] = useState<number>(0);
    const searchInterval = useRef<ReturnType<typeof setInterval> | null>(null);
    const searchStartTime = useRef<number>(0);

    // Generate a transient Guest ID if not logged in
    const guestId = useRef(`guest_${Math.random().toString(36).substring(2, 9)}`);

    const getPlayerId = () => {
        return user?.id || guestId.current;
    };

    const startSearch = async (mode: 'rank' | 'normal' = 'rank') => {
        const playerId = getPlayerId();
        console.log(`startSearch called. Mode: ${mode}, PlayerID: ${playerId}, IsGuest: ${!user}`);

        // Block Rank mode for guests
        if (mode === 'rank' && !profile) {
            console.error('startSearch aborted: Rank mode requires login.');
            return;
        }

        setStatus('searching');
        searchStartTime.current = Date.now();
        setElapsedTime(0);

        // If Normal Mode, Start with huge range immediately (Ignore Elo)
        const initialRange = mode === 'normal' ? 2000 : 50;
        setSearchRange(initialRange);

        let currentRange = initialRange;
        const myMMR = profile?.mmr || 1000;

        // Initial attempt
        await attemptMatch(playerId, myMMR, currentRange, mode);

        // Start Loop
        searchInterval.current = setInterval(async () => {
            // Update Timer
            setElapsedTime(Math.floor((Date.now() - searchStartTime.current) / 1000));

            // Check for Timeout (60 seconds)
            if (Date.now() - searchStartTime.current > 60000) {
                console.log('Matchmaking timed out');
                await cancelSearch(false); // Do not reset to idle immediately, set to timeout
                setStatus('timeout');
                return;
            }


            // Use RPC to bypass RLS for Guest users
            const { data: passiveMatch } = await supabase.rpc('check_active_session', {
                p_player_id: playerId
            }).maybeSingle() as { data: { room_id: string, opponent_id: string, status: string, created_at: string } | null };

            if (passiveMatch) {
                // Smart Filter:
                // 1. If status is 'waiting' and it's old (> 5 mins), it's a ghost room. Ignore it.
                // 2. If status is 'playing' (or others), it's an active game. Reconnect even if > 1 min.
                const isStaleWaitingRoom = passiveMatch.status === 'waiting' &&
                    (Date.now() - new Date(passiveMatch.created_at).getTime() > 5 * 60 * 1000);

                if (isStaleWaitingRoom) {
                    console.log('Ignoring stale waiting session:', passiveMatch.room_id);
                } else {
                    console.log('Passive Match Detected! Reconnecting/Matching:', passiveMatch.room_id);
                    if (searchInterval.current) clearInterval(searchInterval.current);
                    setStatus('matched');

                    // Add delay to show "Matched!" modal
                    setTimeout(() => {
                        onMatchFound(passiveMatch.room_id, passiveMatch.opponent_id);
                    }, 1500);
                    return;
                }
            }

            if (mode === 'rank') {
                currentRange += 50; // Slowly expand for Rank
            } else {
                currentRange = 5000; // Keep wide range for Normal
            }
            setSearchRange(currentRange);
            await attemptMatch(playerId, myMMR, currentRange, mode);
        }, 1000); // Check every 1s
    };

    const attemptMatch = async (playerId: string, mmr: number, range: number, mode: string) => {
        try {
            const minMMR = Math.max(0, mmr - range);
            const maxMMR = mmr + range;

            console.log(`Searching match for ${playerId}: ${minMMR} ~ ${maxMMR}, Mode: ${mode}`);

            // UPDATED RPC CALL: Passing p_player_id AND p_mode
            const { data: roomId, error } = await supabase.rpc('find_match', {
                p_min_mmr: minMMR,
                p_max_mmr: maxMMR,
                p_player_id: playerId,
                p_mode: mode
            });

            if (error) throw error;

            if (roomId) {
                console.log('Match Found! Room:', roomId);
                if (searchInterval.current) clearInterval(searchInterval.current);
                setStatus('matched');

                // Fetch session to determine opponent
                const { data: session } = await supabase.from('game_sessions').select('*').eq('id', roomId).single();

                // Identify opponent (I could be p1 or p2)
                const opponentId = session.player1_id === playerId ? session.player2_id : session.player1_id;

                onMatchFound(roomId, opponentId);
            }
        } catch (err) {
            console.error('Matchmaking error:', err);
        }
    };

    const cancelSearch = async (resetToIdle = true) => {
        if (searchInterval.current) {
            clearInterval(searchInterval.current);
            searchInterval.current = null;
        }

        const playerId = getPlayerId();
        // Remove from queue
        // Note: Make sure RLS allows this delete or use an RPC
        await supabase.from('matchmaking_queue').delete().eq('player_id', playerId);

        if (resetToIdle) {
            setStatus('idle');
        }
        setSearchRange(0);
        setElapsedTime(0);
    };

    useEffect(() => {
        return () => {
            if (searchInterval.current) clearInterval(searchInterval.current);
        };
    }, []);

    return { status, startSearch, cancelSearch: () => cancelSearch(true), searchRange, elapsedTime, playerId: getPlayerId() };
};
