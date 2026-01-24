import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, Play, Loader2, Gift } from 'lucide-react';
import { useSound } from '../../contexts/SoundContext';

interface AdModalProps {
    isOpen: boolean;
    onClose: () => void;
    onReward: () => void;
}

const AdModal: React.FC<AdModalProps> = ({ isOpen, onClose, onReward }) => {
    const { t } = useTranslation();
    const { playSound } = useSound();
    const [adState, setAdState] = useState<'idle' | 'playing' | 'rewarded'>('idle');
    const [timeLeft, setTimeLeft] = useState(5);

    useEffect(() => {
        if (!isOpen) {
            setAdState('idle');
            setTimeLeft(5);
        }
    }, [isOpen]);

    const startAd = () => {
        playSound('click');
        setAdState('playing');

        let timer = 5;
        setTimeLeft(timer);

        const interval = setInterval(() => {
            timer -= 1;
            setTimeLeft(timer);
            if (timer <= 0) {
                clearInterval(interval);
                setAdState('rewarded');
                onReward(); // Grant reward immediately
                // playSound handled by parent
            }
        }, 1000);
    };

    // No longer needed, button calls onClose directly
    // const handleClaim = () => { ... }

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
                            {adState === 'idle' && (
                                <>
                                    <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mb-4">
                                        <Play className="w-10 h-10 text-blue-400 fill-current" />
                                    </div>
                                    <p className="text-gray-300 mb-6">
                                        {t('ad.watchDesc', 'Watch a short ad to get 2 Pencils!')}
                                    </p>
                                    <button
                                        onClick={startAd}
                                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all active:scale-95 shadow-lg shadow-blue-500/20"
                                    >
                                        {t('ad.watchBtn', 'Watch Ad')}
                                    </button>
                                </>
                            )}

                            {adState === 'playing' && (
                                <>
                                    <div className="w-full h-40 bg-black rounded-xl mb-4 flex flex-col items-center justify-center border border-gray-700 relative overflow-hidden">
                                        {/* Fake Ad Content */}
                                        <div className="absolute inset-0 bg-gradient-to-br from-purple-900 to-blue-900 opacity-50" />
                                        <Loader2 className="w-12 h-12 text-white animate-spin relative z-10" />
                                        <p className="text-white font-bold mt-4 relative z-10">
                                            ADVERTISEMENT
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
