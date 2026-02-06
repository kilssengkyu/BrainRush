import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { getLevelFromXp } from '../utils/levelUtils';

export const useMatchmaking = (
    onMatchFound: (roomId: string, opponentId: string) => void
) => {
    const { profile, user } = useAuth();
    const [status, setStatus] = useState<'idle' | 'searching' | 'matched' | 'timeout'>('idle');
    const [searchRange, setSearchRange] = useState<number>(0);
    const [elapsedTime, setElapsedTime] = useState<number>(0);
    const searchInterval = useRef<ReturnType<typeof setInterval> | null>(null);
    const searchStartTime = useRef<number>(0);
    const botMatchTriggered = useRef<boolean>(false);

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
        botMatchTriggered.current = false;

        // If Normal Mode, Start with huge range immediately (Ignore Elo)
        const initialRange = mode === 'normal' ? 100 : 50;
        setSearchRange(initialRange);

        let currentRange = initialRange;
        const myMMR = profile?.mmr || 1000;
        const rangeStep = mode === 'normal' ? 100 : 50;
        const rangeStepMs = mode === 'normal' ? 3000 : 4000;

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

            const elapsedMs = Date.now() - searchStartTime.current;
            const playerLevel = typeof profile?.level === 'number'
                ? profile.level
                : typeof profile?.xp === 'number'
                    ? getLevelFromXp(profile.xp)
                    : 1;
            const isBotEligible = mode === 'normal' && (playerLevel <= 5 || elapsedMs >= 15000);
            const botDelayMs = playerLevel <= 5 ? 10000 : 15000;
            const forceBot = playerLevel > 5 && elapsedMs >= 15000;

            if (isBotEligible && !botMatchTriggered.current && elapsedMs >= botDelayMs) {
                botMatchTriggered.current = true;
                try {
                    const { data, error } = await supabase
                        .rpc('create_bot_session', { p_player_id: playerId, p_force: forceBot })
                        .maybeSingle() as { data: { room_id: string, opponent_id: string } | null, error: any };

                    if (error) throw error;
                    if (data?.room_id && data?.opponent_id) {
                        console.log('Bot Match Found! Room:', data.room_id);
                        if (searchInterval.current) clearInterval(searchInterval.current);
                        try {
                            if (user) {
                                const { data: consumed } = await supabase.rpc('consume_pencil', { user_id: user.id });
                                if (!consumed) {
                                    console.error('Failed to consume pencil (Bot Match)!');
                                }
                            }
                        } catch (e) {
                            console.error('Pencil consumption error (Bot Match):', e);
                        }
                        setStatus('matched');
                        onMatchFound(data.room_id, data.opponent_id);
                        return;
                    }
                    botMatchTriggered.current = false;
                } catch (err) {
                    console.error('Bot matchmaking error:', err);
                    botMatchTriggered.current = false;
                }
            }


            // Use RPC to bypass RLS for Guest users
            const { data: passiveMatch } = await supabase.rpc('check_active_session', {
                p_player_id: playerId
            }).maybeSingle() as { data: { room_id: string, opponent_id: string, status: string, created_at: string } | null };

            if (passiveMatch) {
                // Smart Filter:
                // 1. waiting: older than 60s is ghost
                // 2. active (non-waiting): older than 5 min is stale
                const sessionAgeMs = Date.now() - new Date(passiveMatch.created_at).getTime();
                const isStaleWaitingRoom = passiveMatch.status === 'waiting' && sessionAgeMs > 60 * 1000;
                const isStaleActiveRoom = passiveMatch.status !== 'waiting' && sessionAgeMs > 5 * 60 * 1000;

                if (isStaleWaitingRoom || isStaleActiveRoom) {
                    console.log('Ignoring stale session:', passiveMatch.room_id);
                } else {
                    console.log('Passive Match Detected! Reconnecting/Matching:', passiveMatch.room_id);
                    if (searchInterval.current) clearInterval(searchInterval.current);

                    try {
                        // Only Authenticated users consume pencils
                        if (user) {
                            const { data: consumed } = await supabase.rpc('consume_pencil', { user_id: user.id });
                            if (!consumed) {
                                console.error('Failed to consume pencil (Passive)!');
                            }
                        }
                    } catch (e) {
                        console.error('Pencil consumption error (Passive):', e);
                    }

                    setStatus('matched');
                    // Add delay to show "Matched!" modal
                    setTimeout(() => {
                        onMatchFound(passiveMatch.room_id, passiveMatch.opponent_id);
                    }, 1500);
                    return;
                }
            }

            const rangeSteps = Math.floor(elapsedMs / rangeStepMs);
            const nextRange = initialRange + (rangeSteps * rangeStep);
            if (nextRange !== currentRange) {
                currentRange = nextRange;
                setSearchRange(currentRange);
            }
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

                // Match Found -> Consume Pencil
                // Logic: Only consume if I am the one searching (which I am)?
                // Wait, both players are searching. Both should consume.
                // It's safer to consume when entering the room?
                // Or consume HERE.
                // If consume fails (0 pencils), what happens?
                // Ideally we checked BEFORE searching. But race conditions could occur.
                // Let's force consume.

                try {
                    // Only Authenticated users consume pencils
                    if (user) {
                        const { data: consumed } = await supabase.rpc('consume_pencil', { user_id: user.id });
                        if (!consumed) {
                            console.error('Failed to consume pencil! Maybe ran out during search?');
                            // Should we abort?
                            // It's rare. Let's let them play but maybe show warning?
                            // Or abort match? strict: cancelSearch(true); return;
                            // But match is already made in DB.
                            // Let's just log for now.
                        }
                    }
                } catch (e) {
                    console.error('Pencil consumption error:', e);
                }

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
