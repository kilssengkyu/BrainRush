import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, Play, Loader2, Gift } from 'lucide-react';
import { useSound } from '../../contexts/SoundContext';
import { Capacitor } from '@capacitor/core';
import { AdMob, RewardAdPluginEvents } from '@capacitor-community/admob';

interface AdModalProps {
    isOpen: boolean;
    onClose: () => void;
    onReward: () => void;
}

const AdModal: React.FC<AdModalProps> = ({ isOpen, onClose, onReward }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [adState, setAdState] = useState<'idle' | 'loading' | 'playing' | 'rewarded'>('idle');
    const [timeLeft, setTimeLeft] = useState(5);

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
                setAdState('rewarded');
                onReward();
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
    }, [onReward]);

    // Reset state on open/close
    useEffect(() => {
        if (!isOpen) {
            setAdState('idle');
            setTimeLeft(5);
        }
    }, [isOpen]);

    const startAd = async () => {
        playSound('click');

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
                    setAdState('rewarded');
                    onReward();
                }
            }, 1000);
            return;
        }

        // Native AdMob Mode
        try {
            setAdState('loading');
            // Test ID for Android Rewarded Video
            const adId = 'ca-app-pub-3940256099942544/5224354917';

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
                                {t('ad.title', 'Get Pencils')}
                            </h3>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-full hover:bg-gray-700 transition-colors"
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
                                            <Play className="w-10 h-10 text-blue-400 fill-current" />
                                        )}
                                    </div>
                                    <p className="text-gray-300 mb-6">
                                        {adState === 'loading'
                                            ? t('ad.loading', 'Loading Ad...')
                                            : t('ad.watchDesc', 'Watch a short ad to get 2 Pencils!')}
                                    </p>
                                    <button
                                        onClick={startAd}
                                        disabled={adState === 'loading'}
                                        className={`w-full py-3 font-bold rounded-xl transition-all shadow-lg 
                                            ${adState === 'loading'
                                                ? 'bg-gray-600 cursor-not-allowed opacity-50'
                                                : 'bg-blue-600 hover:bg-blue-500 text-white active:scale-95 shadow-blue-500/20'}`}
                                    >
                                        {adState === 'loading' ? t('common.loading', 'Loading...') : t('ad.watchBtn', 'Watch Ad')}
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
                                        <div className="text-4xl">✏️</div>
                                    </div>
                                    <h4 className="text-2xl font-bold text-white mb-2">
                                        +2 {t('ad.pencils', 'Pencils')}!
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
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default AdModal;
