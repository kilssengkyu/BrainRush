import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Globe, Volume2, VolumeX, RefreshCcw, BookOpen, Shield } from 'lucide-react';
import { useSound } from '../contexts/SoundContext';
import { useAuth } from '../contexts/AuthContext';
import { useUI } from '../contexts/UIContext';
import { getPurchasedProductIds, PRODUCT_IDS, restorePurchases } from '../lib/purchaseService';
import { useTutorial } from '../contexts/TutorialContext';
import { supabase } from '../lib/supabaseClient';

const Settings = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { isMuted, toggleMute, playSound } = useSound();
    const { user, refreshProfile } = useAuth();
    const { showToast } = useUI();
    const { resetHomeTutorial } = useTutorial();
    const [isRestoring, setIsRestoring] = useState(false);

    const languages = [
        { code: 'ko', label: '한국어', flag: '🇰🇷' },
        { code: 'en', label: 'English', flag: '🇺🇸' },
        { code: 'zh', label: '中文', flag: '🇨🇳' },
        { code: 'ja', label: '日本語', flag: '🇯🇵' },
    ];

    const changeLanguage = (lng: string) => {
        i18n.changeLanguage(lng);
        playSound('click');
    };

    const handleRestorePurchases = async () => {
        if (!user) {
            showToast(t('auth.loginRequired'), 'error');
            return;
        }
        setIsRestoring(true);
        try {
            const customerInfo = await restorePurchases();
            console.log('[restorePurchases] customerInfo:', customerInfo);
            if (!customerInfo) {
                showToast(t('settings.restorePurchasesEmpty', 'No purchases to restore.'), 'info');
                return;
            }
            const purchasedIds = new Set(getPurchasedProductIds(customerInfo));
            if (purchasedIds.size === 0) {
                showToast(t('settings.restorePurchasesEmpty', 'No purchases to restore.'), 'info');
                return;
            }
            if (purchasedIds.has(PRODUCT_IDS.removeAds)) {
                const { error } = await supabase.rpc('grant_ads_removal', { user_id: user.id });
                if (error) throw error;
                await refreshProfile();
                showToast(t('settings.restorePurchasesSuccess', 'Purchases restored.'), 'success');
                return;
            }
            showToast(t('settings.restorePurchasesEmpty', 'No purchases to restore.'), 'info');
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
        <div className="h-[100dvh] bg-gray-900 text-white relative overflow-x-hidden overflow-y-auto flex flex-col items-center p-6 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
            {/* ... (Background & Header code remains same) ... */}
            <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-blue-600/20 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] bg-purple-600/20 rounded-full blur-3xl animate-pulse" />

            {/* Header */}
            <header className="w-full flex items-center justify-between mb-8 z-10">
                <button
                    onClick={() => { playSound('click'); navigate(-1); }}
                    className="p-3 bg-white/10 rounded-full backdrop-blur-md active:scale-90 transition-transform"
                >
                    <ChevronLeft size={24} />
                </button>
                <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
                <div className="w-12" /> {/* Spacer */}
            </header>

            {/* Content */}
            <div className="w-full max-w-md space-y-8 z-10">

                {/* Language Section */}
                <section className="space-y-4">
                    <div className="flex items-center gap-3 text-blue-400 mb-2">
                        <Globe size={24} />
                        <h2 className="text-xl font-semibold">{t('settings.language')}</h2>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        {languages.map((lang) => (
                            <motion.button
                                key={lang.code}
                                onClick={() => changeLanguage(lang.code)}
                                whileTap={{ scale: 0.98 }}
                                className={`w-full p-4 rounded-xl backdrop-blur-md flex items-center justify-between border transition-all duration-200
                                    ${i18n.language === lang.code
                                        ? 'bg-blue-600/30 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]'
                                        : 'bg-white/5 border-white/10 hover:bg-white/10'}
                                `}
                            >
                                <div className="flex items-center gap-4">
                                    <span className="text-2xl">{lang.flag}</span>
                                    <span className="text-lg font-medium">{lang.label}</span>
                                </div>
                                {i18n.language === lang.code && (
                                    <div className="w-3 h-3 bg-blue-400 rounded-full shadow-[0_0_8px_#60a5fa]" />
                                )}
                            </motion.button>
                        ))}
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

            </div>
        </div>
    );
};

export default Settings;
