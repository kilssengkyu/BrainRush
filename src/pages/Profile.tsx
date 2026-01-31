import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, LogOut, User as UserIcon, Trophy } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSound } from '../contexts/SoundContext';
import { useUI } from '../contexts/UIContext';
import { supabase } from '../lib/supabaseClient';
import { useTranslation } from 'react-i18next';
import { COUNTRIES } from '../constants/countries';
import Flag from '../components/ui/Flag';
import FriendList from '../components/social/FriendList';
import AddFriend from '../components/social/AddFriend';
import FriendRequests from '../components/social/FriendRequests';
import ChatWindow from '../components/social/ChatWindow';
import MatchHistoryModal from '../components/ui/MatchHistoryModal';
import HexRadar from '../components/ui/HexRadar';
import { getTierFromMMR, getTierColor, getTierIcon } from '../utils/rankUtils';

const Profile = () => {
    const { user, profile, signOut, refreshProfile } = useAuth();
    const { playSound } = useSound();
    const { showToast, confirm } = useUI();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const [activeTab, setActiveTab] = useState<'profile' | 'friends'>('profile');
    const [nickname, setNickname] = useState('');
    const [country, setCountry] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement | null>(null);

    const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB
    const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

    // Match History Modal State
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [historyMode, setHistoryMode] = useState<'all' | 'rank' | 'normal'>('all');

    // Chat State
    const [chatFriend, setChatFriend] = useState<{ id: string; nickname: string } | null>(null);
    const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
    const [unreadChatCount, setUnreadChatCount] = useState(0);
    const [pendingInvite, setPendingInvite] = useState<{ roomId: string; friendId: string; expiresAt: number } | null>(null);
    const [inviteTimeLeft, setInviteTimeLeft] = useState(0);
    const INVITE_TIMEOUT_MS = 60000;

    useEffect(() => {
        if (profile?.nickname) {
            setNickname(profile.nickname);
        }
        if (profile?.country) {
            setCountry(profile.country);
        }
    }, [profile]);

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
                .eq('is_read', false);
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

    const cancelPendingInvite = useCallback(async (reason: 'cancel' | 'timeout', inviteOverride?: { roomId: string; friendId: string }) => {
        if (!user) return;
        const invite = inviteOverride ?? pendingInvite;
        if (!invite) return;

        setPendingInvite(null);
        setInviteTimeLeft(0);

        try {
            const { error: cancelError } = await supabase
                .rpc('cancel_friendly_session', { p_room_id: invite.roomId });
            if (cancelError) throw cancelError;

            const { error: msgError } = await supabase
                .from('chat_messages')
                .insert({
                    sender_id: user.id,
                    receiver_id: invite.friendId,
                    content: `INVITE_CANCELLED:${invite.roomId}`
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

        const channel = supabase
            .channel(`invite_responses_${user.id}_${pendingInvite.roomId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages',
                filter: `receiver_id=eq.${user.id}`
            }, (payload: any) => {
                const msg = payload.new;
                if (!msg?.content || typeof msg.content !== 'string') return;
                if (!msg.content.startsWith('INVITE_')) return;

                const [type, roomId] = msg.content.split(':');
                if (!roomId || roomId !== pendingInvite.roomId) return;

                if (type === 'INVITE_ACCEPTED') {
                    setPendingInvite(null);
                    setInviteTimeLeft(0);
                    showToast(t('social.challengeAccepted'), 'success');
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
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, pendingInvite, navigate, showToast, t]);

    const handleBack = () => {
        playSound('click');
        navigate('/');
    };

    const handleLogout = async () => {
        const confirmed = await confirm(
            t('menu.logout'),
            t('settings.logoutConfirm')
        );

        if (!confirmed) return;

        playSound('click');
        await signOut();
        navigate('/');
    };

    const handleSave = async () => {
        if (!user || !nickname.trim()) return;

        playSound('click');
        setIsLoading(true);

        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    nickname: nickname.trim(),
                    country: country
                })
                .eq('id', user.id);

            if (error) throw error;

            await refreshProfile();
            setIsEditing(false);
            showToast(t('profile.updateSuccess'), 'success');
        } catch (error: any) {
            console.error('Error updating profile:', error);
            showToast(`${t('profile.updateFail')}: ${error.message || error}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAvatarSelect = async (file: File) => {
        if (!user) return;

        if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
            showToast(t('profile.avatarInvalidType', '지원되지 않는 이미지 형식입니다.'), 'error');
            return;
        }

        if (file.size > MAX_AVATAR_SIZE) {
            showToast(t('profile.avatarTooLarge', '파일 용량이 너무 큽니다.'), 'error');
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
            showToast(t('profile.avatarUploadSuccess', '프로필 사진이 업데이트되었습니다.'), 'success');
        } catch (error: any) {
            console.error('Avatar upload error:', error);
            showToast(`${t('profile.avatarUploadFail', '프로필 사진 업로드 실패')}: ${error.message || error}`, 'error');
        } finally {
            setIsUploadingAvatar(false);
            if (avatarInputRef.current) {
                avatarInputRef.current.value = '';
            }
        }
    };

    const handleDeleteAccount = async () => {
        const confirmed = await confirm(
            t('settings.deleteAccount'),
            t('settings.deleteAccountConfirm')
        );

        if (!confirmed) return;

        playSound('click');
        setIsLoading(true);
        try {
            const { error } = await supabase.rpc('delete_account');
            if (error) throw error;

            await signOut();
            navigate('/');
            showToast(t('profile.deleteSuccess'), 'success');
        } catch (error) {
            console.error('Error deleting account:', error);
            showToast(t('profile.deleteFail'), 'error');
        } finally {
            setIsLoading(false);
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

            // 1. Create Session
            const { data: roomId, error } = await supabase
                .rpc('create_session', { p_player1_id: user.id, p_player2_id: friendId });

            if (error) throw error;

            // 2. Send Invite Message
            const { error: msgError } = await supabase
                .from('chat_messages')
                .insert({
                    sender_id: user.id,
                    receiver_id: friendId,
                    content: `INVITE:${roomId}`
                });

            if (msgError) console.error("Failed to send invite message", msgError);

            // 3. Wait for acceptance before entering the room
            setPendingInvite({ roomId, friendId, expiresAt: Date.now() + INVITE_TIMEOUT_MS });
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
    const tier = getTierFromMMR(rank);
    const tierColor = getTierColor(tier);
    const TierIcon = getTierIcon(tier);
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

    return (
        <div className="h-[100dvh] bg-gray-900 text-white flex flex-col items-center p-4 pt-[calc(env(safe-area-inset-top)+1rem)] relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-800 via-gray-900 to-black pointer-events-none" />

            {/* Header */}
            <div className="w-full max-w-md flex justify-between items-center z-10 mb-8 pt-4">
                <button onClick={handleBack} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="flex bg-slate-800 rounded-full p-1 border border-slate-700">
                    <button
                        onClick={() => setActiveTab('profile')}
                        className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${activeTab === 'profile' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        {t('menu.profile')}
                    </button>
                    <button
                        onClick={() => setActiveTab('friends')}
                        className={`relative px-4 py-1.5 rounded-full text-sm font-bold transition-all flex items-center gap-1 ${activeTab === 'friends' ? 'bg-green-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        {t('social.friends')}
                        {hasSocialNotifications && (
                            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-slate-800" aria-hidden="true"></span>
                        )}
                    </button>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleLogout} className="p-2 rounded-full hover:bg-red-500/20 text-red-400 transition-colors">
                        <LogOut className="w-6 h-6" />
                    </button>
                </div>
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
                            className="w-full max-w-md bg-gray-800/50 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl relative z-10"
                        >
                            {/* Avatar Section */}
                            <div className="flex flex-col items-center mb-8">
                                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 p-[3px] mb-4">
                                    <div className="w-full h-full rounded-full bg-gray-900 flex items-center justify-center overflow-hidden">
                                        {profile?.avatar_url ? (
                                            <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <UserIcon className="w-12 h-12 text-gray-400" />
                                        )}
                                    </div>
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
                                    {isUploadingAvatar ? t('profile.avatarUploading', '업로드 중...') : t('profile.changeAvatar', '사진 변경')}
                                </button>

                                {/* Nickname & Country Edit */}
                                <div className="flex flex-col items-center gap-4 w-full justify-center">
                                    {isEditing ? (
                                        <div className="flex flex-col gap-2 w-full max-w-[240px]">
                                            <input
                                                type="text"
                                                value={nickname}
                                                onChange={(e) => setNickname(e.target.value)}
                                                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-center text-white focus:outline-none focus:border-blue-500"
                                                placeholder={t('profile.nicknamePlaceholder')}
                                                maxLength={12}
                                            />

                                            <select
                                                value={country || ''}
                                                onChange={(e) => setCountry(e.target.value || null)}
                                                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 appearance-none text-center"
                                            >
                                                <option value="">{t('profile.selectCountry')}</option>
                                                {COUNTRIES.map((c) => (
                                                    <option key={c.code} value={c.code}>
                                                        {c.name}
                                                    </option>
                                                ))}
                                            </select>

                                            <button
                                                onClick={handleSave}
                                                disabled={isLoading}
                                                className="p-2 bg-blue-600 rounded-lg hover:bg-blue-500 disabled:opacity-50 w-full flex justify-center mt-2"
                                            >
                                                <Save className="w-5 h-5" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-1">
                                            <div className="flex items-center gap-2">
                                                <Flag code={country} size="lg" className="mr-1" />
                                                <h2 className="text-2xl font-bold">{nickname}</h2>
                                                <button
                                                    onClick={() => { playSound('click'); setIsEditing(true); }}
                                                    className="text-gray-500 hover:text-white text-xs bg-gray-800 px-2 py-1 rounded border border-gray-700 ml-2"
                                                >
                                                    {t('profile.edit')}
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
                                <p className="text-gray-400 text-sm mt-1">{user?.email}</p>

                                <button onClick={handleDeleteAccount} className="mt-4 text-xs text-red-500/70 hover:text-red-500 underline">
                                    {t('settings.deleteAccount')}
                                </button>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className={`bg-gradient-to-br ${tierColor} p-[2px] rounded-2xl shadow-lg transform hover:scale-105 transition-transform`}>
                                    <div className="bg-gray-800 w-full h-full rounded-2xl p-4 flex flex-col items-center justify-center">
                                        <TierIcon className="w-8 h-8 text-white mb-2 filter drop-shadow-md" />
                                        <span className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">{t('game.tier', 'TIER')}</span>
                                        <span className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-300">
                                            {tier}
                                        </span>
                                    </div>
                                </div>
                                <div className="bg-gray-700/30 p-4 rounded-2xl flex flex-col items-center justify-center border border-white/5">
                                    <Trophy className="w-8 h-8 text-purple-400 mb-2" />
                                    <span className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">{t('user.rank')}</span>
                                    <span className="text-xl font-bold text-white">{rank}</span>
                                </div>

                                {/* Rank Record */}
                                <button
                                    onClick={() => handleOpenHistory('rank')}
                                    className="bg-gray-700/30 p-4 rounded-2xl flex flex-col items-center col-span-2 hover:bg-gray-700/50 transition-colors cursor-pointer"
                                >
                                    <span className="text-xs text-blue-300 mb-1 font-bold uppercase tracking-wider">{t('game.rank')} {t('profile.record')}</span>
                                    <div className="flex gap-4 items-end">
                                        <span className="text-lg font-bold text-blue-400">{wins}W</span>
                                        <span className="text-lg font-bold text-red-400">{losses}L</span>
                                    </div>
                                </button>

                                {/* Casual Record */}
                                <button
                                    onClick={() => handleOpenHistory('normal')}
                                    className="bg-gray-700/30 p-4 rounded-2xl flex flex-col items-center col-span-2 border border-white/5 hover:bg-gray-700/50 transition-colors cursor-pointer"
                                >
                                    <span className="text-xs text-green-300 mb-1 font-bold uppercase tracking-wider">{t('game.normal')} {t('profile.record')}</span>
                                    <div className="flex gap-4 items-end">
                                        <span className="text-lg font-bold text-blue-300">{casualWins}W</span>
                                        <span className="text-lg font-bold text-red-300">{casualLosses}L</span>
                                    </div>
                                </button>
                            </div>

                            {/* Skill Radar */}
                            <div className="mt-8 pt-6 border-t border-white/10">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4 text-center">
                                    {t('profile.statsTitle', '능력치')}
                                </h3>
                                <HexRadar
                                    values={statValues}
                                    labels={{
                                        speed: t('profile.stats.speed', '스피드'),
                                        memory: t('profile.stats.memory', '기억력'),
                                        judgment: t('profile.stats.judgment', '판단력'),
                                        calculation: t('profile.stats.calculation', '계산력'),
                                        accuracy: t('profile.stats.accuracy', '정확성'),
                                        observation: t('profile.stats.observation', '관찰력')
                                    }}
                                />
                                <div className="grid grid-cols-3 gap-2 mt-4 text-xs text-gray-400">
                                    <div className="flex items-center justify-between bg-gray-800/50 rounded-lg px-2 py-1">
                                        <span>{t('profile.stats.speed', '스피드')}</span>
                                        <span className="text-blue-300 font-bold">{statValues.speed}</span>
                                    </div>
                                    <div className="flex items-center justify-between bg-gray-800/50 rounded-lg px-2 py-1">
                                        <span>{t('profile.stats.memory', '기억력')}</span>
                                        <span className="text-blue-300 font-bold">{statValues.memory}</span>
                                    </div>
                                    <div className="flex items-center justify-between bg-gray-800/50 rounded-lg px-2 py-1">
                                        <span>{t('profile.stats.judgment', '판단력')}</span>
                                        <span className="text-blue-300 font-bold">{statValues.judgment}</span>
                                    </div>
                                    <div className="flex items-center justify-between bg-gray-800/50 rounded-lg px-2 py-1">
                                        <span>{t('profile.stats.calculation', '계산력')}</span>
                                        <span className="text-blue-300 font-bold">{statValues.calculation}</span>
                                    </div>
                                    <div className="flex items-center justify-between bg-gray-800/50 rounded-lg px-2 py-1">
                                        <span>{t('profile.stats.accuracy', '정확성')}</span>
                                        <span className="text-blue-300 font-bold">{statValues.accuracy}</span>
                                    </div>
                                    <div className="flex items-center justify-between bg-gray-800/50 rounded-lg px-2 py-1">
                                        <span>{t('profile.stats.observation', '관찰력')}</span>
                                        <span className="text-blue-300 font-bold">{statValues.observation}</span>
                                    </div>
                                </div>
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

            {/* Match History Modal */}
            <MatchHistoryModal
                isOpen={showHistoryModal}
                onClose={() => setShowHistoryModal(false)}
                userId={user?.id}
                initialMode={historyMode}
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
                            className="bg-gray-800 border border-white/10 rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl"
                        >
                            <h3 className="text-xl font-bold text-white mb-2">{t('social.challengeWaitingTitle')}</h3>
                            <p className="text-gray-300 mb-4">{t('social.challengeWaitingDesc')}</p>
                            <p className="text-sm text-gray-400 mb-6">{t('social.challengeWaitingTime', { seconds: inviteTimeLeft })}</p>
                            <button
                                onClick={() => cancelPendingInvite('cancel')}
                                className="px-5 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-semibold transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Profile;
