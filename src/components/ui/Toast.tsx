import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

interface ToastProps {
    message: string;
    type: 'success' | 'error' | 'info';
    onClose: () => void;
}

const toastVariants = {
    initial: { opacity: 0, y: -16, scale: 0.96 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.2 } },
};

const Toast = ({ message, type, onClose }: ToastProps) => {
    let icon;
    let bgClass;
    let accentClass;

    switch (type) {
        case 'success':
            icon = <CheckCircle className="w-5 h-5 text-green-400" />;
            bgClass = 'bg-gray-900/95 border-green-500/50';
            accentClass = 'bg-green-400';
            break;
        case 'error':
            icon = <XCircle className="w-5 h-5 text-red-400" />;
            bgClass = 'bg-gray-900/95 border-red-500/50';
            accentClass = 'bg-red-400';
            break;
        default:
            icon = <Info className="w-5 h-5 text-blue-400" />;
            bgClass = 'bg-gray-900/95 border-blue-500/50';
            accentClass = 'bg-blue-400';
    }

    return (
        <motion.div
            variants={toastVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={`pointer-events-auto relative overflow-hidden flex items-center gap-3 px-4 py-3.5 rounded-2xl border shadow-2xl backdrop-blur-md w-full ${bgClass}`}
        >
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${accentClass}`} />
            {icon}
            <span className="text-white text-[15px] leading-snug font-semibold flex-1">{message}</span>
            <button onClick={onClose} className="text-gray-300 hover:text-white transition-colors p-1">
                <X className="w-5 h-5" />
            </button>
        </motion.div>
    );
};

export default Toast;
