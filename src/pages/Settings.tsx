import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Globe, Volume2, VolumeX, RefreshCcw, BookOpen, Shield, X } from 'lucide-react';
import { useSound } from '../contexts/SoundContext';
import { useAuth } from '../contexts/AuthContext';
import { useUI } from '../contexts/UIContext';
import { PRODUCT_IDS, restorePurchases } from '../lib/purchaseService';
import { useTutorial } from '../contexts/TutorialContext';
import { supabase } from '../lib/supabaseClient';

const Settings = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { isMuted, toggleMute, isVibrationEnabled, toggleVibration, playSound } = useSound();
    const { user, profile, refreshProfile } = useAuth();
    const { showToast } = useUI();
    const { resetHomeTutorial } = useTutorial();
    const [isRestoring, setIsRestoring] = useState(false);
    const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
    const [languageSearch, setLanguageSearch] = useState('');
    const appRole = (user?.app_metadata as any)?.role;
    const profileRole = (profile as any)?.role;
    const isAdmin = appRole === 'admin' || profileRole === 'admin';

    const languages = [
        { code: 'ko', label: '한국어', flag: '🇰🇷' },
        { code: 'en', label: 'English', flag: '🇺🇸' },
        { code: 'zh', label: '中文', flag: '🇨🇳' },
        { code: 'ja', label: '日本語', flag: '🇯🇵' },
        { code: 'es', label: 'Español', flag: '🇪🇸' },
        { code: 'pt-BR', label: 'Português (Brasil)', flag: '🇧🇷' },
        { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
        { code: 'fr', label: 'Français', flag: '🇫🇷' },
        { code: 'id', label: 'Bahasa Indonesia', flag: '🇮🇩' },
        { code: 'th', label: 'ไทย', flag: '🇹🇭' },
        { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
    ];

    const changeLanguage = (lng: string) => {
        i18n.changeLanguage(lng);
        playSound('click');
        setIsLanguageModalOpen(false);
    };

    const isLanguageSelected = (code: string) => {
        const current = i18n.resolvedLanguage || i18n.language || '';
        return current === code || current.startsWith(`${code}-`) || code.startsWith(`${current}-`);
    };

    const selectedLanguage = languages.find((lang) => isLanguageSelected(lang.code)) || languages[0];
    const filteredLanguages = languages.filter((lang) => {
        const q = languageSearch.trim().toLowerCase();
        if (!q) return true;
        return (
            lang.label.toLowerCase().includes(q) ||
            lang.code.toLowerCase().includes(q)
        );
    });

    const handleRestorePurchases = async () => {
        if (!user) {
            showToast(t('auth.loginRequired'), 'error');
            return;
        }
        setIsRestoring(true);
        try {
            await restorePurchases();

            // Restore is based on server-verified purchase records only.
            const { data: rows, error: fetchError } = await supabase
                .from('purchase_transactions')
                .select('product_id')
                .eq('product_id', PRODUCT_IDS.removeAds)
                .eq('verified', true)
                .limit(1);

            if (fetchError) throw fetchError;

            if (!rows || rows.length === 0) {
                showToast(t('settings.restorePurchasesEmpty', 'No purchases to restore.'), 'info');
                return;
            }

            const { error } = await supabase.rpc('grant_ads_removal', { user_id: user.id });
            if (error) throw error;

            await refreshProfile();
            showToast(t('settings.restorePurchasesSuccess', 'Purchases restored.'), 'success');

        } catch (err: any) {
            console.error('[restorePurchases] failed:', err);
            const message = err?.message?.includes('Billing not supported')
                ? t('settings.restorePurchasesUnavailable', 'Billing not supported on this device.')
                : t('settings.restorePurchasesFail', 'Failed to restore purchases.');
            showToast(message, 'error');
        } finally {
            setIsRestoring(false);
        }
    };

    return (
        <div className="h-[100dvh] bg-gray-900 text-white relative overflow-hidden flex flex-col items-center">
            {/* ... (Background & Header code remains same) ... */}
            <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-blue-600/20 rounded-full blur-3xl animate-pulse pointer-events-none" />
            <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] bg-purple-600/20 rounded-full blur-3xl animate-pulse pointer-events-none" />

            {/* Header - Fixed to top */}
            <header className="w-full flex-none flex items-center justify-between z-20 p-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-4 bg-gray-900/50 backdrop-blur-sm sticky top-0">
                <button
                    onClick={() => { playSound('click'); navigate(-1); }}
                    className="p-3 bg-white/10 rounded-full backdrop-blur-md active:scale-90 transition-transform"
                >
                    <ChevronLeft size={24} />
                </button>
                <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
                <div className="w-12" /> {/* Spacer */}
            </header>

            {/* Content - Scrollable */}
            <div className="flex-1 w-full overflow-y-auto px-6 pb-8 z-10 scrollbar-hide">
                <div className="w-full max-w-md mx-auto space-y-8 pt-2">

                    {/* Language Section */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-3 text-blue-400 mb-2">
                            <Globe size={24} />
                            <h2 className="text-xl font-semibold">{t('settings.language')}</h2>
                        </div>

                        <div className="bg-white/5 p-4 rounded-xl border border-white/10 backdrop-blur-md">
                            <button
                                onClick={() => {
                                    playSound('click');
                                    setLanguageSearch('');
                                    setIsLanguageModalOpen(true);
                                }}
                                className="w-full flex items-center justify-between gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-white/5"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="text-2xl">{selectedLanguage.flag}</span>
                                    <div className="min-w-0 text-left">
                                        <div className="text-xs text-gray-400 uppercase tracking-wider">{t('settings.language')}</div>
                                        <div className="text-lg font-semibold truncate">{selectedLanguage.label}</div>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-gray-400 flex-shrink-0" />
                            </button>
                        </div>
                    </section>

                    {/* Sound Section */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-3 text-purple-400 mb-2">
                            {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                            <h2 className="text-xl font-semibold">{t('settings.sound')}</h2>
                        </div>

                        <div className="bg-white/5 p-6 rounded-xl border border-white/10 space-y-6 backdrop-blur-md">
                            {/* Mute Toggle */}
                            <div className="flex items-center justify-between">
                                <span className="text-lg">{t('settings.masterVolume')}</span>
                                <button
                                    onClick={() => { toggleMute(); playSound('click'); }}
                                    className={`relative w-14 h-8 rounded-full transition-colors duration-200 ease-in-out focus:outline-none flex items-center p-1 ${isMuted ? 'bg-gray-600' : 'bg-purple-600'}`}
                                >
                                    <span
                                        className={`block w-6 h-6 bg-white rounded-full shadow-lg transition-transform duration-200 ease-in-out ${isMuted ? 'translate-x-0' : 'translate-x-6'}`}
                                    />
                                </button>
                            </div>

                            {/* Vibration Toggle */}
                            <div className="flex items-center justify-between">
                                <span className="text-lg">{t('settings.vibration', '진동')}</span>
                                <button
                                    onClick={() => { toggleVibration(); playSound('click'); }}
                                    className={`relative w-14 h-8 rounded-full transition-colors duration-200 ease-in-out focus:outline-none flex items-center p-1 ${isVibrationEnabled ? 'bg-purple-600' : 'bg-gray-600'}`}
                                >
                                    <span
                                        className={`block w-6 h-6 bg-white rounded-full shadow-lg transition-transform duration-200 ease-in-out ${isVibrationEnabled ? 'translate-x-6' : 'translate-x-0'}`}
                                    />
                                </button>
                            </div>

                        </div>
                    </section>

                    {/* Purchases Section */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-3 text-emerald-400 mb-2">
                            <RefreshCcw size={24} />
                            <h2 className="text-xl font-semibold">{t('settings.restorePurchases', 'Restore Purchases')}</h2>
                        </div>
                        <div className="bg-white/5 p-6 rounded-xl border border-white/10 space-y-4 backdrop-blur-md">
                            <p className="text-sm text-gray-400">
                                {t('settings.restorePurchasesDesc', 'Restore non-consumable purchases such as ad removal.')}
                            </p>
                            <button
                                onClick={() => { playSound('click'); handleRestorePurchases(); }}
                                disabled={isRestoring}
                                className="w-full px-5 py-3 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-white font-bold transition-colors disabled:opacity-50"
                            >
                                {isRestoring ? t('common.loading') : t('settings.restorePurchases', 'Restore Purchases')}
                            </button>
                        </div>
                    </section>

                    {/* Tutorial Section */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-3 text-amber-400 mb-2">
                            <BookOpen size={24} />
                            <h2 className="text-xl font-semibold">{t('settings.tutorial', '튜토리얼')}</h2>
                        </div>
                        <div className="bg-white/5 p-6 rounded-xl border border-white/10 space-y-4 backdrop-blur-md">
                            <p className="text-sm text-gray-400">
                                {t('settings.tutorialDesc', '앱 사용 방법을 다시 확인하고 싶다면 튜토리얼을 다시 보세요.')}
                            </p>
                            <button
                                onClick={() => {
                                    playSound('click');
                                    resetHomeTutorial();
                                    navigate('/');
                                }}
                                className="w-full px-5 py-3 rounded-xl bg-amber-600/80 hover:bg-amber-600 text-white font-bold transition-colors"
                            >
                                {t('settings.viewTutorial', '튜토리얼 다시 보기')}
                            </button>
                        </div>
                    </section>

                    {/* Privacy Policy Section */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-3 text-sky-400 mb-2">
                            <Shield size={24} />
                            <h2 className="text-xl font-semibold">{t('settings.privacyPolicy', '개인정보 처리방침')}</h2>
                        </div>
                        <div className="bg-white/5 p-6 rounded-xl border border-white/10 space-y-4 backdrop-blur-md">
                            <p className="text-sm text-gray-400">
                                {t('settings.privacyPolicyDesc', '서비스 이용에 필요한 개인정보 처리 내용을 확인할 수 있습니다.')}
                            </p>
                            <button
                                onClick={() => { playSound('click'); navigate('/privacy'); }}
                                className="w-full px-5 py-3 rounded-xl bg-sky-600/80 hover:bg-sky-600 text-white font-bold transition-colors"
                            >
                                {t('settings.viewPrivacyPolicy', '개인정보 처리방침 보기')}
                            </button>
                        </div>
                    </section>

                    {isAdmin && (
                        <section className="space-y-4">
                            <div className="flex items-center gap-3 text-red-400 mb-2">
                                <Shield size={24} />
                                <h2 className="text-xl font-semibold">{t('settings.admin', '관리자')}</h2>
                            </div>
                            <div className="bg-white/5 p-6 rounded-xl border border-red-400/30 space-y-4 backdrop-blur-md">
                                <p className="text-sm text-gray-400">
                                    {t('settings.adminDesc', '관리자 전용 페이지로 이동합니다.')}
                                </p>
                                <button
                                    onClick={() => { playSound('click'); navigate('/admin'); }}
                                    className="w-full px-5 py-3 rounded-xl bg-red-600/80 hover:bg-red-600 text-white font-bold transition-colors"
                                >
                                    {t('settings.goToAdmin', '관리자 화면 가기')}
                                </button>
                            </div>
                        </section>
                    )}

                </div>
            </div>

            {isLanguageModalOpen && (
                <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full max-w-md max-h-[75vh] bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                            <h3 className="text-lg font-bold">{t('settings.language')}</h3>
                            <button
                                onClick={() => { playSound('click'); setIsLanguageModalOpen(false); setLanguageSearch(''); }}
                                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-3 border-b border-white/10">
                            <input
                                value={languageSearch}
                                onChange={(e) => setLanguageSearch(e.target.value)}
                                placeholder={`${t('settings.language')}...`}
                                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-blue-400/70"
                            />
                        </div>
                        <div className="max-h-[52vh] overflow-y-auto p-3 space-y-2">
                            {filteredLanguages.map((lang) => (
                                <button
                                    key={lang.code}
                                    onClick={() => changeLanguage(lang.code)}
                                    className={`w-full p-4 rounded-xl flex items-center justify-between border transition-all duration-200
                                        ${isLanguageSelected(lang.code)
                                            ? 'bg-blue-600/30 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.35)]'
                                            : 'bg-white/5 border-white/10 hover:bg-white/10'}
                                    `}
                                >
                                    <div className="flex items-center gap-4 min-w-0">
                                        <span className="text-2xl">{lang.flag}</span>
                                        <span className="text-lg font-medium truncate">{lang.label}</span>
                                    </div>
                                    {isLanguageSelected(lang.code) && (
                                        <div className="w-3 h-3 bg-blue-400 rounded-full shadow-[0_0_8px_#60a5fa]" />
                                    )}
                                </button>
                            ))}
                            {filteredLanguages.length === 0 && (
                                <div className="text-center text-sm text-gray-400 py-6">
                                    {t('common.noResults', 'No results')}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default Settings;
