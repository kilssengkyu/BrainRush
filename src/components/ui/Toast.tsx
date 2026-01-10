import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

interface ToastProps {
    message: string;
    type: 'success' | 'error' | 'info';
    onClose: () => void;
}

const toastVariants = {
    initial: { opacity: 0, y: 50, scale: 0.9 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } },
};

const Toast = ({ message, type, onClose }: ToastProps) => {
    let icon;
    let bgClass;

    switch (type) {
        case 'success':
            icon = <CheckCircle className="w-5 h-5 text-green-400" />;
            bgClass = 'bg-gray-800 border-green-500/50';
            break;
        case 'error':
            icon = <XCircle className="w-5 h-5 text-red-400" />;
            bgClass = 'bg-gray-800 border-red-500/50';
            break;
        default:
            icon = <Info className="w-5 h-5 text-blue-400" />;
            bgClass = 'bg-gray-800 border-blue-500/50';
    }

    return (
        <motion.div
            variants={toastVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-md min-w-[300px] ${bgClass}`}
        >
            {icon}
            <span className="text-white text-sm font-medium flex-1">{message}</span>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
            </button>
        </motion.div>
    );
};

export default Toast;
