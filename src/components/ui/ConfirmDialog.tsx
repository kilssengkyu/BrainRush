import { motion } from 'framer-motion';

interface ConfirmDialogProps {
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}

const overlayVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
};

const modalVariants = {
    initial: { scale: 0.8, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.8, opacity: 0 },
};

const ConfirmDialog = ({ title, message, onConfirm, onCancel }: ConfirmDialogProps) => {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
                variants={overlayVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                onClick={onCancel}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
                variants={modalVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="relative bg-gray-800 rounded-2xl p-6 w-full max-w-sm border border-gray-700 shadow-2xl"
            >
                <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                <p className="text-gray-300 mb-6">{message}</p>
                <div className="flex gap-3 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
                    >
                        Confirm
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default ConfirmDialog;
