import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, LogOut, User as UserIcon, Trophy, Zap } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSound } from '../contexts/SoundContext';
import { useUI } from '../contexts/UIContext';
import { supabase } from '../lib/supabaseClient';
import { useTranslation } from 'react-i18next';

const Profile = () => {
    const { user, profile, signOut, refreshProfile } = useAuth();
    const { playSound } = useSound();
    const { showToast, confirm } = useUI();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const [nickname, setNickname] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (profile?.nickname) {
            setNickname(profile.nickname);
        }
    }, [profile]);

    const handleBack = () => {
        playSound('click');
        navigate('/');
    };

    const handleLogout = async () => {
        playSound('click');
        await signOut();
        navigate('/');
    };

    const handleSave = async () => {
        if (!user || !nickname.trim()) return;

        playSound('click');
        setIsLoading(true);
        console.log('Attempting to update profile for user:', user.id, 'New nickname:', nickname);

        try {
            const { data, error } = await supabase
                .from('profiles')
                .update({ nickname: nickname.trim() })
                .eq('id', user.id)
                .select(); // Return data to verify update

            if (error) throw error;

            console.log('Update success, returned data:', data);

            // Force refresh session/profile
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
            t('deleteAccountConfirm') || 'Are you sure you want to delete your account? This action cannot be undone.'
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

    // Calculate stats
    const level = profile?.mmr ? Math.floor(profile.mmr / 100) : 1;
    const rank = profile?.mmr || 1000;
    const wins = profile?.wins || 0;
    const losses = profile?.losses || 0;

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-800 via-gray-900 to-black pointer-events-none" />

            {/* Header */}
            <div className="w-full max-w-md flex justify-between items-center z-10 mb-8 pt-4">
                <button onClick={handleBack} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <h1 className="text-xl font-bold">{t('menu.profile')}</h1>
                <div className="flex gap-2">
                    <button onClick={handleDeleteAccount} className="p-2 rounded-full hover:bg-red-500/20 text-red-500 transition-colors" title={t('settings.deleteAccount')}>
                        <UserIcon className="w-6 h-6" />
                    </button>
                    <button onClick={handleLogout} className="p-2 rounded-full hover:bg-red-500/20 text-red-400 transition-colors">
                        <LogOut className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Profile Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
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

                    {/* Nickname Edit */}
                    <div className="flex items-center gap-2 w-full justify-center">
                        {isEditing ? (
                            <div className="flex gap-2 w-full max-w-[200px]">
                                <input
                                    type="text"
                                    value={nickname}
                                    onChange={(e) => setNickname(e.target.value)}
                                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-center text-white focus:outline-none focus:border-blue-500"
                                    placeholder={t('profile.nicknamePlaceholder')}
                                    maxLength={12}
                                />
                                <button
                                    onClick={handleSave}
                                    disabled={isLoading}
                                    className="p-2 bg-blue-600 rounded-lg hover:bg-blue-500 disabled:opacity-50"
                                >
                                    <Save className="w-5 h-5" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <h2 className="text-2xl font-bold">{nickname}</h2>
                                <button
                                    onClick={() => { playSound('click'); setIsEditing(true); }}
                                    className="text-gray-500 hover:text-white text-xs bg-gray-800 px-2 py-1 rounded border border-gray-700"
                                >
                                    {t('profile.edit')}
                                </button>
                            </div>
                        )}
                    </div>
                    <p className="text-gray-400 text-sm mt-1">{user?.email}</p>
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
                    <div className="bg-gray-700/30 p-4 rounded-2xl flex flex-col items-center col-span-2">
                        <span className="text-sm text-gray-400 mb-1">{t('profile.record')}</span>
                        <div className="flex gap-4 items-end">
                            <span className="text-lg font-bold text-blue-400">{wins}W</span>
                            <span className="text-lg font-bold text-red-400">{losses}L</span>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default Profile;
