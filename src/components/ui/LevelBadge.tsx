import React from 'react';

interface LevelBadgeProps {
    level?: number | null;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    className?: string;
}

const LevelBadge: React.FC<LevelBadgeProps> = ({ level, size = 'sm', className = '' }) => {
    const safeLevel = Math.max(1, Math.floor(level ?? 1));
    const sizeClass = {
        xs: 'w-5 h-5',
        sm: 'w-7 h-7',
        md: 'w-9 h-9',
        lg: 'w-11 h-11'
    }[size];
    const valueClass = {
        xs: 'text-[10px]',
        sm: 'text-[12px]',
        md: 'text-[15px]',
        lg: 'text-[18px]'
    }[size];

    return (
        <div
            className={`rounded-full ${sizeClass} bg-gradient-to-br from-yellow-300 to-orange-500 text-gray-900 font-black flex items-center justify-center leading-none shadow-md ${className}`}
            title={`Level ${safeLevel}`}
        >
            <span className={`${valueClass}`}>{safeLevel}</span>
        </div>
    );
};

export default LevelBadge;
