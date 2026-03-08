import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Globe, Volume2, VolumeX, RefreshCcw, BookOpen, Shield, X, Bell, MessageCircleQuestion, Moon, Sun, MonitorSmartphone, Sparkles } from 'lucide-react';
import { useSound } from '../contexts/SoundContext';
import { useAuth } from '../contexts/AuthContext';
import { useUI } from '../contexts/UIContext';
import { PRODUCT_IDS, restorePurchases } from '../lib/purchaseService';
import { useTutorial } from '../contexts/TutorialContext';
import { supabase } from '../lib/supabaseClient';
import { useTheme } from '../contexts/ThemeContext';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { getNotificationsEnabled, setNotificationsEnabled } from '../lib/notificationPrefs';
const Settings = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { isMuted, toggleMute, isVibrationEnabled, toggleVibration, playSound } = useSound();
    const { user, profile, refreshProfile } = useAuth();
    const { showToast } = useUI();
    const { resetHomeTutorial } = useTutorial();
    const { themeMode, themePreference, setThemePreference } = useTheme();
    const [isRestoring, setIsRestoring] = useState(false);
    const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
    const [languageSearch, setLanguageSearch] = useState('');
    const [isNotificationsEnabled, setIsNotificationsEnabled] = useState<boolean>(() => getNotificationsEnabled());
    const edgeSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
    const edgeSwipeTriggeredRef = useRef(false);
    const appRole = (user?.app_metadata as any)?.role;
    const profileRole = (profile as any)?.role;
    const isAdmin = appRole === 'admin' || profileRole === 'admin';
    const [appVersion, setAppVersion] = useState<string>('');

    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            CapApp.getInfo().then(info => setAppVersion(info.version)).catch(() => { });
        } else {
            setAppVersion('web');
        }
    }, []);

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

    const handleToggleNotifications = async () => {
        if (!Capacitor.isNativePlatform()) {
            showToast(t('settings.notificationNativeOnly'), 'info');
            return;
        }

        if (isNotificationsEnabled) {
            setNotificationsEnabled(false);
            setIsNotificationsEnabled(false);
            await LocalNotifications.cancel({ notifications: [{ id: 2001 }, { id: 2002 }] });
            await LocalNotifications.removeAllDeliveredNotifications();
            showToast(t('settings.notificationOff'), 'success');
            return;
        }

        const permission = await LocalNotifications.requestPermissions();
        if (permission.display !== 'granted') {
            setNotificationsEnabled(false);
            setIsNotificationsEnabled(false);
            showToast(
                Capacitor.getPlatform() === 'ios'
                    ? t('settings.notificationDeniedIos')
                    : t('settings.notificationDeniedAndroid'),
                'error'
            );
            return;
        }

        setNotificationsEnabled(true);
        setIsNotificationsEnabled(true);
        showToast(t('settings.notificationOn'), 'success');
    };

    const handleEdgeSwipeStart = (event: React.TouchEvent<HTMLDivElement>) => {
        if (isLanguageModalOpen || event.touches.length !== 1) {
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
            playSound('click');
            navigate(-1);
        }
    };

    const handleEdgeSwipeEnd = () => {
        edgeSwipeStartRef.current = null;
        edgeSwipeTriggeredRef.current = false;
    };

    useEffect(() => {
        const handleModalCloseRequest = (event: Event) => {
            const customEvent = event as CustomEvent<{ handled?: boolean }>;
            if (customEvent.detail?.handled) return;
            if (!isLanguageModalOpen) return;
            setIsLanguageModalOpen(false);
            setLanguageSearch('');
            if (customEvent.detail) customEvent.detail.handled = true;
        };
        window.addEventListener('brainrush:request-modal-close', handleModalCloseRequest as EventListener);
        return () => {
            window.removeEventListener('brainrush:request-modal-close', handleModalCloseRequest as EventListener);
        };
    }, [isLanguageModalOpen]);

    return (
        <div
            className={`h-[100dvh] relative overflow-hidden flex flex-col items-center bg-slate-50 dark:bg-gray-900 text-slate-900 dark:text-white`}
            onTouchStart={handleEdgeSwipeStart}
            onTouchMove={handleEdgeSwipeMove}
            onTouchEnd={handleEdgeSwipeEnd}
            onTouchCancel={handleEdgeSwipeEnd}
        >
            {/* ... (Background & Header code remains same) ... */}
            <div className={`absolute top-[-20%] left-[-20%] w-[80%] h-[80%] rounded-full blur-3xl animate-pulse pointer-events-none bg-blue-400/20 dark:bg-blue-600/20`} />
            <div className={`absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] rounded-full blur-3xl animate-pulse pointer-events-none bg-rose-400/20 dark:bg-purple-600/20`} />

            {/* Header - Fixed to top */}
            <header className={`w-full flex-none flex items-center justify-between z-20 p-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-4 backdrop-blur-sm sticky top-0 bg-slate-50/70 dark:bg-gray-900/50`}>
                <button
                    onClick={() => { playSound('click'); navigate(-1); }}
                    className="p-3 bg-white shadow-sm dark:shadow-none dark:bg-white/10 rounded-full backdrop-blur-md active:scale-90 transition-transform"
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

                        <div className="bg-white dark:bg-white/5 p-4 rounded-xl border border-slate-200 dark:border-white/10 backdrop-blur-md shadow-sm dark:shadow-none">
                            <button
                                onClick={() => {
                                    playSound('click');
                                    setLanguageSearch('');
                                    setIsLanguageModalOpen(true);
                                }}
                                className="w-full flex items-center justify-between gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="text-2xl">{selectedLanguage.flag}</span>
                                    <div className="min-w-0 text-left">
                                        <div className="text-xs text-slate-500 dark:text-gray-400 uppercase tracking-wider">{t('settings.language')}</div>
                                        <div className="text-lg font-semibold truncate">{selectedLanguage.label}</div>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-slate-500 dark:text-gray-400 flex-shrink-0" />
                            </button>
                        </div>
                    </section>

                    {/* Theme Section */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-3 text-amber-300 mb-2">
                            {themePreference === 'system'
                                ? <MonitorSmartphone size={24} />
                                : themeMode === 'dark'
                                    ? <Moon size={24} />
                                    : <Sun size={24} />}
                            <h2 className="text-xl font-semibold">{t('settings.theme', 'Theme')}</h2>
                        </div>

                        <div className="bg-white dark:bg-white/5 p-6 rounded-xl border border-slate-200 dark:border-white/10 backdrop-blur-md shadow-sm dark:shadow-none">
                            <div className="space-y-4">
                                <div>
                                    <div className="text-lg">{t('settings.themeMode', 'Appearance')}</div>
                                    <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">
                                        {themePreference === 'system'
                                            ? t('settings.systemThemeDesc', 'Follow device display settings (iOS/Android system mode).')
                                            : themeMode === 'dark'
                                                ? t('settings.darkMode', 'Dark mode')
                                                : t('settings.lightMode', 'Light mode')}
                                    </p>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        onClick={() => { setThemePreference('light'); playSound('click'); }}
                                        className={`px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${themePreference === 'light' ? 'bg-amber-100 dark:bg-amber-500 text-amber-700 dark:text-black border-amber-300 dark:border-amber-400' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/15 text-slate-600 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/10'}`}
                                        aria-label={t('settings.lightMode', 'Light mode')}
                                    >
                                        {t('settings.light', 'Light')}
                                    </button>
                                    <button
                                        onClick={() => { setThemePreference('dark'); playSound('click'); }}
                                        className={`relative px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${themePreference === 'dark' ? 'bg-amber-100 dark:bg-amber-500 text-amber-700 dark:text-black border-amber-300 dark:border-amber-400' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/15 text-slate-600 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/10'}`}
                                        aria-label={t('settings.darkMode', 'Dark mode')}
                                    >
                                        <span>{t('settings.dark', 'Dark')}</span>
                                        <span className="pointer-events-none absolute -top-2 -right-2 inline-flex items-center gap-1 rounded-full border border-emerald-300/60 bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-bold leading-none text-emerald-700 dark:text-emerald-200">
                                            <Sparkles size={10} />
                                            {t('settings.recommended', '추천')}
                                        </span>
                                    </button>
                                    <button
                                        onClick={() => { setThemePreference('system'); playSound('click'); }}
                                        className={`px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${themePreference === 'system' ? 'bg-amber-100 dark:bg-amber-500 text-amber-700 dark:text-black border-amber-300 dark:border-amber-400' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/15 text-slate-600 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/10'}`}
                                        aria-label={t('settings.system', 'System')}
                                    >
                                        {t('settings.system', 'System')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Sound Section */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-3 text-purple-400 mb-2">
                            {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                            <h2 className="text-xl font-semibold">{t('settings.sound')}</h2>
                        </div>

                        <div className="bg-white dark:bg-white/5 p-6 rounded-xl border border-slate-200 dark:border-white/10 space-y-6 backdrop-blur-md shadow-sm dark:shadow-none">
                            {/* Mute Toggle */}
                            <div className="flex items-center justify-between">
                                <span className="text-lg">{t('settings.masterVolume')}</span>
                                <button
                                    onClick={() => { toggleMute(); playSound('click'); }}
                                    className={`relative w-14 h-8 rounded-full transition-colors duration-200 ease-in-out focus:outline-none flex items-center p-1 ${isMuted ? 'bg-slate-300 dark:bg-gray-600' : 'bg-purple-500 dark:bg-purple-600'}`}
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
                                    className={`relative w-14 h-8 rounded-full transition-colors duration-200 ease-in-out focus:outline-none flex items-center p-1 ${isVibrationEnabled ? 'bg-purple-500 dark:bg-purple-600' : 'bg-slate-300 dark:bg-gray-600'}`}
                                >
                                    <span
                                        className={`block w-6 h-6 bg-white rounded-full shadow-lg transition-transform duration-200 ease-in-out ${isVibrationEnabled ? 'translate-x-6' : 'translate-x-0'}`}
                                    />
                                </button>
                            </div>

                        </div>
                    </section>

                    {/* Notifications Section */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-3 text-indigo-400 mb-2">
                            <Bell size={24} />
                            <h2 className="text-xl font-semibold">{t('settings.notifications')}</h2>
                        </div>
                        <div className="bg-white dark:bg-white/5 p-6 rounded-xl border border-slate-200 dark:border-white/10 space-y-3 backdrop-blur-md shadow-sm dark:shadow-none">
                            <div className="flex items-center justify-between">
                                <span className="text-lg">{t('settings.pushNotifications')}</span>
                                <button
                                    onClick={() => { playSound('click'); void handleToggleNotifications(); }}
                                    className={`relative w-14 h-8 rounded-full transition-colors duration-200 ease-in-out focus:outline-none flex items-center p-1 ${isNotificationsEnabled ? 'bg-indigo-500 dark:bg-indigo-600' : 'bg-slate-300 dark:bg-gray-600'}`}
                                >
                                    <span
                                        className={`block w-6 h-6 bg-white rounded-full shadow-lg transition-transform duration-200 ease-in-out ${isNotificationsEnabled ? 'translate-x-6' : 'translate-x-0'}`}
                                    />
                                </button>
                            </div>
                            {!Capacitor.isNativePlatform() && (
                                <p className="text-xs text-slate-500 dark:text-gray-400">
                                    {t('settings.notificationNativeHint')}
                                </p>
                            )}
                        </div>
                    </section>

                    {/* Purchases Section */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-3 text-emerald-400 mb-2">
                            <RefreshCcw size={24} />
                            <h2 className="text-xl font-semibold">{t('settings.restorePurchases', 'Restore Purchases')}</h2>
                        </div>
                        <div className="bg-white dark:bg-white/5 p-6 rounded-xl border border-slate-200 dark:border-white/10 space-y-4 backdrop-blur-md shadow-sm dark:shadow-none">
                            <p className="text-sm text-slate-500 dark:text-gray-400">
                                {t('settings.restorePurchasesDesc', 'Restore non-consumable purchases such as ad removal.')}
                            </p>
                            <button
                                onClick={() => { playSound('click'); handleRestorePurchases(); }}
                                disabled={isRestoring}
                                className="w-full px-5 py-3 rounded-xl bg-emerald-100 dark:bg-emerald-600/80 hover:bg-emerald-200 dark:hover:bg-emerald-600 text-emerald-700 dark:text-white font-bold transition-colors disabled:opacity-50"
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
                        <div className="bg-white dark:bg-white/5 p-6 rounded-xl border border-slate-200 dark:border-white/10 space-y-4 backdrop-blur-md shadow-sm dark:shadow-none">
                            <p className="text-sm text-slate-500 dark:text-gray-400">
                                {t('settings.tutorialDesc', '앱 사용 방법을 다시 확인하고 싶다면 튜토리얼을 다시 보세요.')}
                            </p>
                            <button
                                onClick={() => {
                                    playSound('click');
                                    resetHomeTutorial();
                                    navigate('/');
                                }}
                                className="w-full px-5 py-3 rounded-xl bg-amber-100 dark:bg-amber-600/80 hover:bg-amber-200 dark:hover:bg-amber-600 text-amber-700 dark:text-white font-bold transition-colors"
                            >
                                {t('settings.viewTutorial', '튜토리얼 다시 보기')}
                            </button>
                        </div>
                    </section>

                    {/* Support Section */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-3 text-emerald-400 mb-2">
                            <MessageCircleQuestion size={24} />
                            <h2 className="text-xl font-semibold">{t('settings.support', '문의하기')}</h2>
                        </div>
                        <div className="bg-white dark:bg-white/5 p-6 rounded-xl border border-slate-200 dark:border-white/10 space-y-4 backdrop-blur-md shadow-sm dark:shadow-none">
                            <p className="text-sm text-slate-500 dark:text-gray-400">
                                {t('settings.supportDesc', '문제 신고, 오류 제보, 기타 문의를 남길 수 있습니다.')}
                            </p>
                            <button
                                onClick={() => { playSound('click'); navigate('/support'); }}
                                className="w-full px-5 py-3 rounded-xl bg-emerald-100 dark:bg-emerald-600/80 hover:bg-emerald-200 dark:hover:bg-emerald-600 text-emerald-700 dark:text-white font-bold transition-colors"
                            >
                                {t('settings.goToSupport', '고객지원 열기')}
                            </button>
                        </div>
                    </section>

                    {/* Privacy Policy Section */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-3 text-sky-400 mb-2">
                            <Shield size={24} />
                            <h2 className="text-xl font-semibold">{t('settings.privacyPolicy', '개인정보 처리방침')}</h2>
                        </div>
                        <div className="bg-white dark:bg-white/5 p-6 rounded-xl border border-slate-200 dark:border-white/10 space-y-4 backdrop-blur-md shadow-sm dark:shadow-none">
                            <p className="text-sm text-slate-500 dark:text-gray-400">
                                {t('settings.privacyPolicyDesc', '서비스 이용에 필요한 개인정보 처리 내용을 확인할 수 있습니다.')}
                            </p>
                            <button
                                onClick={() => { playSound('click'); navigate('/privacy'); }}
                                className="w-full px-5 py-3 rounded-xl bg-sky-100 dark:bg-sky-600/80 hover:bg-sky-200 dark:hover:bg-sky-600 text-sky-700 dark:text-white font-bold transition-colors"
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
                            <div className="bg-white dark:bg-white/5 p-6 rounded-xl border border-red-200 dark:border-red-400/30 space-y-4 backdrop-blur-md shadow-sm dark:shadow-none">
                                <p className="text-sm text-slate-500 dark:text-gray-400">
                                    {t('settings.adminDesc', '관리자 전용 페이지로 이동합니다.')}
                                </p>
                                <button
                                    onClick={() => { playSound('click'); navigate('/admin'); }}
                                    className="w-full px-5 py-3 rounded-xl bg-red-100 dark:bg-red-600/80 hover:bg-red-200 dark:hover:bg-red-600 text-red-700 dark:text-white font-bold transition-colors"
                                >
                                    {t('settings.goToAdmin', '관리자 화면 가기')}
                                </button>
                            </div>
                        </section>
                    )}

                    {/* App Version */}
                    {appVersion && (
                        <div className="text-center text-gray-500 text-sm mt-8 pb-4">
                            version : {appVersion}
                        </div>
                    )}

                </div>
            </div>

            {isLanguageModalOpen && (
                <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full max-w-md max-h-[75vh] bg-slate-50 dark:bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
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
                                className="w-full rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:focus:border-blue-400/70"
                            />
                        </div>
                        <div className="max-h-[52vh] overflow-y-auto p-3 space-y-2">
                            {filteredLanguages.map((lang) => (
                                <button
                                    key={lang.code}
                                    onClick={() => changeLanguage(lang.code)}
                                    className={`w-full p-4 rounded-xl flex items-center justify-between border transition-all duration-200
                                        ${isLanguageSelected(lang.code)
                                            ? 'bg-blue-50 dark:bg-blue-600/30 border-blue-400 dark:border-blue-500 shadow-sm dark:shadow-[0_0_15px_rgba(59,130,246,0.35)]'
                                            : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10'}
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
                                <div className="text-center text-sm text-slate-500 dark:text-gray-400 py-6">
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
