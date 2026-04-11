import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
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
    'INVITE_CANCELLED:',
    'REMATCH_REQUEST:',
    'REMATCH_ACCEPTED:',
    'REMATCH_REJECTED:'
];

const isSystemInviteMessage = (content?: string | null) =>
    typeof content === 'string' &&
    SYSTEM_INVITE_PREFIXES.some((prefix) => content.startsWith(prefix));

const SHORT_WINDOW_MS = 5_000;
const SHORT_LIMIT = 5;
const LONG_WINDOW_MS = 60_000;
const LONG_LIMIT = 20;
const INITIAL_MESSAGE_LIMIT = 30;
const LIVE_MESSAGE_CAP = 100;
const OLDER_PAGE_SIZE = 30;

const ChatWindow: React.FC<ChatWindowProps> = ({ friendId, friendNickname, onClose }) => {
    const { user } = useAuth();
    const { showToast } = useUI();
    const { t } = useTranslation();
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [hasMoreOlder, setHasMoreOlder] = useState(true);
    const [rateLimitUntil, setRateLimitUntil] = useState(0);
    const [rateTickMs, setRateTickMs] = useState(Date.now());
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const sendAttemptTimesRef = useRef<number[]>([]);
    const prependScrollHeightRef = useRef<number | null>(null);
    const previousMessageCountRef = useRef(0);
    const initialScrollReadyRef = useRef(false);
    const userScrolledUpRef = useRef(false);

    const pruneSendAttempts = (now: number) => {
        sendAttemptTimesRef.current = sendAttemptTimesRef.current.filter((ts) => now - ts < LONG_WINDOW_MS);
    };

    const getRateLimitReleaseTime = (now: number) => {
        pruneSendAttempts(now);
        const attempts = sendAttemptTimesRef.current;
        let releaseAt = 0;

        if (attempts.length >= LONG_LIMIT) {
            releaseAt = Math.max(releaseAt, attempts[attempts.length - LONG_LIMIT] + LONG_WINDOW_MS);
        }

        const shortAttempts = attempts.filter((ts) => now - ts < SHORT_WINDOW_MS);
        if (shortAttempts.length >= SHORT_LIMIT) {
            releaseAt = Math.max(releaseAt, shortAttempts[shortAttempts.length - SHORT_LIMIT] + SHORT_WINDOW_MS);
        }

        return releaseAt;
    };

    const remainingMs = Math.max(0, rateLimitUntil - rateTickMs);
    const isRateLimited = remainingMs > 0;

    useEffect(() => {
        if (user && friendId) {
            setMessages([]);
            setHasMoreOlder(true);
            setLoadingOlder(false);
            initialScrollReadyRef.current = false;
            userScrolledUpRef.current = false;
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
                        setMessages(prev => {
                            const next = [...prev, newMsg];
                            return next.length > LIVE_MESSAGE_CAP ? next.slice(next.length - LIVE_MESSAGE_CAP) : next;
                        });
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
                            const next = [...prev, newMsg];
                            return next.length > LIVE_MESSAGE_CAP ? next.slice(next.length - LIVE_MESSAGE_CAP) : next;
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
        const container = messagesContainerRef.current;
        if (!container) return;

        if (prependScrollHeightRef.current !== null) {
            const previousHeight = prependScrollHeightRef.current;
            prependScrollHeightRef.current = null;
            const delta = container.scrollHeight - previousHeight;
            container.scrollTop = Math.max(0, delta);
            previousMessageCountRef.current = messages.length;
            return;
        }

        const previousCount = previousMessageCountRef.current;
        if (messages.length > previousCount) {
            if (previousCount === 0) {
                scrollToBottom('auto');
                initialScrollReadyRef.current = true;
            } else {
                const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
                if (distanceToBottom < 120) {
                    scrollToBottom();
                }
            }
        }
        previousMessageCountRef.current = messages.length;
    }, [messages]);

    useEffect(() => {
        if (!isRateLimited) return;
        const timer = window.setInterval(() => {
            setRateTickMs(Date.now());
        }, 100);
        return () => window.clearInterval(timer);
    }, [isRateLimited]);

    const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
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
                .not('content', 'like', 'REMATCH_REQUEST:%')
                .not('content', 'like', 'REMATCH_ACCEPTED:%')
                .not('content', 'like', 'REMATCH_REJECTED:%')
                // Fetch only recent messages for initial load.
                .order('created_at', { ascending: false })
                .limit(INITIAL_MESSAGE_LIMIT + 1);

            if (error) throw error;
            const filteredMessagesDesc = (data || [])
                .filter((msg) => !isSystemInviteMessage(msg.content))
                .slice(0, INITIAL_MESSAGE_LIMIT);
            const filteredMessages = filteredMessagesDesc.reverse();
            setMessages(filteredMessages);
            setHasMoreOlder((data || []).length > INITIAL_MESSAGE_LIMIT);

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

    const loadOlderMessages = async () => {
        if (!user || loading || loadingOlder || !hasMoreOlder || messages.length === 0) return;

        const oldestMessage = messages[0];
        if (!oldestMessage?.created_at) {
            setHasMoreOlder(false);
            return;
        }

        const container = messagesContainerRef.current;
        prependScrollHeightRef.current = container?.scrollHeight ?? null;
        setLoadingOlder(true);

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
                .not('content', 'like', 'REMATCH_REQUEST:%')
                .not('content', 'like', 'REMATCH_ACCEPTED:%')
                .not('content', 'like', 'REMATCH_REJECTED:%')
                .lt('created_at', oldestMessage.created_at)
                .order('created_at', { ascending: false })
                .limit(OLDER_PAGE_SIZE + 1);

            if (error) throw error;

            const olderMessagesDesc = (data || [])
                .filter((msg) => !isSystemInviteMessage(msg.content))
                .slice(0, OLDER_PAGE_SIZE);
            const olderMessages = olderMessagesDesc.reverse();
            setHasMoreOlder((data || []).length > OLDER_PAGE_SIZE);

            if (olderMessages.length > 0) {
                setMessages(prev => {
                    const existingIds = new Set(prev.map((m) => m.id));
                    const uniqueOlder = olderMessages.filter((m) => !existingIds.has(m.id));
                    return uniqueOlder.length > 0 ? [...uniqueOlder, ...prev] : prev;
                });
            } else {
                prependScrollHeightRef.current = null;
            }
        } catch (err) {
            console.error("Error loading older messages:", err);
            prependScrollHeightRef.current = null;
        } finally {
            setLoadingOlder(false);
        }
    };

    const handleMessagesScroll = () => {
        const container = messagesContainerRef.current;
        if (!container || loading || loadingOlder || !hasMoreOlder || !initialScrollReadyRef.current) return;

        const distanceToBottom = container.scrollHeight - container.clientHeight - container.scrollTop;
        if (distanceToBottom > 120) {
            userScrolledUpRef.current = true;
        }

        if (!userScrolledUpRef.current) return;

        if (container.scrollTop <= 40) {
            void loadOlderMessages();
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

        const now = Date.now();
        const releaseAt = getRateLimitReleaseTime(now);
        if (releaseAt > now) {
            setRateTickMs(now);
            setRateLimitUntil(releaseAt);
            return;
        }

        const content = newMessage.trim();
        setNewMessage(''); // Clear input immediately
        sendAttemptTimesRef.current.push(now);
        const nextReleaseAt = getRateLimitReleaseTime(now);
        setRateTickMs(now);
        setRateLimitUntil(nextReleaseAt);

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
            showToast(t('social.sendFail'), 'error');
        }
    };

    return (
        <div className="fixed bottom-4 right-4 w-80 h-96 bg-white dark:bg-slate-800 rounded-lg shadow-2xl flex flex-col border border-slate-200 dark:border-slate-600 z-50 overflow-hidden">
            {/* Header */}
            <div className="bg-slate-50 dark:bg-slate-900 p-3 flex justify-between items-center border-b border-slate-200 dark:border-slate-700">
                <div className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-sm"></div>
                    {friendNickname}
                </div>
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 dark:text-gray-400 hover:text-slate-600 dark:hover:text-white transition">
                    <X size={18} />
                </button>
            </div>

            {/* Messages */}
            <div
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
                className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50/50 dark:bg-slate-800"
            >
                {loading && <div className="text-center text-slate-400 dark:text-gray-500 text-sm">{t('common.loading')}</div>}
                {!loading && loadingOlder && (
                    <div className="text-center text-slate-400 dark:text-gray-500 text-xs">{t('common.loading')}</div>
                )}

                {messages.map((msg) => {
                    const isMe = msg.sender_id === user?.id;
                    return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm ${isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-gray-200 rounded-tl-none border border-slate-200 dark:border-transparent'
                                }`}>
                                {msg.content}
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder={t('social.typeMessage')}
                        className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-full px-4 py-1.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500 shadow-sm dark:shadow-none"
                    />
                    <button
                        type="submit"
                        disabled={!newMessage.trim() || isRateLimited}
                        className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm dark:shadow-none"
                    >
                        <Send size={16} />
                    </button>
                </div>
                {isRateLimited && (
                    <div className="mt-2 text-[11px] font-medium text-amber-600 dark:text-amber-300">
                        {t('social.chatRateLimited', {
                            seconds: Math.ceil(remainingMs / 1000)
                        })}
                    </div>
                )}
            </form>
        </div>
    );
};

export default ChatWindow;
