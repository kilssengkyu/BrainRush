import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';

const REMATCH_RESPONSE_EVENT = 'brainrush:rematch-response';
const REMATCH_REQUEST_WINDOW_MS = 30000;

type RematchResponseDetail = {
    type: 'REMATCH_ACCEPTED' | 'REMATCH_REJECTED';
    inviteId?: string;
};

type SessionMeta = {
    player1_id: string | null;
    player2_id: string | null;
    mode: string | null;
};

const RematchListener = () => {
    const { user, refreshProfile } = useAuth();
    const { confirm, showToast } = useUI();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const processedMessageIds = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!user) return;

        const emitResponse = (detail: RematchResponseDetail) => {
            window.dispatchEvent(new CustomEvent(REMATCH_RESPONSE_EVENT, { detail }));
        };

        const markRead = (messageId?: string) => {
            if (!messageId) return;
            supabase
                .from('chat_messages')
                .update({ is_read: true })
                .eq('id', messageId)
                .then(({ error }) => {
                    if (error) console.error('Failed to mark rematch message as read', error);
                });
        };

        const sendRematchMessage = async (receiverId: string, content: string) => {
            const { error } = await supabase
                .from('chat_messages')
                .insert({
                    sender_id: user.id,
                    receiver_id: receiverId,
                    content
                });

            if (error) {
                console.error('Failed to send rematch message', error);
            }
        };

        const navigateToRoom = async (roomId: string, fallbackOpponentId: string) => {
            const { data, error } = await supabase
                .from('game_sessions')
                .select('player1_id, player2_id, mode')
                .eq('id', roomId)
                .maybeSingle();

            if (error) {
                console.error('Failed to load rematch session', error);
            }

            const session = data as SessionMeta | null;
            const opponentId = session?.player1_id === user.id
                ? session.player2_id
                : session?.player2_id === user.id
                    ? session.player1_id
                    : fallbackOpponentId;

            navigate(`/game/${roomId}`, {
                state: {
                    roomId,
                    myId: user.id,
                    opponentId,
                    mode: session?.mode ?? 'normal'
                }
            });
        };

        const handleMessage = async (msg: any) => {
            if (!msg || typeof msg.content !== 'string' || !msg.content.startsWith('REMATCH_')) return;
            if (msg.id && processedMessageIds.current.has(msg.id)) return;
            if (msg.id) {
                processedMessageIds.current.add(msg.id);
                markRead(msg.id);
            }

            const parts = msg.content.split(':');
            const type = parts[0];
            const inviteId = parts[1];
            const thirdPart = parts[2];
            const senderId = typeof msg.sender_id === 'string' ? msg.sender_id : '';

            if (!senderId) return;

            if (type === 'REMATCH_REQUEST') {
                if (!thirdPart) return;
                const createdAtMs = msg.created_at ? new Date(msg.created_at).getTime() : 0;
                if (!createdAtMs || Date.now() - createdAtMs > REMATCH_REQUEST_WINDOW_MS) {
                    await sendRematchMessage(senderId, `REMATCH_REJECTED:${inviteId}`);
                    return;
                }

                const { data: senderProfile } = await supabase
                    .from('profiles')
                    .select('nickname')
                    .eq('id', senderId)
                    .maybeSingle();

                const senderName = senderProfile?.nickname || t('social.inviteSenderFallback');
                const accepted = await confirm(
                    t('game.rematchIncomingTitle', '재대결 요청'),
                    t('game.rematchIncomingBody', { nickname: senderName }) + '\n\n' + t('game.rematchReceiverFreeNotice', '리매치 수락 시에는 연필이 차감되지 않습니다.')
                );

                if (!accepted) {
                    await sendRematchMessage(senderId, `REMATCH_REJECTED:${inviteId}`);
                    return;
                }

                try {
                    const { data: newRoomId, error } = await supabase.rpc('create_rematch_session', {
                        p_source_session_id: thirdPart,
                        p_requester_id: senderId
                    });

                    if (error || !newRoomId) {
                        showToast(error?.message || t('game.rematchCreateFail', '재대결을 시작할 수 없습니다.'), 'error');
                        await sendRematchMessage(senderId, `REMATCH_REJECTED:${inviteId}`);
                        return;
                    }

                    await sendRematchMessage(senderId, `REMATCH_ACCEPTED:${inviteId}:${newRoomId}`);
                    await refreshProfile();
                    navigateToRoom(newRoomId, senderId);
                } catch (error: any) {
                    console.error('Failed to accept rematch', error);
                    showToast(error?.message || t('game.rematchCreateFail', '재대결을 시작할 수 없습니다.'), 'error');
                    await sendRematchMessage(senderId, `REMATCH_REJECTED:${inviteId}`);
                }
                return;
            }

            if (type === 'REMATCH_ACCEPTED') {
                emitResponse({ type: 'REMATCH_ACCEPTED', inviteId });
                if (!thirdPart) return;
                showToast(t('game.rematchAccepted', '재대결이 시작됩니다.'), 'success');
                await refreshProfile();
                navigateToRoom(thirdPart, senderId);
                return;
            }

            if (type === 'REMATCH_REJECTED') {
                emitResponse({ type: 'REMATCH_REJECTED', inviteId });
                showToast(t('game.rematchRejected', '상대가 재대결을 거절했습니다.'), 'info');
            }
        };

        const channel = supabase
            .channel(`rematch_messages:${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages',
                filter: `receiver_id=eq.${user.id}`
            }, (payload: any) => {
                void handleMessage(payload.new);
            })
            .subscribe();

        const pollRematchMessages = async () => {
            const cutoffIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            const { data, error } = await supabase
                .from('chat_messages')
                .select('id, sender_id, content, created_at')
                .eq('receiver_id', user.id)
                .eq('is_read', false)
                .like('content', 'REMATCH_%')
                .gte('created_at', cutoffIso)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) {
                console.error('Failed to poll rematch messages', error);
                return;
            }

            (data || []).forEach((msg) => {
                void handleMessage(msg);
            });
        };

        void pollRematchMessages();
        const pollTimer = window.setInterval(pollRematchMessages, 3000);

        return () => {
            supabase.removeChannel(channel);
            window.clearInterval(pollTimer);
        };
    }, [confirm, navigate, refreshProfile, showToast, t, user]);

    return null;
};

export default RematchListener;
