import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';

interface Player {
    id: string;
    joined_at: number;
}

export const useMatchmaking = (
    onMatchFound: (roomId: string, opponentId: string) => void
) => {
    const [status, setStatus] = useState<'idle' | 'searching' | 'matched'>('idle');
    const [channel, setChannel] = useState<RealtimeChannel | null>(null);
    const myId = useRef<string>(Math.random().toString(36).substring(7));

    const startSearch = () => {
        setStatus('searching');

        const room = supabase.channel('matchmaking');

        room
            .on('presence', { event: 'sync' }, () => {
                const state = room.presenceState();
                const players = (Object.values(state).flat() as unknown) as Player[];

                if (players.length >= 2) {
                    // Determine pair
                    // Sort by joined_at to ensure consistent pairing logic across clients
                    const sortedPlayers = players.sort((a, b) => a.joined_at - b.joined_at);

                    const meIndex = sortedPlayers.findIndex(p => p.id === myId.current);

                    if (meIndex === -1) return;

                    const opponentIndex = meIndex % 2 === 0 ? meIndex + 1 : meIndex - 1;

                    if (sortedPlayers[opponentIndex]) {
                        const opponent = sortedPlayers[opponentIndex];

                        // Generate a deterministic room ID
                        const p1 = sortedPlayers[Math.min(meIndex, opponentIndex)];
                        const p2 = sortedPlayers[Math.max(meIndex, opponentIndex)];
                        const roomId = `room_${p1.id}_${p2.id}`;

                        // Prevent multiple triggers
                        if (status === 'matched') return;

                        setStatus('matched');

                        // Delay navigation to ensure other client receives presence update
                        setTimeout(() => {
                            onMatchFound(roomId, opponent.id);
                        }, 1500);
                    }
                }
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await room.track({
                        id: myId.current,
                        joined_at: Date.now(),
                    });
                }
            });

        setChannel(room);
    };

    const cancelSearch = () => {
        if (channel) {
            supabase.removeChannel(channel);
            setChannel(null);
        }
        setStatus('idle');
    };

    useEffect(() => {
        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, [channel]);

    return { status, startSearch, cancelSearch, myId: myId.current };
};
