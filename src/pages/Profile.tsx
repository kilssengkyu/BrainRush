import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, LogOut, User as UserIcon, Trophy, Zap } from 'lucide-react';
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

    // Match History Modal State
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [historyMode, setHistoryMode] = useState<'all' | 'rank' | 'normal'>('all');

    // Chat State
    const [chatFriend, setChatFriend] = useState<{ id: string; nickname: string } | null>(null);

    useEffect(() => {
        if (profile?.nickname) {
            setNickname(profile.nickname);
        }
        if (profile?.country) {
            setCountry(profile.country);
        }
    }, [profile]);

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

            // 3. Go to Game
            navigate(`/game/${roomId}`, { state: { roomId, myId: user.id, opponentId: friendId, mode: 'friendly' } });

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
    const level = profile?.mmr ? Math.floor(profile.mmr / 100) : 1;
    const rank = profile?.mmr || 1000;
    const wins = profile?.wins || 0;
    const losses = profile?.losses || 0;
    const casualWins = profile?.casual_wins || 0;
    const casualLosses = profile?.casual_losses || 0;

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4 relative overflow-y-auto">
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
                        className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all flex items-center gap-1 ${activeTab === 'friends' ? 'bg-green-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        {t('social.friends')}
                    </button>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleLogout} className="p-2 rounded-full hover:bg-red-500/20 text-red-400 transition-colors">
                        <LogOut className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Content */}
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
                            <div className="bg-gray-700/30 p-4 rounded-2xl flex flex-col items-center">
                                <Zap className="w-6 h-6 text-yellow-400 mb-2" />
                                <span className="text-sm text-gray-400">{t('user.level')}</span>
                                <span className="text-xl font-bold">{level}</span>
                            </div>
                            <div className="bg-gray-700/30 p-4 rounded-2xl flex flex-col items-center">
                                <Trophy className="w-6 h-6 text-purple-400 mb-2" />
                                <span className="text-sm text-gray-400">{t('user.rank')}</span>
                                <span className="text-xl font-bold">{rank}</span>
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
                                    {profile?.disconnects && profile.disconnects > 0 && (
                                        <span className="text-lg font-bold text-gray-500 flex items-center gap-1" title={t('profile.disconnects')}>
                                            <LogOut className="w-4 h-4" /> {profile.disconnects}
                                        </span>
                                    )}
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
                    </motion.div>
                ) : (
                    <motion.div
                        key="friends"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="w-full max-w-md flex flex-col gap-4 relative z-10"
                    >
                        <FriendRequests />
                        <AddFriend />
                        <FriendList
                            onChatClick={handleChatClick}
                            onChallengeClick={handleChallengeClick}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

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
        </div>
    );
};

export default Profile;
