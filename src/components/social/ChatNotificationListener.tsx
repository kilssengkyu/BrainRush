import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface ChatBannerData {
    id: string;
    text: string;
}

const ChatNotificationListener = () => {
    const { user } = useAuth();
    const { t } = useTranslation();
    const [banner, setBanner] = useState<ChatBannerData | null>(null);
    const timerRef = useRef<number | null>(null);
    const nameCache = useRef<Map<string, string>>(new Map());

    useEffect(() => {
        if (!user) return;

        const channel = supabase
            .channel(`chat_notify_${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages',
                filter: `receiver_id=eq.${user.id}`
            }, async (payload: any) => {
                const msg = payload.new;
                if (!msg) return;
                if (typeof msg.content === 'string') {
                    if (msg.content.startsWith('INVITE:') || msg.content.startsWith('INVITE_')) return;
                }
                const senderId = typeof msg.sender_id === 'string' ? msg.sender_id : '';
                if (!senderId) return;
                let nickname = nameCache.current.get(senderId);
                if (!nickname) {
                    const { data } = await supabase
                        .from('profiles')
                        .select('nickname')
                        .eq('id', senderId)
                        .single();
                    const resolvedNickname = (data?.nickname ?? t('game.unknownPlayer')).toString();
                    nameCache.current.set(senderId, resolvedNickname);
                    nickname = resolvedNickname;
                }

                const preview = (msg.content || '').toString().trim();
                const previewText = preview.length > 30 ? `${preview.slice(0, 30)}...` : preview;
                const text = previewText
                    ? `${nickname}: ${previewText}`
                    : t('social.newMessage', { nickname });

                setBanner({ id: msg.id, text });
                if (timerRef.current) {
                    window.clearTimeout(timerRef.current);
                }
                timerRef.current = window.setTimeout(() => {
                    setBanner(null);
                }, 3000);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            if (timerRef.current) {
                window.clearTimeout(timerRef.current);
            }
        };
    }, [user, t]);

    return (
        <div className="fixed top-[calc(env(safe-area-inset-top)+12px)] left-1/2 -translate-x-1/2 z-[80] pointer-events-none">
            <AnimatePresence>
                {banner && (
                    <motion.div
                        key={banner.id}
                        initial={{ opacity: 0, y: -20, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                        className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border border-blue-400/40 bg-gray-900/90 text-white shadow-xl backdrop-blur-md min-w-[280px]"
                    >
                        <MessageCircle className="w-5 h-5 text-blue-400" />
                        <span className="text-sm font-medium flex-1">{banner.text}</span>
                        <button onClick={() => setBanner(null)} className="text-gray-400 hover:text-white transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ChatNotificationListener;
