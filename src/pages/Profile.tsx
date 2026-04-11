import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, User as UserIcon, ChevronRight, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSound } from '../contexts/SoundContext';
import { useUI } from '../contexts/UIContext';
import { supabase } from '../lib/supabaseClient';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { COUNTRIES } from '../constants/countries';
import Flag from '../components/ui/Flag';
import FriendList from '../components/social/FriendList';
import AddFriend from '../components/social/AddFriend';
import FriendRequests from '../components/social/FriendRequests';
import ChatWindow from '../components/social/ChatWindow';
import MatchHistoryModal from '../components/ui/MatchHistoryModal';
import HexRadar from '../components/ui/HexRadar';
import { getTierFromMMR, getTierColor, getTierIcon } from '../utils/rankUtils';
import LevelBadge from '../components/ui/LevelBadge';
import { getLevelFromXp } from '../utils/levelUtils';
import AvatarModal from '../components/ui/AvatarModal';
import HighscoreLeaderboardModal from '../components/ui/HighscoreLeaderboardModal';

const HIGHSCORE_GAME_TYPES = [
    { type: 'RPS', labelKey: 'rps.title' },
    { type: 'NUMBER', labelKey: 'number.title' },
    { type: 'NUMBER_DESC', labelKey: 'number.titleDesc' },
    { type: 'MATH', labelKey: 'math.title' },
    { type: 'INFINITE_ADD', labelKey: 'infiniteAdd.title' },
    { type: 'TEN', labelKey: 'ten.title' },
    { type: 'COLOR', labelKey: 'color.title' },
    { type: 'MEMORY', labelKey: 'memory.title' },
    { type: 'SEQUENCE', labelKey: 'sequence.title' },
    { type: 'SEQUENCE_NORMAL', labelKey: 'sequence.titleNormal' },
    { type: 'LARGEST', labelKey: 'largest.title' },
    { type: 'PAIR', labelKey: 'pair.title' },
    { type: 'UPDOWN', labelKey: 'updown.title' },
    { type: 'SLIDER', labelKey: 'slider.title' },
    { type: 'ARROW', labelKey: 'arrow.title' },
    { type: 'BLANK', labelKey: 'fillBlanks.title' },
    { type: 'OPERATOR', labelKey: 'findOperator.title' },
    { type: 'LADDER', labelKey: 'ladder.title' },
    { type: 'PATH', labelKey: 'path.title' },
    { type: 'BLIND_PATH', labelKey: 'blindPath.title' },
    { type: 'BALLS', labelKey: 'balls.title' },
    { type: 'CATCH_COLOR', labelKey: 'catchColor.title' },
    { type: 'TAP_COLOR', labelKey: 'tapTheColor.title' },
    { type: 'AIM', labelKey: 'aim.title' },
    { type: 'MOST_COLOR', labelKey: 'mostColor.title' },
    { type: 'SORTING', labelKey: 'sorting.title' },
    { type: 'SPY', labelKey: 'spy.title' },
    { type: 'COLOR_TIMING', labelKey: 'colorTiming.title' },
    { type: 'STAIRWAY', labelKey: 'stairway.title' },
    { type: 'MAKE_ZERO', labelKey: 'zero.title' },
] as const;

type HighscoreGameType = typeof HIGHSCORE_GAME_TYPES[number];

const Profile = () => {
    const { user, profile, signOut, refreshProfile, linkWithGoogle, linkWithApple } = useAuth();
    const { playSound } = useSound();
    const { showToast, confirm } = useUI();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const isIOS = Capacitor.getPlatform() === 'ios';

    const [activeTab, setActiveTab] = useState<'profile' | 'friends'>('profile');
    const [nickname, setNickname] = useState('');
    const [country, setCountry] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement | null>(null);
    const [isCountryModalOpen, setIsCountryModalOpen] = useState(false);
    const [countrySearch, setCountrySearch] = useState('');
    const [highscores, setHighscores] = useState<Record<string, number>>({});
    const [rankStats, setRankStats] = useState<Record<string, { wins: number; losses: number; draws: number }>>({});
    const [isHighscoresLoading, setIsHighscoresLoading] = useState(false);
    const [enabledHighscoreGameIds, setEnabledHighscoreGameIds] = useState<Set<string> | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<{ src: string; alt: string } | null>(null);

    const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB
    const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

    // Match History Modal State
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [historyMode, setHistoryMode] = useState<'all' | 'rank' | 'normal'>('all');

    // Chat State
    const [chatFriend, setChatFriend] = useState<{ id: string; nickname: string } | null>(null);
    const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
    const [unreadChatCount, setUnreadChatCount] = useState(0);
    const [pendingInvite, setPendingInvite] = useState<{ inviteId: string; friendId: string; expiresAt: number } | null>(null);
    const [inviteTimeLeft, setInviteTimeLeft] = useState(0);
    const [selectedHighscoreType, setSelectedHighscoreType] = useState<{ type: string; labelKey: string } | null>(null);
    const [nowMs, setNowMs] = useState(() => Date.now());
    const INVITE_TIMEOUT_MS = 60000;
    const NICKNAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
    const edgeSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
    const edgeSwipeTriggeredRef = useRef(false);

    useEffect(() => {
        if (profile?.nickname) {
            setNickname(profile.nickname);
        }
        if (profile?.country) {
            setCountry(profile.country);
        }
    }, [profile]);

    const deviceCountryCode = useMemo(() => {
        const candidates: string[] = [];
        const pushRegionFromLocale = (locale?: string | null) => {
            if (!locale) return;
            const normalized = locale.replace('_', '-');
            const parts = normalized.split('-');
            if (parts.length >= 2) {
                const region = parts[parts.length - 1]?.toUpperCase();
                if (region && /^[A-Z]{2}$/.test(region)) candidates.push(region);
            }
        };

        if (typeof navigator !== 'undefined') {
            pushRegionFromLocale(navigator.language);
            for (const locale of navigator.languages || []) {
                pushRegionFromLocale(locale);
            }
        }

        if (typeof Intl !== 'undefined') {
            pushRegionFromLocale(Intl.DateTimeFormat().resolvedOptions().locale);
        }

        return candidates.find((code) => COUNTRIES.some((c) => c.code === code)) || null;
    }, []);

    const filteredCountries = useMemo(() => {
        const q = countrySearch.trim().toLowerCase();
        const filtered = COUNTRIES.filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));

        if (!deviceCountryCode) return filtered;

        return [...filtered].sort((a, b) => {
            if (a.code === deviceCountryCode && b.code !== deviceCountryCode) return -1;
            if (b.code === deviceCountryCode && a.code !== deviceCountryCode) return 1;
            return a.name.localeCompare(b.name);
        });
    }, [countrySearch, deviceCountryCode]);

    useEffect(() => {
        if (!user) {
            setPendingRequestsCount(0);
            setUnreadChatCount(0);
            return;
        }

        const fetchPendingRequestsCount = async () => {
            const { count, error } = await supabase
                .from('friendships')
                .select('id', { count: 'exact', head: true })
                .eq('friend_id', user.id)
                .eq('status', 'pending');
            if (!error) setPendingRequestsCount(count || 0);
        };

        const fetchUnreadChatCount = async () => {
            const { count, error } = await supabase
                .from('chat_messages')
                .select('id', { count: 'exact', head: true })
                .eq('receiver_id', user.id)
                .eq('is_read', false)
                .not('content', 'like', 'INVITE:%')
                .not('content', 'like', 'INVITE_ACCEPTED:%')
                .not('content', 'like', 'INVITE_REJECTED:%')
                .not('content', 'like', 'INVITE_BUSY:%')
                .not('content', 'like', 'INVITE_CANCELLED:%');
            if (!error) setUnreadChatCount(count || 0);
        };

        fetchPendingRequestsCount();
        fetchUnreadChatCount();

        const friendRequestChannel = supabase
            .channel(`friend_requests_count_${user.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'friendships',
                filter: `friend_id=eq.${user.id}`
            }, () => {
                fetchPendingRequestsCount();
            })
            .subscribe();

        const unreadChatChannel = supabase
            .channel(`unread_chat_count_${user.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'chat_messages',
                filter: `receiver_id=eq.${user.id}`
            }, () => {
                fetchUnreadChatCount();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(friendRequestChannel);
            supabase.removeChannel(unreadChatChannel);
        };
    }, [user]);

    useEffect(() => {
        const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (activeTab !== 'profile') return;
        if (!user) {
            setHighscores({});
            setRankStats({});
            return;
        }

        let isActive = true;
        const fetchHighscores = async () => {
            setIsHighscoresLoading(true);
            const [highscoreResult, statsResult] = await Promise.all([
                supabase
                    .from('player_highscores')
                    .select('game_type, best_score')
                    .eq('user_id', user.id),
                supabase
                    .from('player_game_stats')
                    .select('game_type, rank_wins, rank_losses, rank_draws')
                    .eq('user_id', user.id)
            ]);
            if (!isActive) return;

            if (highscoreResult.error) {
                console.error('Failed to load highscores', highscoreResult.error);
            } else {
                const nextScores = (highscoreResult.data || []).reduce<Record<string, number>>((acc, row) => {
                    acc[row.game_type] = row.best_score ?? 0;
                    return acc;
                }, {});
                setHighscores(nextScores);
            }

            if (statsResult.error) {
                console.error('Failed to load game stats', statsResult.error);
            } else {
                const nextRankStats = (statsResult.data || []).reduce<Record<string, { wins: number; losses: number; draws: number }>>((acc, row) => {
                    acc[row.game_type] = {
                        wins: row.rank_wins ?? 0,
                        losses: row.rank_losses ?? 0,
                        draws: row.rank_draws ?? 0
                    };
                    return acc;
                }, {});
                setRankStats(nextRankStats);
            }
            setIsHighscoresLoading(false);
        };

        fetchHighscores();
        return () => {
            isActive = false;
        };
    }, [activeTab, user]);

    useEffect(() => {
        if (activeTab !== 'profile') return;

        let isActive = true;
        const fetchEnabledHighscoreGames = async () => {
            const { data, error } = await (supabase as any)
                .from('game_catalog')
                .select('game_type, is_enabled, use_in_rank, use_in_normal')
                .eq('is_enabled', true);

            if (!isActive) return;

            if (error) {
                console.error('Failed to load highscore game catalog', error);
                setEnabledHighscoreGameIds(null);
                return;
            }

            const ids = new Set<string>(
                (data || [])
                    .filter((row: any) => Boolean(row.use_in_rank) || Boolean(row.use_in_normal))
                    .map((row: any) => String(row.game_type))
            );
            setEnabledHighscoreGameIds(ids);
        };

        fetchEnabledHighscoreGames();
        return () => {
            isActive = false;
        };
    }, [activeTab]);

    const highscoreGameTypes = useMemo<HighscoreGameType[]>(() => {
        if (!enabledHighscoreGameIds) return [...HIGHSCORE_GAME_TYPES];
        return HIGHSCORE_GAME_TYPES.filter((game) => enabledHighscoreGameIds.has(game.type));
    }, [enabledHighscoreGameIds]);

    const cancelPendingInvite = useCallback(async (reason: 'cancel' | 'timeout', inviteOverride?: { inviteId: string; friendId: string }) => {
        if (!user) return;
        const invite = inviteOverride ?? pendingInvite;
        if (!invite) return;

        setPendingInvite(null);
        setInviteTimeLeft(0);

        try {
            const { error: msgError } = await supabase
                .from('chat_messages')
                .insert({
                    sender_id: user.id,
                    receiver_id: invite.friendId,
                    content: `INVITE_CANCELLED:${invite.inviteId}`
                });

            if (msgError) console.error('Failed to send invite cancel message', msgError);
        } catch (err) {
            console.error('Failed to cancel friendly invite:', err);
            showToast(t('common.error'), 'error');
            return;
        }

        if (reason === 'timeout') {
            showToast(t('social.challengeTimeout'), 'info');
        } else {
            showToast(t('social.challengeCancelled'), 'info');
        }
    }, [pendingInvite, showToast, t, user]);

    useEffect(() => {
        if (!pendingInvite) return;
        let didTimeout = false;

        const tick = () => {
            const remainingMs = pendingInvite.expiresAt - Date.now();
            const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
            setInviteTimeLeft(remainingSec);

            if (!didTimeout && remainingMs <= 0) {
                didTimeout = true;
                cancelPendingInvite('timeout');
            }
        };

        tick();
        const timer = setInterval(tick, 500);
        return () => clearInterval(timer);
    }, [pendingInvite, cancelPendingInvite]);

    useEffect(() => {
        if (!user || !pendingInvite) return;
        const handledMessageIds = new Set<string>();

        const handleInviteResponseMessage = (msg: any) => {
            if (!msg?.content || typeof msg.content !== 'string') return;
            if (!msg.content.startsWith('INVITE_')) return;
            if (msg.id && handledMessageIds.has(msg.id)) return;

            const parts = msg.content.split(':');
            const type = parts[0];
            const inviteId = parts[1];
            const roomId = parts[2];
            if (!inviteId || inviteId !== pendingInvite.inviteId) return;

            if (msg.id) handledMessageIds.add(msg.id);

            if (type === 'INVITE_ACCEPTED') {
                setPendingInvite(null);
                setInviteTimeLeft(0);
                showToast(t('social.challengeAccepted'), 'success');
                if (!roomId) return;
                navigate(`/game/${roomId}`, {
                    state: { roomId, myId: user.id, opponentId: pendingInvite.friendId, mode: 'friendly' }
                });
            } else if (type === 'INVITE_REJECTED') {
                setPendingInvite(null);
                setInviteTimeLeft(0);
                showToast(t('social.challengeRejected'), 'info');
            } else if (type === 'INVITE_BUSY') {
                setPendingInvite(null);
                setInviteTimeLeft(0);
                showToast(t('social.challengeInGame'), 'info');
            } else if (type === 'INVITE_CANCELLED') {
                setPendingInvite(null);
                setInviteTimeLeft(0);
                showToast(t('social.challengeCancelled'), 'info');
            }
        };

        const channel = supabase
            .channel(`invite_responses_${user.id}_${pendingInvite.inviteId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages',
                filter: `receiver_id=eq.${user.id}`
            }, (payload: any) => {
                handleInviteResponseMessage(payload.new);
            })
            .subscribe();

        const pollResponses = async () => {
            const cutoffIso = new Date(Date.now() - 2 * 60 * 1000).toISOString();
            const { data, error } = await supabase
                .from('chat_messages')
                .select('id, content, created_at')
                .eq('receiver_id', user.id)
                .like('content', 'INVITE_%')
                .gte('created_at', cutoffIso)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) {
                console.error('Failed to poll invite responses', error);
                return;
            }

            (data || []).forEach((msg) => handleInviteResponseMessage(msg));
        };

        // Cover realtime subscription race: process any response that arrived just before subscribe
        pollResponses();
        const pollTimer = window.setInterval(pollResponses, 1500);

        return () => {
            supabase.removeChannel(channel);
            window.clearInterval(pollTimer);
        };
    }, [user, pendingInvite, navigate, showToast, t]);

    const handleBack = () => {
        playSound('click');
        navigate('/');
    };

    const isEdgeSwipeBlocked =
        isCountryModalOpen ||
        showHistoryModal ||
        !!avatarPreview ||
        !!selectedHighscoreType ||
        !!chatFriend ||
        !!pendingInvite;

    useEffect(() => {
        const handleModalCloseRequest = (event: Event) => {
            const customEvent = event as CustomEvent<{ handled?: boolean }>;
            if (customEvent.detail?.handled) return;

            if (isCountryModalOpen) {
                setCountrySearch('');
                setIsCountryModalOpen(false);
                if (customEvent.detail) customEvent.detail.handled = true;
                return;
            }

            if (pendingInvite) {
                void cancelPendingInvite('cancel');
                if (customEvent.detail) customEvent.detail.handled = true;
                return;
            }

            if (chatFriend) {
                setChatFriend(null);
                if (customEvent.detail) customEvent.detail.handled = true;
            }
        };
        window.addEventListener('brainrush:request-modal-close', handleModalCloseRequest as EventListener);
        return () => {
            window.removeEventListener('brainrush:request-modal-close', handleModalCloseRequest as EventListener);
        };
    }, [isCountryModalOpen, pendingInvite, chatFriend, cancelPendingInvite]);

    const handleEdgeSwipeStart = (event: React.TouchEvent<HTMLDivElement>) => {
        if (isEdgeSwipeBlocked || event.touches.length !== 1) {
            edgeSwipeStartRef.current = null;
            edgeSwipeTriggeredRef.current = false;
            return;
        }

        const touch = event.touches[0];
        if (touch.clientX > 24) {
            edgeSwipeStartRef.current = null;
            edgeSwipeTriggeredRef.current = false;
            return;
        }

        edgeSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
        edgeSwipeTriggeredRef.current = false;
    };

    const handleEdgeSwipeMove = (event: React.TouchEvent<HTMLDivElement>) => {
        if (!edgeSwipeStartRef.current || edgeSwipeTriggeredRef.current || event.touches.length !== 1) return;

        const touch = event.touches[0];
        const deltaX = touch.clientX - edgeSwipeStartRef.current.x;
        const deltaY = touch.clientY - edgeSwipeStartRef.current.y;

        if (deltaX > 72 && deltaX > Math.abs(deltaY) * 1.35) {
            edgeSwipeTriggeredRef.current = true;
            handleBack();
        }
    };

    const handleEdgeSwipeEnd = () => {
        edgeSwipeStartRef.current = null;
        edgeSwipeTriggeredRef.current = false;
    };

    const handleSave = async () => {
        if (!user || !nickname.trim()) return;

        playSound('click');
        setIsLoading(true);

        try {
            const nextNickname = nickname.trim();
            const prevNickname = String(profile?.nickname || '').trim();
            const prevCountry = profile?.country || null;
            const nicknameChanged = prevNickname !== nextNickname;
            const countryChanged = prevCountry !== (country || null);
            const { error } = await supabase.rpc('update_my_profile', {
                p_nickname: nextNickname,
                p_country: country || null
            });

            if (error) throw error;

            await refreshProfile();
            setIsEditing(false);
            if (nicknameChanged) {
                showToast(t('profile.nicknameChangedSuccess'), 'success');
            } else if (countryChanged) {
                showToast(t('profile.updateSuccess'), 'success');
            }
        } catch (error: any) {
            console.error('Error updating profile:', error);
            const message = (error?.message || '').toString().toLowerCase();

            if (message.includes('already in use')) {
                showToast(t('profile.nicknameTaken'), 'error');
            } else if (message.includes('between 2 and 20')) {
                showToast(t('profile.nicknameInvalid'), 'error');
            } else if (message.includes('once every 30 days') || message.includes('with a ticket')) {
                showToast(t('profile.nicknameCooldownOrTicket'), 'error');
            } else {
                showToast(`${t('profile.updateFail')}: ${error.message || error}`, 'error');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleAvatarSelect = async (file: File) => {
        if (!user) return;

        if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
            showToast(t('profile.avatarInvalidType'), 'error');
            return;
        }

        if (file.size > MAX_AVATAR_SIZE) {
            showToast(t('profile.avatarTooLarge'), 'error');
            return;
        }

        setIsUploadingAvatar(true);
        try {
            const extFromType: Record<string, string> = {
                'image/jpeg': 'jpg',
                'image/png': 'png',
                'image/webp': 'webp'
            };
            const fileExt = extFromType[file.type] || file.name.split('.').pop() || 'jpg';
            const filePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file, {
                    contentType: file.type,
                    cacheControl: '3600',
                    upsert: true
                });

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            const publicUrl = publicUrlData?.publicUrl;
            if (!publicUrl) {
                throw new Error('Failed to get public URL');
            }

            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: publicUrl })
                .eq('id', user.id);

            if (updateError) throw updateError;

            await refreshProfile();
            showToast(t('profile.avatarUploadSuccess'), 'success');
        } catch (error: any) {
            console.error('Avatar upload error:', error);
            showToast(`${t('profile.avatarUploadFail')}: ${error.message || error}`, 'error');
        } finally {
            setIsUploadingAvatar(false);
            if (avatarInputRef.current) {
                avatarInputRef.current.value = '';
            }
        }
    };

    const handleAvatarRemove = async () => {
        if (!user || !profile?.avatar_url) return;

        const confirmed = await confirm(
            t('profile.removeAvatar'),
            t('profile.removeAvatarConfirm')
        );
        if (!confirmed) return;

        setIsUploadingAvatar(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ avatar_url: null })
                .eq('id', user.id);

            if (error) throw error;
            await refreshProfile();
            showToast(t('profile.avatarRemoveSuccess'), 'success');
        } catch (error: any) {
            console.error('Avatar remove error:', error);
            showToast(`${t('profile.avatarRemoveFail')}: ${error.message || error}`, 'error');
        } finally {
            setIsUploadingAvatar(false);
        }
    };

    const handleChatClick = (friendId: string, nickname: string) => {
        setChatFriend({ id: friendId, nickname });
    };

    const handleChallengeClick = async (friendId: string) => {
        if (!user) return;
        if (pendingInvite) {
            showToast(t('social.challengeAlreadyPending'), 'info');
            return;
        }

        try {
            const confirmed = await confirm(t('social.challengeTitle'), t('social.challengeConfirm'));
            if (!confirmed) return;

            setIsLoading(true);

            const inviteId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

            // 1. Send Invite Message (session will be created on accept)
            const { error: msgError } = await supabase
                .from('chat_messages')
                .insert({
                    sender_id: user.id,
                    receiver_id: friendId,
                    content: `INVITE:${user.id}:${inviteId}`
                });

            if (msgError) console.error("Failed to send invite message", msgError);

            // 2. Wait for acceptance before entering the room
            setPendingInvite({ inviteId, friendId, expiresAt: Date.now() + INVITE_TIMEOUT_MS });
            setInviteTimeLeft(Math.ceil(INVITE_TIMEOUT_MS / 1000));
            showToast(t('social.challengeWaiting'), 'info');

        } catch (err: any) {
            console.error('Error challenging friend:', err);
            showToast(t('social.challengeFail') + err.message, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenHistory = (mode: 'rank' | 'normal' | 'all') => {
        playSound('click');
        setHistoryMode(mode);
        setShowHistoryModal(true);
    };

    // Calculate stats
    const rank = profile?.mmr || 1000;
    const placementRequiredGames = 1;
    const rankGamesPlayed = Math.max(0, Number((profile as any)?.rank_games_played ?? 0));
    const isPlacement = rankGamesPlayed < placementRequiredGames;
    const rankGamesRemaining = Math.max(0, placementRequiredGames - rankGamesPlayed);
    const tier = getTierFromMMR(rank);
    const isShinyTier = tier === 'Diamond' || tier === 'Master';
    const tierColor = getTierColor(tier);
    const TierIcon = getTierIcon(tier);
    const level = typeof profile?.level === 'number'
        ? profile.level
        : typeof profile?.xp === 'number'
            ? getLevelFromXp(profile.xp)
            : 1;
    const wins = profile?.wins || 0;
    const losses = profile?.losses || 0;
    const casualWins = profile?.casual_wins || 0;
    const casualLosses = profile?.casual_losses || 0;
    const statValues = {
        speed: profile?.speed || 0,
        memory: profile?.memory || 0,
        judgment: profile?.judgment || 0,
        calculation: profile?.calculation || 0,
        accuracy: profile?.accuracy || 0,
        observation: profile?.observation || 0
    };
    const hasSocialNotifications = pendingRequestsCount > 0 || unreadChatCount > 0;
    const needsNicknameSetup = Boolean(profile?.needs_nickname_setup);
    const isGuest = Boolean(user?.is_anonymous || user?.app_metadata?.provider === 'anonymous');
    const nicknameChangeTickets = Math.max(0, Number(profile?.nickname_change_tickets ?? 0));
    const nicknameSetAtMs = profile?.nickname_set_at ? Date.parse(profile.nickname_set_at) : NaN;
    const nextFreeNicknameChangeMs = Number.isFinite(nicknameSetAtMs) ? nicknameSetAtMs + NICKNAME_COOLDOWN_MS : null;
    const isNicknameFreeChangeAvailable = needsNicknameSetup || !nextFreeNicknameChangeMs || nowMs >= nextFreeNicknameChangeMs;
    const canChangeNicknameNow = isNicknameFreeChangeAvailable || nicknameChangeTickets > 0;
    const nextFreeNicknameChangeText = nextFreeNicknameChangeMs
        ? new Date(nextFreeNicknameChangeMs).toLocaleString(i18n.language || undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        })
        : null;

    return (
        <div
            className={`h-[100dvh] flex flex-col items-center p-4 pt-[calc(env(safe-area-inset-top)+1rem)] relative overflow-hidden bg-slate-50 dark:bg-gray-900 text-slate-900 dark:text-white`}
            onTouchStart={handleEdgeSwipeStart}
            onTouchMove={handleEdgeSwipeMove}
            onTouchEnd={handleEdgeSwipeEnd}
            onTouchCancel={handleEdgeSwipeEnd}
        >
            {/* Background Effects */}
            <div className={`absolute top-0 left-0 w-full h-full pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white via-slate-100 to-slate-200 dark:from-gray-800 dark:via-gray-900 dark:to-black`} />

            {/* Header */}
            <div className="w-full max-w-md flex justify-between items-center z-10 mb-8 pt-4">
                <button onClick={handleBack} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                    <ArrowLeft className="w-6 h-6 text-slate-800 dark:text-gray-200" />
                </button>
                <div className="flex bg-white dark:bg-slate-800 rounded-full p-1 border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
                    <button
                        onClick={() => setActiveTab('profile')}
                        className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${activeTab === 'profile' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white'}`}
                    >
                        {t('menu.profile')}
                    </button>
                    <button
                        onClick={() => setActiveTab('friends')}
                        className={`relative px-4 py-1.5 rounded-full text-sm font-bold transition-all flex items-center gap-1 ${activeTab === 'friends' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white'}`}
                    >
                        {t('social.friends')}
                        {hasSocialNotifications && (
                            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-800" aria-hidden="true"></span>
                        )}
                    </button>
                </div>
                <div className="w-10" />
            </div>

            {/* Content */}
            <div className="flex-1 w-full flex flex-col items-center overflow-y-auto pb-8 no-scrollbar">
                <AnimatePresence mode="wait">
                    {activeTab === 'profile' ? (
                        <motion.div
                            key="profile"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="w-full max-w-md bg-white dark:bg-gray-800/50 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl relative z-10"
                        >
                            {isGuest && (
                                <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-center dark:border-amber-500/40 dark:bg-amber-500/10">
                                    <div className="text-sm font-bold text-amber-800 dark:text-amber-200">
                                        {t('profile.guestTitle')}
                                    </div>
                                    <div className="mt-1 text-xs text-amber-700 dark:text-amber-100/80">
                                        {t(isIOS ? 'profile.guestDescIOS' : 'profile.guestDesc')}
                                    </div>
                                    <div className="mt-3 flex items-center justify-center gap-2">
                                        {isIOS && (
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await linkWithApple();
                                                    } catch (err: any) {
                                                        console.error('Failed to link apple:', err);
                                                        if (err?.message?.includes('이미 가입된')) {
                                                            const isConfirmed = await confirm(
                                                                t('profile.accountConflictTitle', '기존 계정 발견!'),
                                                                t('profile.accountExistsLoginHint', '이미 존재하는 계정입니다. 로그아웃 후 해당 계정으로 로그인해 주세요.')
                                                            );
                                                            if (isConfirmed) {
                                                                await signOut();
                                                            }
                                                        } else {
                                                            showToast(err?.message || t('common.error'), 'error');
                                                        }
                                                    }
                                                }}
                                                className="inline-flex items-center justify-center rounded-full border border-amber-300 bg-amber-100 px-4 py-2 text-xs font-bold text-amber-900 hover:bg-amber-200 transition-colors dark:border-white/10 dark:bg-white/10 dark:text-amber-100 dark:hover:bg-white/20"
                                            >
                                                {t('profile.linkApple')}
                                            </button>
                                        )}
                                        <button
                                            onClick={async () => {
                                                try {
                                                    await linkWithGoogle();
                                                } catch (err: any) {
                                                    console.error('Failed to link google:', err);
                                                    if (err?.message?.includes('이미 가입된')) {
                                                        const isConfirmed = await confirm(
                                                            t('profile.accountConflictTitle', '기존 계정 발견!'),
                                                            t('profile.accountExistsLoginHint', '이미 존재하는 계정입니다. 로그아웃 후 해당 계정으로 로그인해 주세요.')
                                                        );
                                                        if (isConfirmed) {
                                                            await signOut();
                                                        }
                                                    } else {
                                                        showToast(err?.message || t('common.error'), 'error');
                                                    }
                                                }
                                            }}
                                            className="inline-flex items-center justify-center rounded-full border border-amber-300 bg-amber-100 px-4 py-2 text-xs font-bold text-amber-900 hover:bg-amber-200 transition-colors dark:border-white/10 dark:bg-white/10 dark:text-amber-100 dark:hover:bg-white/20"
                                        >
                                            {t('profile.linkGoogle')}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Avatar Section */}
                            <div className="flex flex-col items-center mb-8">
                                <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 p-[3px] mb-4">
                                    <button
                                        type="button"
                                        className="w-full h-full rounded-full bg-slate-50 dark:bg-gray-900 flex items-center justify-center overflow-hidden cursor-zoom-in"
                                        onClick={() => {
                                            if (profile?.avatar_url) {
                                                setAvatarPreview({
                                                    src: profile.avatar_url,
                                                    alt: nickname ? t('profile.avatarAltWithName', { nickname }) : t('profile.avatarAlt')
                                                });
                                            }
                                        }}
                                        aria-label={t('profile.openAvatar')}
                                    >
                                        {profile?.avatar_url ? (
                                            <img src={profile.avatar_url} alt={t('profile.avatarAlt')} className="w-full h-full object-cover" />
                                        ) : (
                                            <UserIcon className="w-12 h-12 text-slate-500 dark:text-gray-400" />
                                        )}
                                    </button>
                                    {isEditing && profile?.avatar_url && (
                                        <button
                                            type="button"
                                            onClick={handleAvatarRemove}
                                            disabled={isUploadingAvatar || isLoading}
                                            aria-label={t('profile.removeAvatar')}
                                            className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-red-600/90 hover:bg-red-500 text-slate-900 dark:text-white border border-white/20 flex items-center justify-center transition-colors disabled:opacity-50"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                    <LevelBadge level={level} size="md" className="absolute -bottom-1 -right-1 ring-2 ring-gray-900" />
                                </div>
                                <input
                                    ref={avatarInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleAvatarSelect(file);
                                    }}
                                />
                                <button
                                    onClick={() => avatarInputRef.current?.click()}
                                    disabled={isUploadingAvatar || isLoading}
                                    className="text-xs text-blue-300 hover:text-blue-200 border border-blue-500/40 px-3 py-1 rounded-full transition-colors disabled:opacity-50"
                                >
                                    {isUploadingAvatar ? t('profile.avatarUploading') : t('profile.changeAvatar')}
                                </button>

                                {/* Nickname & Country Edit */}
                                <div className="mt-3 flex flex-col items-center gap-4 w-full justify-center">
                                    {isEditing ? (
                                        <div className="flex flex-col gap-2 w-full max-w-[240px]">
                                            <input
                                                type="text"
                                                value={nickname}
                                                onChange={(e) => setNickname(e.target.value)}
                                                className="w-full bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 text-center text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 shadow-sm"
                                                placeholder={t('profile.nicknamePlaceholder')}
                                                maxLength={12}
                                            />

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    playSound('click');
                                                    setCountrySearch('');
                                                    setIsCountryModalOpen(true);
                                                }}
                                                className="w-full bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 flex items-center justify-between shadow-sm"
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Flag code={country} size="sm" />
                                                    <span className="truncate text-sm">
                                                        {country ? COUNTRIES.find((c) => c.code === country)?.name : t('profile.selectCountry')}
                                                    </span>
                                                </div>
                                                <ChevronRight className="w-4 h-4 text-slate-400 dark:text-gray-300" />
                                            </button>

                                            <div className="mt-2 grid grid-cols-2 gap-2">
                                                <button
                                                    onClick={() => {
                                                        playSound('click');
                                                        setNickname(profile?.nickname || '');
                                                        setCountry(profile?.country || null);
                                                        setIsEditing(false);
                                                    }}
                                                    disabled={isLoading}
                                                    className="p-2 bg-slate-200 dark:bg-gray-600 text-slate-700 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-gray-500 disabled:opacity-50 w-full flex justify-center items-center text-sm font-bold shadow-sm"
                                                >
                                                    {t('common.cancel')}
                                                </button>
                                                <button
                                                    onClick={handleSave}
                                                    disabled={isLoading}
                                                    className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 w-full flex justify-center shadow-sm"
                                                >
                                                    <Save className="w-5 h-5" />
                                                </button>
                                            </div>

                                            <div className={`mt-2 rounded-lg border px-3 py-2 text-left ${canChangeNicknameNow ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                                                <div className="flex items-center justify-between gap-2 text-xs">
                                                    <span className="text-slate-600 dark:text-gray-300">{t('profile.nicknameTicketsLabel')}</span>
                                                    <span className="font-bold text-slate-900 dark:text-white">{nicknameChangeTickets}</span>
                                                </div>
                                                <div className={`mt-1 text-xs font-semibold ${canChangeNicknameNow ? 'text-emerald-300' : 'text-red-300'}`}>
                                                    {canChangeNicknameNow
                                                        ? t('profile.nicknameChangeAvailableNow')
                                                        : t('profile.nicknameChangeUnavailableNow')}
                                                </div>
                                                <div className="mt-1 text-[11px] text-slate-500 dark:text-gray-400 leading-tight">
                                                    {isNicknameFreeChangeAvailable
                                                        ? t('profile.nicknameFreeChangeNow')
                                                        : t('profile.nicknameFreeChangeAt', {
                                                            date: nextFreeNicknameChangeText || '-'
                                                        })}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-1">
                                            <div className="flex items-center gap-2">
                                                <Flag code={country} size="lg" className="mr-1" />
                                                <h2 className="text-2xl font-bold">{nickname}</h2>
                                                <button
                                                    onClick={() => { playSound('click'); setIsEditing(true); }}
                                                    className="relative text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white text-xs bg-white dark:bg-gray-800 px-2 py-1 rounded border border-slate-300 dark:border-gray-700 ml-2 shadow-sm"
                                                >
                                                    {t('profile.edit')}
                                                    {needsNicknameSetup && (
                                                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-800" aria-hidden="true"></span>
                                                    )}
                                                </button>
                                            </div>
                                            {country && (
                                                <span className="text-gray-500 text-xs">
                                                    {COUNTRIES.find(c => c.code === country)?.name}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className={`col-span-2 rounded-2xl shadow-lg transform hover:scale-[1.01] transition-transform overflow-hidden ${isPlacement
                                    ? 'bg-gradient-to-br from-slate-300 to-slate-200 dark:from-slate-700 dark:to-slate-600 p-[2px]'
                                    : `bg-gradient-to-br ${tierColor} p-0`
                                    }`}>
                                    <div className={`w-full h-full rounded-2xl p-4 flex items-center justify-center ${isPlacement ? 'bg-white dark:bg-gray-800' : 'relative bg-black/10 dark:bg-black/20'}`}>
                                        {!isPlacement && (
                                            <>
                                                <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(120deg,rgba(255,255,255,0.42)_0%,rgba(255,255,255,0.1)_36%,rgba(0,0,0,0.14)_100%)]" />
                                                {isShinyTier && (
                                                    <motion.div
                                                        className="absolute inset-y-0 -left-1/2 w-1/2 pointer-events-none"
                                                        initial={{ x: '-130%' }}
                                                        animate={{ x: '300%' }}
                                                        transition={{ duration: 2.1, repeat: Infinity, ease: 'linear' }}
                                                        style={{ background: 'linear-gradient(105deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.0) 20%, rgba(255,255,255,0.45) 50%, rgba(255,255,255,0) 85%)' }}
                                                    />
                                                )}
                                                <div className="absolute inset-[1px] rounded-[15px] border border-white/25 dark:border-white/20 pointer-events-none" />
                                            </>
                                        )}
                                        <div className={`min-w-0 w-full ${isPlacement ? 'flex flex-col justify-center items-center text-center leading-tight' : 'relative z-10 flex items-center justify-center gap-4'}`}>
                                            {isPlacement ? (
                                                <>
                                                    <div className="text-2xl font-black text-slate-900 dark:text-white truncate">
                                                        {t('profile.rankPlacement')}
                                                    </div>
                                                    <div className="text-xs font-semibold text-amber-600 dark:text-amber-300 mt-2">
                                                        {t('profile.rankPlacementRemaining', { count: rankGamesRemaining })}
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="w-16 h-16 rounded-xl bg-black/5 dark:bg-black/20 border border-black/5 dark:border-white/10 flex items-center justify-center shrink-0">
                                                        <TierIcon className="w-12 h-12 object-contain drop-shadow-sm dark:drop-shadow-md" />
                                                    </div>
                                                    <div className="min-w-0 leading-tight text-left">
                                                        <div className="text-2xl font-black text-white truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">{tier}</div>
                                                        <div className="text-xl font-black text-white/95 font-mono mt-1 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">{rank}</div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Rank Record */}
                                <button
                                    onClick={() => handleOpenHistory('rank')}
                                    className="bg-white dark:bg-gray-700/30 p-4 rounded-2xl flex flex-col items-center col-span-2 shadow-sm border border-slate-200 dark:border-transparent hover:bg-slate-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                                >
                                    <span className="text-xs text-blue-600 dark:text-blue-300 mb-1 font-bold uppercase tracking-wider">{t('game.rank')} {t('profile.record')}</span>
                                    <div className="flex gap-4 items-end">
                                        <span className="text-lg font-bold text-blue-500 dark:text-blue-400">{wins}W</span>
                                        <span className="text-lg font-bold text-red-500 dark:text-red-400">{losses}L</span>
                                    </div>
                                </button>

                                {/* Casual Record */}
                                <button
                                    onClick={() => handleOpenHistory('normal')}
                                    className="bg-white dark:bg-gray-700/30 p-4 rounded-2xl flex flex-col items-center col-span-2 shadow-sm border border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                                >
                                    <span className="text-xs text-emerald-600 dark:text-green-300 mb-1 font-bold uppercase tracking-wider">{t('game.normal')} {t('profile.record')}</span>
                                    <div className="flex gap-4 items-end">
                                        <span className="text-lg font-bold text-emerald-500 dark:text-blue-300">{casualWins}W</span>
                                        <span className="text-lg font-bold text-red-500 dark:text-red-300">{casualLosses}L</span>
                                    </div>
                                </button>
                            </div>

                            {/* Skill Radar */}
                            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-white/10">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 dark:text-gray-400 mb-4 text-center">
                                    {t('profile.statsTitle')}
                                </h3>
                                <HexRadar
                                    values={statValues}
                                    labels={{
                                        speed: t('profile.stats.speed'),
                                        memory: t('profile.stats.memory'),
                                        judgment: t('profile.stats.judgment'),
                                        calculation: t('profile.stats.calculation'),
                                        accuracy: t('profile.stats.accuracy'),
                                        observation: t('profile.stats.observation')
                                    }}
                                />
                                <div className="grid grid-cols-3 gap-2 mt-4 text-xs text-slate-600 dark:text-gray-400">
                                    <div className="flex items-center justify-between bg-slate-50 dark:bg-gray-800/50 rounded-lg px-2 py-1 shadow-sm dark:shadow-none border border-slate-200 dark:border-transparent">
                                        <span>{t('profile.stats.speed')}</span>
                                        <span className="text-blue-600 dark:text-blue-300 font-bold">{statValues.speed}</span>
                                    </div>
                                    <div className="flex items-center justify-between bg-slate-50 dark:bg-gray-800/50 rounded-lg px-2 py-1 shadow-sm dark:shadow-none border border-slate-200 dark:border-transparent">
                                        <span>{t('profile.stats.memory')}</span>
                                        <span className="text-blue-600 dark:text-blue-300 font-bold">{statValues.memory}</span>
                                    </div>
                                    <div className="flex items-center justify-between bg-slate-50 dark:bg-gray-800/50 rounded-lg px-2 py-1 shadow-sm dark:shadow-none border border-slate-200 dark:border-transparent">
                                        <span>{t('profile.stats.judgment')}</span>
                                        <span className="text-blue-600 dark:text-blue-300 font-bold">{statValues.judgment}</span>
                                    </div>
                                    <div className="flex items-center justify-between bg-slate-50 dark:bg-gray-800/50 rounded-lg px-2 py-1 shadow-sm dark:shadow-none border border-slate-200 dark:border-transparent">
                                        <span>{t('profile.stats.calculation')}</span>
                                        <span className="text-blue-600 dark:text-blue-300 font-bold">{statValues.calculation}</span>
                                    </div>
                                    <div className="flex items-center justify-between bg-slate-50 dark:bg-gray-800/50 rounded-lg px-2 py-1 shadow-sm dark:shadow-none border border-slate-200 dark:border-transparent">
                                        <span>{t('profile.stats.accuracy')}</span>
                                        <span className="text-blue-600 dark:text-blue-300 font-bold">{statValues.accuracy}</span>
                                    </div>
                                    <div className="flex items-center justify-between bg-slate-50 dark:bg-gray-800/50 rounded-lg px-2 py-1 shadow-sm dark:shadow-none border border-slate-200 dark:border-transparent">
                                        <span>{t('profile.stats.observation')}</span>
                                        <span className="text-blue-600 dark:text-blue-300 font-bold">{statValues.observation}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Highscores */}
                            <div className="mt-8 pt-6 border-t border-white/10">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 dark:text-gray-400 mb-4 text-center">
                                    {t('profile.highscoresTitle')}
                                </h3>
                                {isHighscoresLoading ? (
                                    <div className="text-center text-sm text-gray-500">
                                        {t('common.loading')}
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2 text-xs">
                                        <div className="grid grid-cols-[1.4fr_0.8fr_0.6fr] gap-2 text-[10px] uppercase tracking-wider text-gray-500 px-2">
                                            <span>{t('profile.highscoresColumns.game')}</span>
                                            <span className="text-right">{t('profile.highscoresColumns.highscore')}</span>
                                            <span className="text-right">{t('profile.highscoresColumns.rankWinRate')}</span>
                                        </div>
                                        {highscoreGameTypes.map(({ type, labelKey }) => {
                                            const stats = rankStats[type] ?? { wins: 0, losses: 0, draws: 0 };
                                            const total = stats.wins + stats.losses + stats.draws;
                                            const winRate = total > 0 ? Math.round((stats.wins / total) * 100) : 0;
                                            return (
                                                <div
                                                    key={type}
                                                    onClick={() => setSelectedHighscoreType({ type, labelKey })}
                                                    className="grid grid-cols-[1.4fr_0.8fr_0.6fr] gap-2 bg-white dark:bg-gray-800/50 rounded-lg px-2 py-1 hover:bg-slate-100 dark:bg-gray-700/60 active:scale-[0.99] transition-all cursor-pointer group"
                                                >
                                                    <span className="text-slate-600 dark:text-gray-300 flex items-center gap-1">
                                                        {t(labelKey)}
                                                        <span className="text-gray-500 group-hover:text-slate-600 dark:text-gray-300 transition-colors">›</span>
                                                    </span>
                                                    <span className="text-right text-yellow-300 font-bold tabular-nums">
                                                        {highscores[type] ?? 0}
                                                    </span>
                                                    <span className="text-right text-green-300 font-bold tabular-nums">
                                                        {winRate}%
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="friends"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="w-full max-w-md flex flex-col gap-4 relative z-10"
                        >
                            <FriendRequests onCountChange={setPendingRequestsCount} />
                            <AddFriend />
                            <FriendList
                                onChatClick={handleChatClick}
                                onChallengeClick={handleChallengeClick}
                                onUnreadChange={setUnreadChatCount}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {isCountryModalOpen && (
                <div className="fixed inset-0 z-[130] bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full max-w-md max-h-[75vh] bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-2xl"
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('profile.selectCountry')}</h3>
                            <button
                                onClick={() => {
                                    playSound('click');
                                    setCountrySearch('');
                                    setIsCountryModalOpen(false);
                                }}
                                className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-white transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-3 border-b border-slate-200 dark:border-white/10">
                            <input
                                value={countrySearch}
                                onChange={(e) => setCountrySearch(e.target.value)}
                                placeholder={`${t('profile.selectCountry')}...`}
                                className="w-full rounded-lg bg-white dark:bg-white/5 border border-slate-300 dark:border-white/10 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-blue-400/70 shadow-sm"
                            />
                        </div>
                        <div className="max-h-[52vh] overflow-y-auto p-3 space-y-2">
                            <button
                                onClick={() => {
                                    playSound('click');
                                    setCountry(null);
                                    setCountrySearch('');
                                    setIsCountryModalOpen(false);
                                }}
                                className={`w-full p-4 rounded-xl flex items-center justify-between border transition-all duration-200 ${!country
                                    ? 'bg-blue-50 dark:bg-blue-600/30 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.35)]'
                                    : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10'
                                    }`}
                            >
                                <span className={`text-base font-medium truncate ${!country ? 'text-blue-600 dark:text-white' : 'text-slate-700 dark:text-white'}`}>{t('profile.selectCountry')}</span>
                                {!country && <div className="w-3 h-3 bg-blue-500 dark:bg-blue-400 rounded-full shadow-[0_0_8px_#60a5fa]" />}
                            </button>
                            {filteredCountries.map((c) => (
                                <button
                                    key={c.code}
                                    onClick={() => {
                                        playSound('click');
                                        setCountry(c.code);
                                        setCountrySearch('');
                                        setIsCountryModalOpen(false);
                                    }}
                                    className={`w-full p-4 rounded-xl flex items-center justify-between border transition-all duration-200 ${country === c.code
                                        ? 'bg-blue-50 dark:bg-blue-600/30 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.35)]'
                                        : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10'
                                        }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0 pr-4">
                                        <Flag code={c.code} size="md" className="flex-shrink-0" />
                                        <span className={`text-base font-medium truncate ${country === c.code ? 'text-blue-600 dark:text-white' : 'text-slate-700 dark:text-white'}`}>
                                            {c.name}
                                        </span>
                                    </div>
                                    {country === c.code && <div className="w-3 h-3 bg-blue-500 dark:bg-blue-400 rounded-full flex-shrink-0 shadow-[0_0_8px_#60a5fa]" />}
                                </button>
                            ))}
                            {filteredCountries.length === 0 && (
                                <div className="text-center text-sm text-slate-500 dark:text-gray-400 py-6">
                                    {t('common.noResults')}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Match History Modal */}
            <MatchHistoryModal
                isOpen={showHistoryModal}
                onClose={() => setShowHistoryModal(false)}
                userId={user?.id}
                initialMode={historyMode}
            />
            <HighscoreLeaderboardModal
                isOpen={!!selectedHighscoreType}
                onClose={() => setSelectedHighscoreType(null)}
                gameType={selectedHighscoreType?.type ?? null}
                title={selectedHighscoreType ? t(selectedHighscoreType.labelKey) : ''}
            />

            {/* Chat Overlay */}
            {chatFriend && (
                <ChatWindow
                    friendId={chatFriend.id}
                    friendNickname={chatFriend.nickname}
                    onClose={() => setChatFriend(null)}
                />
            )}

            <AnimatePresence>
                {pendingInvite && (
                    <motion.div
                        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white dark:bg-gray-800 border border-white/10 rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl"
                        >
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('social.challengeWaitingTitle')}</h3>
                            <p className="text-slate-600 dark:text-gray-300 mb-4">{t('social.challengeWaitingDesc')}</p>
                            <p className="text-sm text-slate-500 dark:text-gray-400 mb-6">{t('social.challengeWaitingTime', { seconds: inviteTimeLeft })}</p>
                            <button
                                onClick={() => cancelPendingInvite('cancel')}
                                className="px-5 py-2 rounded-lg bg-slate-100 dark:bg-gray-700 hover:bg-gray-600 text-slate-900 dark:text-white font-semibold transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            <AvatarModal
                isOpen={!!avatarPreview}
                onClose={() => setAvatarPreview(null)}
                src={avatarPreview?.src ?? null}
                alt={avatarPreview?.alt}
            />
        </div>
    );
};

export default Profile;
