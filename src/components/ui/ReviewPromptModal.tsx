import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { InAppReview } from '@capacitor-community/in-app-review';
import { Capacitor } from '@capacitor/core';

interface ReviewPromptModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SUPPORT_URL = 'https://brainrush.channel.io';

const ReviewPromptModal: React.FC<ReviewPromptModalProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();

    const handleEnjoyYes = async () => {
        try {
            if (Capacitor.isNativePlatform()) {
                await InAppReview.requestReview();
            } else {
                console.log('[ReviewPrompt] Web platform — skipping native review');
            }
        } catch (err) {
            console.error('[ReviewPrompt] Failed to request review:', err);
        }
        onClose();
    };

    const handleEnjoyNo = () => {
        try {
            window.open(SUPPORT_URL, '_blank');
        } catch {
            // silently ignore
        }
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key="review-prompt-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.7, opacity: 0, y: 30 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                        className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-3xl p-8 max-w-sm w-full border border-gray-600/50 shadow-2xl text-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-5 text-6xl">🎮</div>

                        <h3 className="text-xl font-black text-white mb-2">
                            {t('review.enjoyTitle', '게임 재밌으셨나요?')}
                        </h3>

                        <p className="text-gray-400 text-sm mb-8">
                            {t('review.enjoySubtitle', '리뷰 한 줄이 큰 힘이 됩니다!')}
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={handleEnjoyNo}
                                className="flex-1 py-3.5 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold rounded-xl transition active:scale-95"
                            >
                                {t('review.enjoyNo', '별로요 😐')}
                            </button>
                            <button
                                onClick={handleEnjoyYes}
                                className="flex-1 py-3.5 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl transition active:scale-95 shadow-lg shadow-blue-500/25"
                            >
                                {t('review.enjoyYes', '네! 😊')}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ReviewPromptModal;
