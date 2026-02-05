import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { useTranslation } from 'react-i18next';

const GameInviteListener = () => {
    const { user } = useAuth();
    const { confirm, showToast } = useUI();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const processedInviteIds = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!user) return;

        console.log('GameInviteListener active for user:', user.id);

        const handleInviteMessage = async (msg: any) => {
            if (!msg || typeof msg.content !== 'string') return;
            if (!msg.content.startsWith('INVITE:')) return;
            if (msg.id && processedInviteIds.current.has(msg.id)) return;

            if (msg.id) {
                processedInviteIds.current.add(msg.id);
                supabase
                    .from('chat_messages')
                    .update({ is_read: true })
                    .eq('id', msg.id)
                    .then(({ error }) => {
                        if (error) console.error('Failed to mark invite as read', error);
                    });
            }

            const roomId = msg.content.split(':')[1];
            const senderId = msg.sender_id as string | undefined;
            if (!roomId || !senderId) return;

            console.log('Received invite:', roomId, 'from', senderId);

            type ActiveSession = { room_id: string; status: string };
            const { data: activeSessionData, error: activeSessionError } = await supabase
                .rpc('check_active_session', { p_player_id: user.id })
                .maybeSingle();
            const activeSession = activeSessionData as ActiveSession | null;

            if (activeSessionError) {
                console.error('Failed to check active session:', activeSessionError);
            }

            const sendBusyResponse = async () => {
                await supabase.rpc('cancel_friendly_session', { p_room_id: roomId });
                const { error: busyError } = await supabase
                    .from('chat_messages')
                    .insert({
                        sender_id: user.id,
                        receiver_id: senderId,
                        content: `INVITE_BUSY:${roomId}`
                    });

                if (busyError) {
                    console.error('Failed to send invite busy response', busyError);
                }
            };

            if (activeSession && activeSession.room_id !== roomId) {
                await sendBusyResponse();
                return;
            }

            if (activeSession && activeSession.room_id === roomId && activeSession.status !== 'waiting') {
                return;
            }

            const hourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            const { data: practiceSessions, error: practiceError } = await supabase
                .from('game_sessions')
                .select('id, status, created_at')
                .eq('mode', 'practice')
                .in('status', ['waiting', 'countdown', 'playing', 'round_end'])
                .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
                .gte('created_at', hourAgoIso);

            if (practiceError) {
                console.error('Failed to check practice session:', practiceError);
            }

            const now = Date.now();
            const hasActivePractice = (practiceSessions || []).some((session: { status: string; created_at: string }) => {
                const ageMs = now - new Date(session.created_at).getTime();
                if (session.status === 'waiting') return ageMs <= 60000;
                return ageMs <= 60 * 60 * 1000;
            });

            if (hasActivePractice) {
                await sendBusyResponse();
                return;
            }

            // Fetch sender nickname
            const { data: senderProfile } = await supabase
                .from('profiles')
                .select('nickname')
                .eq('id', senderId)
                .single();

            const senderName = senderProfile?.nickname || t('social.inviteSenderFallback');

            // Show confirmation dialog
            const accepted = await confirm(
                t('social.inviteTitle'),
                t('social.inviteBody', { nickname: senderName })
            );

            if (accepted) {
                try {
                    // Verify session exists
                    const { data: session, error } = await supabase
                        .from('game_sessions')
                        .select('status')
                        .eq('id', roomId)
                        .single();

                    if (error || !session || session.status !== 'waiting') {
                        showToast(t('social.inviteInvalidSession'), 'error');
                        return;
                    }

                    const { error: responseError } = await supabase
                        .from('chat_messages')
                        .insert({
                            sender_id: user.id,
                            receiver_id: senderId,
                            content: `INVITE_ACCEPTED:${roomId}`
                        });

                    if (responseError) {
                        console.error('Failed to send invite acceptance', responseError);
                    }

                    navigate(`/game/${roomId}`, {
                        state: {
                            roomId,
                            myId: user.id,
                            opponentId: senderId,
                            mode: 'friendly'
                        }
                    });

                } catch (err) {
                    console.error('Error joining game:', err);
                    showToast(t('social.inviteJoinFail'), 'error');
                }
            } else {
                const { error: responseError } = await supabase
                    .from('chat_messages')
                    .insert({
                        sender_id: user.id,
                        receiver_id: senderId,
                        content: `INVITE_REJECTED:${roomId}`
                    });

                if (responseError) {
                    console.error('Failed to send invite rejection', responseError);
                }
            }
        };

        const channel = supabase
            .channel(`game_invites:${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages',
                filter: `receiver_id=eq.${user.id}`
            }, async (payload: any) => {
                await handleInviteMessage(payload.new);
            })
            .subscribe();

        const pollInvites = async () => {
            const cutoffIso = new Date(Date.now() - 2 * 60 * 1000).toISOString();
            const { data, error } = await supabase
                .from('chat_messages')
                .select('id, sender_id, content, created_at')
                .eq('receiver_id', user.id)
                .eq('is_read', false)
                .like('content', 'INVITE:%')
                .gte('created_at', cutoffIso)
                .order('created_at', { ascending: false })
                .limit(5);

            if (error) {
                console.error('Failed to poll invite messages', error);
                return;
            }

            (data || []).forEach((msg) => {
                handleInviteMessage(msg);
            });
        };

        const pollTimer = window.setInterval(pollInvites, 5000);

        return () => {
            supabase.removeChannel(channel);
            window.clearInterval(pollTimer);
        };
    }, [user, navigate, confirm, showToast]);

    return null; // This component renders nothing
};

export default GameInviteListener;
