import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Globe, Volume2, VolumeX, RefreshCcw } from 'lucide-react';
import { useSound } from '../contexts/SoundContext';
import { useAuth } from '../contexts/AuthContext';
import { useUI } from '../contexts/UIContext';
import { restorePurchases } from '../lib/purchaseService';

const Settings = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { isMuted, toggleMute, volume, setVolume, playSound } = useSound();
    const { user, refreshProfile } = useAuth();
    const { showToast } = useUI();
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
            await restorePurchases();
            await refreshProfile();
            showToast(t('settings.restorePurchasesSuccess', 'Purchases restored.'), 'success');
        } catch (err: any) {
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

                        {/* Volume Slider */}
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm text-gray-400">
                                <span>0%</span>
                                <span>{Math.round(volume * 100)}%</span>
                                <span>100%</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={volume}
                                onChange={(e) => {
                                    setVolume(parseFloat(e.target.value));
                                }}
                                disabled={isMuted}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500 disabled:opacity-50"
                            />
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

            </div>
        </div>
    );
};

export default Settings;
