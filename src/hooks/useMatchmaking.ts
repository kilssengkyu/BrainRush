import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { getLevelFromXp } from '../utils/levelUtils';

const DEFAULT_BOT_DELAY_MIN_MS = 3000;
const DEFAULT_BOT_DELAY_MAX_MS = 8000;
const DEFAULT_BOT_FORCE_AFTER_MS = 8000;

type MatchMode = 'rank' | 'normal';

type StartSearchOptions = {
    forceBotImmediate?: boolean;
};

export const useMatchmaking = (
    onMatchFound: (roomId: string, opponentId: string) => void
) => {
    const { profile, user } = useAuth();
    const [status, setStatus] = useState<'idle' | 'searching' | 'matched' | 'timeout'>('idle');
    const [matchedOpponentId, setMatchedOpponentId] = useState<string | null>(null);
    const [searchRange, setSearchRange] = useState<number>(0);
    const [elapsedTime, setElapsedTime] = useState<number>(0);
    const searchInterval = useRef<ReturnType<typeof setInterval> | null>(null);
    const searchStartTime = useRef<number>(0);
    const botMatchTriggered = useRef<boolean>(false);
    const pencilConsumed = useRef<boolean>(false);
    const botDelayMsRef = useRef<number>(DEFAULT_BOT_DELAY_MAX_MS);
    const botForceAfterMsRef = useRef<number>(DEFAULT_BOT_FORCE_AFTER_MS);

    // Generate a transient Guest ID if not logged in
    const guestId = useRef(`guest_${Math.random().toString(36).substring(2, 9)}`);

    const getPlayerId = () => {
        return user?.id || guestId.current;
    };

    const getValidActiveSession = async (playerId: string) => {
        const { data } = await supabase.rpc('check_active_session', {
            p_player_id: playerId
        }).maybeSingle() as { data: { room_id: string, opponent_id: string, status: string, created_at: string } | null };

        if (!data) return null;

        const sessionAgeMs = Date.now() - new Date(data.created_at).getTime();
        const isStaleWaitingRoom = data.status === 'waiting' && sessionAgeMs > 60 * 1000;
        const isStaleActiveRoom = data.status !== 'waiting' && sessionAgeMs > 5 * 60 * 1000;
        if (isStaleWaitingRoom || isStaleActiveRoom) {
            return null;
        }
        return data;
    };

    const loadBotDelayConfig = async () => {
        try {
            const keys = ['bot_delay_min_ms', 'bot_delay_max_ms', 'bot_force_after_ms'];
            const { data, error } = await supabase
                .from('app_config')
                .select('key, value')
                .in('key', keys);
            if (error || !data) throw error;

            const valueByKey = new Map<string, string>();
            data.forEach((row: any) => {
                valueByKey.set(String(row.key), String(row.value ?? '').trim());
            });

            const parsedMin = Number.parseInt(valueByKey.get('bot_delay_min_ms') ?? '', 10);
            const parsedMax = Number.parseInt(valueByKey.get('bot_delay_max_ms') ?? '', 10);
            const parsedForce = Number.parseInt(valueByKey.get('bot_force_after_ms') ?? '', 10);

            const minMs = Number.isFinite(parsedMin) ? parsedMin : DEFAULT_BOT_DELAY_MIN_MS;
            const maxMs = Number.isFinite(parsedMax) ? parsedMax : DEFAULT_BOT_DELAY_MAX_MS;
            const safeMin = Math.max(1000, Math.min(minMs, maxMs));
            const safeMax = Math.max(safeMin, Math.max(minMs, maxMs));
            const forceAfterMs = Number.isFinite(parsedForce)
                ? Math.max(1000, parsedForce)
                : Math.max(DEFAULT_BOT_FORCE_AFTER_MS, safeMax);

            return { minMs: safeMin, maxMs: safeMax, forceAfterMs };
        } catch (err) {
            console.warn('[Matchmaking] Failed to load bot delay config. Using fallback 3~8s.', err);
            return {
                minMs: DEFAULT_BOT_DELAY_MIN_MS,
                maxMs: DEFAULT_BOT_DELAY_MAX_MS,
                forceAfterMs: DEFAULT_BOT_FORCE_AFTER_MS
            };
        }
    };

    const consumeMatchPencil = async (mode: MatchMode, context: string) => {
        if (!user || pencilConsumed.current) return;

        pencilConsumed.current = true;
        const { data: consumed } = await supabase.rpc('consume_match_pencil', {
            user_id: user.id,
            p_mode: mode
        });

        if (!consumed) {
            console.error(`Failed to consume pencil (${context})!`);
        }
    };

    const createBotMatch = async (playerId: string, forceBot: boolean, mode: MatchMode) => {
        const { data, error } = await supabase
            .rpc('create_bot_session', { p_player_id: playerId, p_force: forceBot })
            .maybeSingle() as { data: { room_id: string, opponent_id: string } | null, error: any };

        if (error) throw error;
        if (!data?.room_id || !data?.opponent_id) return null;

        try {
            await consumeMatchPencil(mode, 'Bot Match');
        } catch (e) {
            console.error('Pencil consumption error (Bot Match):', e);
        }

        setMatchedOpponentId(data.opponent_id);
        setStatus('matched');
        onMatchFound(data.room_id, data.opponent_id);
        return data;
    };

    const startSearch = async (mode: MatchMode = 'rank', options: StartSearchOptions = {}) => {
        const playerId = getPlayerId();
        console.log(`startSearch called. Mode: ${mode}, PlayerID: ${playerId}, IsGuest: ${!user}`);

        // Guard: both rank/normal require session. (anonymous guest login is still a session)
        if ((mode === 'rank' || mode === 'normal') && !user) {
            console.error(`startSearch aborted: ${mode} mode requires login session.`);
            return;
        }

        // Reconnect first: if an active session already exists, never create a new one.
        try {
            const activeSession = await getValidActiveSession(playerId);
            if (activeSession) {
                console.log('Active session found before search. Reconnecting:', activeSession.room_id);
                setStatus('matched');
                onMatchFound(activeSession.room_id, activeSession.opponent_id);
                return;
            }
        } catch (err) {
            console.error('Active session check failed before search:', err);
        }

        setMatchedOpponentId(null);
        setStatus('searching');
        searchStartTime.current = Date.now();
        setElapsedTime(0);
        botMatchTriggered.current = false;
        pencilConsumed.current = false;

        if (options.forceBotImmediate) {
            botMatchTriggered.current = true;
            try {
                const forceBot = true;
                const botMatch = await createBotMatch(playerId, forceBot, mode);
                if (botMatch) {
                    console.log('Immediate tutorial bot match found. Room:', botMatch.room_id);
                    return;
                }
                botMatchTriggered.current = false;
            } catch (err) {
                console.error('Immediate tutorial bot matchmaking error:', err);
                botMatchTriggered.current = false;
            }
        }

        // Decide bot fallback delay once per search.
        // If app_config keys are missing, fallback stays at 3~8s.
        const botConfig = await loadBotDelayConfig();
        const randomSpan = botConfig.maxMs - botConfig.minMs + 1;
        botDelayMsRef.current = botConfig.minMs + Math.floor(Math.random() * randomSpan);
        botForceAfterMsRef.current = botConfig.forceAfterMs;
        console.log(
            '[Matchmaking] Bot delay(ms):',
            botDelayMsRef.current,
            'range:',
            `${botConfig.minMs}~${botConfig.maxMs}`,
            'forceAfter:',
            botForceAfterMsRef.current
        );

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
            const botDelayMs = botDelayMsRef.current;
            const forceAfterMs = botForceAfterMsRef.current;
            const isBotEligible =
                (mode === 'normal' || mode === 'rank') &&
                (playerLevel <= 5 || elapsedMs >= forceAfterMs);
            const forceBot = playerLevel > 5 && elapsedMs >= forceAfterMs;

            if (isBotEligible && !botMatchTriggered.current && elapsedMs >= botDelayMs) {
                botMatchTriggered.current = true;
                try {
                    const botMatch = await createBotMatch(playerId, forceBot, mode);
                    if (botMatch) {
                        console.log('Bot Match Found! Room:', botMatch.room_id);
                        if (searchInterval.current) clearInterval(searchInterval.current);
                        return;
                    }
                    botMatchTriggered.current = false;
                } catch (err) {
                    console.error('Bot matchmaking error:', err);
                    botMatchTriggered.current = false;
                }
            }


            const passiveMatch = await getValidActiveSession(playerId);
            if (passiveMatch) {
                console.log('Passive Match Detected! Reconnecting/Matching:', passiveMatch.room_id);
                if (searchInterval.current) clearInterval(searchInterval.current);

                // Consume pencil for passive match (same as active match)
                try {
                    await consumeMatchPencil(mode, 'Passive Match');
                } catch (e) {
                    console.error('Pencil consumption error (Passive Match):', e);
                }

                setMatchedOpponentId(passiveMatch.opponent_id);
                setStatus('matched');
                setTimeout(() => {
                    onMatchFound(passiveMatch.room_id, passiveMatch.opponent_id);
                }, 300);
                return;
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
                    await consumeMatchPencil(mode as MatchMode, 'Match Found');
                } catch (e) {
                    console.error('Pencil consumption error:', e);
                }

                setStatus('matched');

                // Fetch session to determine opponent
                const { data: session } = await supabase.from('game_sessions').select('*').eq('id', roomId).single();

                // Identify opponent (I could be p1 or p2)
                const opponentId = session.player1_id === playerId ? session.player2_id : session.player1_id;

                setMatchedOpponentId(opponentId);
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

    return { status, startSearch, cancelSearch: () => cancelSearch(true), searchRange, elapsedTime, playerId: getPlayerId(), matchedOpponentId };
};
