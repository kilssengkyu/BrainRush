import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';

const GameInviteListener = () => {
    const { user } = useAuth();
    const { confirm, showToast } = useUI();
    const navigate = useNavigate();

    useEffect(() => {
        if (!user) return;

        console.log('GameInviteListener active for user:', user.id);

        const channel = supabase
            .channel(`game_invites:${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages',
                filter: `receiver_id=eq.${user.id}`
            }, async (payload: any) => {
                const msg = payload.new;
                if (msg.content.startsWith('INVITE:')) {
                    const roomId = msg.content.split(':')[1];
                    const senderId = msg.sender_id;

                    console.log('Received invite:', roomId, 'from', senderId);

                    // Fetch sender nickname
                    const { data: senderProfile } = await supabase
                        .from('profiles')
                        .select('nickname')
                        .eq('id', senderId)
                        .single();

                    const senderName = senderProfile?.nickname || '친구';

                    // Show confirmation dialog
                    // We need to handle this carefully to not block if user is already in game
                    // For now, let's just show the confirm
                    const accepted = await confirm(
                        '친선전 요청',
                        `'${senderName}'님이 친선전 대결을 신청했습니다! 수락하시겠습니까?`
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
                                showToast('게임 세션이 유효하지 않거나 이미 시작되었습니다.', 'error');
                                return;
                            }

                            // Join logic is handled by navigation to game page usually, 
                            // but Game page expects 'matchmaking' logic or parameter.
                            // We passed state in Profile.tsx: { roomId, myId, opponentId, mode: 'friendly' }

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
                            showToast('게임 입장에 실패했습니다.', 'error');
                        }
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, navigate, confirm, showToast]);

    return null; // This component renders nothing
};

export default GameInviteListener;
