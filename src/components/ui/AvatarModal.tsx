import React from 'react';
import { X } from 'lucide-react';

interface AvatarModalProps {
    isOpen: boolean;
    onClose: () => void;
    src: string | null;
    alt?: string;
}

const AvatarModal: React.FC<AvatarModalProps> = ({ isOpen, onClose, src, alt }) => {
    if (!isOpen || !src) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={onClose}>
            <div
                className="relative max-w-md w-full bg-gray-900 rounded-3xl border border-gray-700 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 p-2 rounded-full bg-black/60 hover:bg-black/80 transition-colors text-white"
                    aria-label="Close"
                >
                    <X className="w-5 h-5" />
                </button>
                <div className="w-full aspect-square bg-gray-950 flex items-center justify-center">
                    <img src={src} alt={alt || 'Avatar'} className="w-full h-full object-cover" />
                </div>
            </div>
        </div>
    );
};

export default AvatarModal;
