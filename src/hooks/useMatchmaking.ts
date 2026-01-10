import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

export const useMatchmaking = (
    onMatchFound: (roomId: string, opponentId: string) => void
) => {
    const { profile } = useAuth();
    const [status, setStatus] = useState<'idle' | 'searching' | 'matched'>('idle');
    const [searchRange, setSearchRange] = useState<number>(0);
    const searchInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    const startSearch = async (mode: 'rank' | 'normal' = 'rank') => {
        console.log(`startSearch called. Mode: ${mode}, Profile:`, profile);

        if (!profile) {
            console.error('startSearch aborted: No profile found.');
            return;
        }

        setStatus('searching');

        // If Normal Mode, Start with huge range immediately (Ignore Elo)
        const initialRange = mode === 'normal' ? 2000 : 50;
        setSearchRange(initialRange);

        let currentRange = initialRange;
        const myMMR = profile.mmr || 1000;

        // Initial attempt
        await attemptMatch(myMMR, currentRange);

        // Start Loop
        searchInterval.current = setInterval(async () => {
            if (mode === 'rank') {
                currentRange += 50; // Slowly expand for Rank
            } else {
                // Keep wide range for Normal
                currentRange = 5000;
            }
            setSearchRange(currentRange);
            await attemptMatch(myMMR, currentRange);
        }, 3000);
    };

    const attemptMatch = async (mmr: number, range: number) => {
        try {
            const minMMR = Math.max(0, mmr - range);
            const maxMMR = mmr + range;

            console.log(`Searching match: ${minMMR} ~ ${maxMMR}`);

            const { data: roomId, error } = await supabase.rpc('find_match', {
                p_min_mmr: minMMR,
                p_max_mmr: maxMMR
            });

            if (error) throw error;

            if (roomId) {
                console.log('Match Found! Room:', roomId);
                if (searchInterval.current) clearInterval(searchInterval.current);
                setStatus('matched');

                // Fetch opponent ID (Derived from room info if needed, but for now just navigate)
                // In a real scenario, we might want to know WHO we matched against before navigating
                // But Home.tsx just needs roomId to enter the game.

                // Let's verify who is in the session to get opponentId
                const { data: session } = await supabase.from('game_sessions').select('*').eq('id', roomId).single();
                const opponentId = session.player1_id === profile!.id ? session.player2_id : session.player1_id;

                onMatchFound(roomId, opponentId);
            }
        } catch (err) {
            console.error('Matchmaking error:', err);
        }
    };

    const cancelSearch = async () => {
        if (searchInterval.current) {
            clearInterval(searchInterval.current);
            searchInterval.current = null;
        }

        // Remove from queue (Optional: Create a leave_queue RPC, or just let it expire/be ignored)
        // ideally: await supabase.from('matchmaking_queue').delete().eq('player_id', profile.id);
        if (profile) {
            await supabase.from('matchmaking_queue').delete().eq('player_id', profile.id);
        }

        setStatus('idle');
        setSearchRange(0);
    };

    useEffect(() => {
        return () => {
            if (searchInterval.current) clearInterval(searchInterval.current);
        };
    }, []);

    return { status, startSearch, cancelSearch, searchRange };
};
