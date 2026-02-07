import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Send, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ChatWindowProps {
    friendId: string;
    friendNickname: string;
    onClose: () => void;
}

interface Message {
    id: string;
    sender_id: string;
    receiver_id: string;
    content: string;
    created_at: string;
    is_read: boolean;
}

const SYSTEM_INVITE_PREFIXES = [
    'INVITE:',
    'INVITE_ACCEPTED:',
    'INVITE_REJECTED:',
    'INVITE_BUSY:',
    'INVITE_CANCELLED:'
];

const isSystemInviteMessage = (content?: string | null) =>
    typeof content === 'string' &&
    SYSTEM_INVITE_PREFIXES.some((prefix) => content.startsWith(prefix));

const ChatWindow: React.FC<ChatWindowProps> = ({ friendId, friendNickname, onClose }) => {
    const { user } = useAuth();
    const { t } = useTranslation();
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (user && friendId) {
            fetchMessages();

            // Subscribe to new messages
            // Note: Supabase Realtime filters only support single column checks reliably.
            // We listen for messages where we are the receiver (incoming) or sender (outgoing confirmation)
            // and filter by the friendId in the callback.
            const channel = supabase
                .channel(`chat:${user.id}:${friendId}`)
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'chat_messages',
                    filter: `receiver_id=eq.${user.id}`
                }, (payload: any) => {
                    const newMsg = payload.new as Message;
                    if (isSystemInviteMessage(newMsg.content)) return;
                    // Only process messages from the current chat friend
                    if (newMsg.sender_id === friendId) {
                        setMessages(prev => [...prev, newMsg]);
                        markAsRead([newMsg.id]);
                    }
                })
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'chat_messages',
                    filter: `sender_id=eq.${user.id}`
                }, (payload: any) => {
                    const newMsg = payload.new as Message;
                    if (isSystemInviteMessage(newMsg.content)) return;
                    // Only process messages sent to the current chat friend (sync across devices/tabs)
                    if (newMsg.receiver_id === friendId) {
                        setMessages(prev => {
                            if (prev.find(m => m.id === newMsg.id)) return prev;
                            return [...prev, newMsg];
                        });
                    }
                })
                .subscribe();

            // Clean up
            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [user, friendId]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const fetchMessages = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('chat_messages')
                .select('*')
                .or(`and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`)
                .not('content', 'like', 'INVITE:%')
                .not('content', 'like', 'INVITE_ACCEPTED:%')
                .not('content', 'like', 'INVITE_REJECTED:%')
                .not('content', 'like', 'INVITE_BUSY:%')
                .not('content', 'like', 'INVITE_CANCELLED:%')
                .order('created_at', { ascending: true })
                .limit(50); // Pagination later

            if (error) throw error;
            const filteredMessages = (data || []).filter((msg) => !isSystemInviteMessage(msg.content));
            setMessages(filteredMessages);

            // Mark unread messages from friend as read
            const unreadIds = filteredMessages.filter(m => m.sender_id === friendId && !m.is_read).map(m => m.id);
            if (unreadIds.length > 0) {
                markAsRead(unreadIds);
            }

        } catch (err) {
            console.error("Error fetching messages:", err);
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async (ids: string[]) => {
        if (ids.length === 0) return;
        await supabase
            .from('chat_messages')
            .update({ is_read: true })
            .in('id', ids);
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !user) return;

        const content = newMessage.trim();
        setNewMessage(''); // Clear input immediately

        // Optimistic update
        const tempId = 'temp-' + Date.now();
        const tempMsg: Message = {
            id: tempId,
            sender_id: user.id,
            receiver_id: friendId,
            content: content,
            created_at: new Date().toISOString(),
            is_read: false
        };
        setMessages(prev => [...prev, tempMsg]);

        try {
            const { data, error } = await supabase
                .from('chat_messages')
                .insert({
                    sender_id: user.id,
                    receiver_id: friendId,
                    content: content
                })
                .select()
                .single();

            if (error) throw error;

            // Replace temp with real
            setMessages(prev => prev.map(m => m.id === tempId ? data : m));

        } catch (err) {
            console.error("Error sending message:", err);
            // Remove temp message or show error
            setMessages(prev => prev.filter(m => m.id !== tempId));
            alert(t('social.sendFail'));
        }
    };

    return (
        <div className="fixed bottom-4 right-4 w-80 h-96 bg-slate-800 rounded-lg shadow-2xl flex flex-col border border-slate-600 z-50 overflow-hidden">
            {/* Header */}
            <div className="bg-slate-900 p-3 flex justify-between items-center border-b border-slate-700">
                <div className="font-bold text-white flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    {friendNickname}
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-white">
                    <X size={18} />
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-800">
                {loading && <div className="text-center text-gray-500 text-sm">{t('common.loading')}</div>}

                {messages.map((msg) => {
                    const isMe = msg.sender_id === user?.id;
                    return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-700 text-gray-200 rounded-tl-none'
                                }`}>
                                {msg.content}
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-3 bg-slate-900 border-t border-slate-700 flex gap-2">
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={t('social.typeMessage')}
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-full px-4 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Send size={16} />
                </button>
            </form>
        </div>
    );
};

export default ChatWindow;
