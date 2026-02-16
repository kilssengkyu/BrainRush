import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, Loader2, Gift, BookOpen } from 'lucide-react';
import { useSound } from '../../contexts/SoundContext';
import { Capacitor } from '@capacitor/core';
import { AdMob, RewardAdPluginEvents } from '@capacitor-community/admob';

interface AdModalProps {
    isOpen: boolean;
    onClose: () => void;
    onReward: () => Promise<'ok' | 'limit' | 'error'>;
    adRemaining?: number;
    adLimit?: number;
    adsRemoved?: boolean;
    variant?: 'pencils' | 'practice_notes';
}

const AdModal: React.FC<AdModalProps> = ({ isOpen, onClose, onReward, adRemaining, adLimit, adsRemoved, variant = 'pencils' }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [adState, setAdState] = useState<'idle' | 'loading' | 'playing' | 'rewarded' | 'limit' | 'error'>('idle');
    const [timeLeft, setTimeLeft] = useState(5);
    const hasLimit = typeof adRemaining === 'number' && typeof adLimit === 'number';
    const isLimitReached = hasLimit && adRemaining <= 0;
    const rewardAmount = variant === 'practice_notes' ? 2 : 1;
    const copy = variant === 'practice_notes'
        ? {
            titleKey: 'ad.titlePracticeNotes',
            titleFallback: 'Get Practice Notes',
            watchDescKey: 'ad.watchDescPracticeNotes',
            watchDescFallback: 'Watch a short ad to get 2 Practice Notes!',
            adFreeDescKey: 'ad.adFreeDescPracticeNotes',
            adFreeDescFallback: 'Ad-free reward. Get 2 Practice Notes instantly.',
            claimBtnKey: 'ad.claimBtnPracticeNotes',
            claimBtnFallback: 'Get Practice Notes',
            rewardLabelKey: 'ad.practiceNotes',
            rewardLabelFallback: 'Practice Notes',
            rewardIcon: <BookOpen className="w-10 h-10 text-green-400" />
        }
        : {
            titleKey: 'ad.title',
            titleFallback: 'Get Pencils',
            watchDescKey: 'ad.watchDesc',
            watchDescFallback: 'Watch a short ad to get 2 Pencils!',
            adFreeDescKey: 'ad.adFreeDesc',
            adFreeDescFallback: 'Ad-free reward. Get 2 Pencils instantly.',
            claimBtnKey: 'ad.claimBtn',
            claimBtnFallback: 'Get Pencils',
            rewardLabelKey: 'ad.pencils',
            rewardLabelFallback: 'Pencils',
            rewardIcon: (
                <img
                    src="/images/icon/icon_pen.png"
                    alt="Pencil"
                    className="w-10 h-10 object-contain"
                />
            )
        };

    const resetForcedAdCounter = useCallback(() => {
        import('../../utils/AdLogic').then(({ AdLogic }) => AdLogic.resetAdCounter());
    }, []);

    const grantReward = useCallback(async () => {
        try {
            const result = await onReward();
            if (result === 'ok') {
                setAdState('rewarded');
            } else if (result === 'limit') {
                setAdState('limit');
            } else {
                setAdState('error');
            }
        } catch (err) {
            console.error('Reward grant failed:', err);
            setAdState('error');
        }
    }, [onReward]);

    // Initialize AdMob on mount
    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            AdMob.initialize().catch(err => console.error('AdMob init failed', err));
        }
    }, []);

    // Setup Listeners and Cleanup
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        let rewardListener: any;
        let dismissListener: any;
        let failedLoadListener: any;

        const setupListeners = async () => {
            rewardListener = await AdMob.addListener(RewardAdPluginEvents.Rewarded, (reward) => {
                console.log('AdMob Reward:', reward);
                // Fair Ad Logic: reset as soon as the ad watch is completed.
                resetForcedAdCounter();
                grantReward();
            });

            dismissListener = await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
                console.log('AdMob Dismissed');
                // Use a timeout to ensure state updates if dismissed immediately after reward
                // If not rewarded (closed early), we might want to reset to idle or close.
                // But if 'rewarded' state is set, we let the user close the modal via "Close" button.
                // If closed without reward, just reset.
                setAdState(prev => prev === 'rewarded' ? 'rewarded' : 'idle');
            });

            failedLoadListener = await AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (err) => {
                console.error('AdMob Failed to Load:', err);
                setAdState('idle');
                // Optional: alert('Ad failed to load');
            });
        };

        setupListeners();

        return () => {
            if (rewardListener) rewardListener.remove();
            if (dismissListener) dismissListener.remove();
            if (failedLoadListener) failedLoadListener.remove();
        };
    }, [grantReward, resetForcedAdCounter]);

    // Reset state on open/close
    useEffect(() => {
        if (!isOpen) {
            setAdState('idle');
            setTimeLeft(5);
        }
    }, [isOpen]);

    const startAd = async () => {
        playSound('click');
        if (isLimitReached) {
            setAdState('limit');
            return;
        }
        if (adsRemoved) {
            setAdState('loading');
            await grantReward();
            return;
        }

        if (!Capacitor.isNativePlatform()) {
            // Web / Fallback Mode
            setAdState('playing');
            let timer = 5;
            setTimeLeft(timer);
            const interval = setInterval(() => {
                timer -= 1;
                setTimeLeft(timer);
                if (timer <= 0) {
                    clearInterval(interval);
                    resetForcedAdCounter();
                    grantReward();
                }
            }, 1000);
            return;
        }

        // Native AdMob Mode
        try {
            setAdState('loading');
            const platform = Capacitor.getPlatform();
            const adsMode = String(import.meta.env.VITE_ADS_MODE ?? import.meta.env.VITE_APP_ENV ?? '').toLowerCase();
            const isProdAds = adsMode === 'prod' || adsMode === 'production';
            const adId = isProdAds
                ? (platform === 'ios'
                    ? 'ca-app-pub-4893861547827379/8300296145'
                    : 'ca-app-pub-4893861547827379/1519157571')
                : (platform === 'ios'
                    ? 'ca-app-pub-3940256099942544/1712485313'
                    : 'ca-app-pub-3940256099942544/5224354917');

            await AdMob.prepareRewardVideoAd({ adId });
            await AdMob.showRewardVideoAd();
            // State change to 'playing' is handled implicitly by the view overlay, 
            // but we can set it here to update our background modal UI if visible.
            setAdState('playing');
        } catch (err) {
            console.error('Ad preparation failed', err);
            setAdState('idle');
            // Allow retry
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20 }}
                        className="bg-gray-800 w-full max-w-sm rounded-3xl border border-gray-700 shadow-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex justify-between items-center p-4 border-b border-gray-700">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <Gift className="text-yellow-400" />
                                {t(copy.titleKey, copy.titleFallback)}
                            </h3>
                            <button
                                onClick={onClose}
                                disabled={adState === 'loading' || adState === 'playing'}
                                className={`p-2 rounded-full transition-colors ${(adState === 'loading' || adState === 'playing')
                                    ? 'opacity-30 cursor-not-allowed'
                                    : 'hover:bg-gray-700'
                                    }`}
                            >
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 flex flex-col items-center text-center">
                            {(adState === 'idle' || adState === 'loading') && (
                                <>
                                    <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mb-4">
                                        {adState === 'loading' ? (
                                            <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
                                        ) : (
                                            <img
                                                src="/images/icon/icon_tv.png"
                                                alt="Watch Ad"
                                                className="w-10 h-10 object-contain"
                                            />
                                        )}
                                    </div>
                                    <p className="text-gray-300 mb-6">
                                        {adState === 'loading'
                                            ? adsRemoved
                                                ? t('ad.granting', 'Granting reward...')
                                                : t('ad.loading', 'Loading Ad...')
                                            : adsRemoved
                                                ? t(copy.adFreeDescKey, copy.adFreeDescFallback)
                                                : t(copy.watchDescKey, copy.watchDescFallback)}
                                    </p>
                                    {hasLimit && (
                                        <p className={`text-xs font-mono mb-4 ${isLimitReached ? 'text-red-400' : 'text-gray-400'}`}>
                                            {isLimitReached
                                                ? t('ad.limitReached', 'Daily ad limit reached.')
                                                : t('ad.remaining', 'Remaining today: {{count}}/{{limit}}', { count: adRemaining, limit: adLimit })}
                                        </p>
                                    )}
                                    <button
                                        onClick={startAd}
                                        disabled={adState === 'loading' || isLimitReached}
                                        className={`w-full py-3 font-bold rounded-xl transition-all shadow-lg 
                                            ${(adState === 'loading' || isLimitReached)
                                                ? 'bg-gray-600 cursor-not-allowed opacity-50'
                                                : 'bg-blue-600 hover:bg-blue-500 text-white active:scale-95 shadow-blue-500/20'}`}
                                    >
                                        {adState === 'loading'
                                            ? t('common.loading', 'Loading...')
                                            : isLimitReached
                                                ? t('ad.limitReached', 'Daily ad limit reached.')
                                                : adsRemoved
                                                    ? t(copy.claimBtnKey, copy.claimBtnFallback)
                                                    : t('ad.watchBtn', 'Watch Ad')}
                                    </button>
                                </>
                            )}

                            {adState === 'playing' && !Capacitor.isNativePlatform() && (
                                <>
                                    <div className="w-full h-40 bg-black rounded-xl mb-4 flex flex-col items-center justify-center border border-gray-700 relative overflow-hidden">
                                        {/* Fake Ad Content (Web Only) */}
                                        <div className="absolute inset-0 bg-gradient-to-br from-purple-900 to-blue-900 opacity-50" />
                                        <Loader2 className="w-12 h-12 text-white animate-spin relative z-10" />
                                        <p className="text-white font-bold mt-4 relative z-10">
                                            DEMO ADVERTISEMENT
                                        </p>
                                        <div className="absolute top-2 right-3 text-xs bg-black/50 px-2 py-1 rounded text-white font-mono">
                                            {timeLeft}s
                                        </div>
                                    </div>
                                    <p className="text-gray-400 text-sm animate-pulse">
                                        {t('ad.watching', 'Watching ad...')}
                                    </p>
                                </>
                            )}

                            {/* Native 'playing' state is handled by the fullscreen ad, so this UI is covered or waiting in background */}
                            {adState === 'playing' && Capacitor.isNativePlatform() && (
                                <>
                                    <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mb-4">
                                        <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
                                    </div>
                                    <p className="text-gray-300 mb-6">
                                        {t('ad.playing', 'Ad is playing...')}
                                    </p>
                                </>
                            )}

                            {adState === 'rewarded' && (
                                <>
                                    <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-4 animate-bounce">
                                        {copy.rewardIcon}
                                    </div>
                                    <h4 className="text-2xl font-bold text-white mb-2">
                                        +{rewardAmount} {t(copy.rewardLabelKey, copy.rewardLabelFallback)}!
                                    </h4>
                                    <p className="text-gray-400 mb-6">
                                        {t('ad.success', 'Reward earned successfully.')}
                                    </p>
                                    <button
                                        onClick={() => { playSound('click'); onClose(); }}
                                        className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl transition-all active:scale-95"
                                    >
                                        {t('common.close', 'Close')}
                                    </button>
                                </>
                            )}

                            {adState === 'limit' && (
                                <>
                                    <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                                        <div className="text-3xl">⛔</div>
                                    </div>
                                    <h4 className="text-2xl font-bold text-white mb-2">
                                        {t('ad.limitReached', 'Daily ad limit reached.')}
                                    </h4>
                                    <p className="text-gray-400 mb-6">
                                        {t('ad.limitReachedDesc', 'Come back tomorrow to watch more ads.')}
                                    </p>
                                    <button
                                        onClick={() => { playSound('click'); onClose(); }}
                                        className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl transition-all active:scale-95"
                                    >
                                        {t('common.close', 'Close')}
                                    </button>
                                </>
                            )}

                            {adState === 'error' && (
                                <>
                                    <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                                        <div className="text-3xl">⚠️</div>
                                    </div>
                                    <h4 className="text-2xl font-bold text-white mb-2">
                                        {t('ad.rewardFailed', 'Reward failed.')}
                                    </h4>
                                    <p className="text-gray-400 mb-6">
                                        {t('ad.rewardFailedDesc', 'Please try again later.')}
                                    </p>
                                    <button
                                        onClick={() => { playSound('click'); onClose(); }}
                                        className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl transition-all active:scale-95"
                                    >
                                        {t('common.close', 'Close')}
                                    </button>
                                </>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default AdModal;
